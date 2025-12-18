"""
SkuldVault - Gestión segura de secrets y credenciales

Esta librería provee acceso a secrets desde múltiples fuentes:
- Variables de entorno
- Archivos .env
- Local Vault (encriptado AES-256-GCM, para desarrollo y bots standalone)
- Orchestrator Vault (cuando está disponible)
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault

Los secrets NUNCA se loguean ni se exponen en reportes.

Para industrias reguladas (HIPAA, HITECH, PCI-DSS), usar LOCAL o ORCHESTRATOR
con encriptación AES-256-GCM y audit logging habilitado.
"""

import os
import json
import hashlib
import base64
from pathlib import Path
from typing import Any, Dict, Optional, Union
from dataclasses import dataclass
from enum import Enum
from robot.api.deco import keyword, library
from robot.api import logger


class VaultProvider(str, Enum):
    """Proveedores de vault soportados"""
    ENV = "env"
    DOTENV = "dotenv"
    LOCAL = "local"  # Vault local encriptado (AES-256-GCM)
    ORCHESTRATOR = "orchestrator"
    AWS = "aws"
    AZURE = "azure"
    HASHICORP = "hashicorp"


@dataclass
class SecretValue:
    """Representa un valor secreto con metadata"""
    name: str
    value: str
    provider: VaultProvider
    cached: bool = False

    def __repr__(self) -> str:
        # Nunca mostrar el valor real
        return f"SecretValue(name='{self.name}', provider='{self.provider}', value='***')"

    def __str__(self) -> str:
        # Nunca mostrar el valor real
        return "***REDACTED***"


@library(scope="GLOBAL", auto_keywords=True)
class SkuldVault:
    """
    Librería de gestión de secrets para Skuldbot.

    Soporta múltiples backends de vault y provee acceso seguro
    a credenciales sin exponerlas en logs o reportes.

    Example:
        | Library | SkuldVault |
        | ${api_key}= | Get Secret | API_KEY |
        | ${db_creds}= | Get Secret | DATABASE | provider=orchestrator |
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(
        self,
        default_provider: str = "env",
        dotenv_path: Optional[str] = None,
        local_vault_path: Optional[str] = None,
        local_vault_password: Optional[str] = None,
        orchestrator_url: Optional[str] = None,
        orchestrator_token: Optional[str] = None,
        cache_secrets: bool = True,
        enable_audit: bool = True,
    ):
        """
        Inicializa el vault.

        Args:
            default_provider: Proveedor por defecto (env, dotenv, local, orchestrator, aws, azure, hashicorp)
            dotenv_path: Ruta al archivo .env (default: .env en directorio actual)
            local_vault_path: Ruta al vault local (default: .skuldbot en directorio actual)
            local_vault_password: Master password para el vault local (o env SKULDBOT_VAULT_PASSWORD)
            orchestrator_url: URL del Orchestrator API
            orchestrator_token: Token de autenticación del Orchestrator
            cache_secrets: Si debe cachear secrets en memoria
            enable_audit: Habilitar audit logging para vault local
        """
        self.default_provider = VaultProvider(default_provider)
        self.dotenv_path = Path(dotenv_path) if dotenv_path else Path(".env")
        self.local_vault_path = Path(local_vault_path) if local_vault_path else Path(".skuldbot")
        self.local_vault_password = local_vault_password or os.getenv("SKULDBOT_VAULT_PASSWORD")
        self.orchestrator_url = orchestrator_url or os.getenv("SKULDBOT_ORCHESTRATOR_URL")
        self.orchestrator_token = orchestrator_token or os.getenv("SKULDBOT_ORCHESTRATOR_TOKEN")
        self.cache_secrets = cache_secrets
        self.enable_audit = enable_audit

        self._cache: Dict[str, SecretValue] = {}
        self._dotenv_loaded = False
        self._dotenv_vars: Dict[str, str] = {}
        self._local_vault = None

        # Cargar .env si existe
        self._load_dotenv()

        # Intentar inicializar vault local si está configurado
        self._init_local_vault()

    def _init_local_vault(self) -> None:
        """Inicializa el vault local si está configurado"""
        if not self.local_vault_password:
            return

        try:
            from skuldbot.libs.local_vault import LocalVault

            self._local_vault = LocalVault(
                str(self.local_vault_path),
                enable_audit=self.enable_audit
            )

            if self._local_vault.exists:
                self._local_vault.unlock(self.local_vault_password)
                logger.info(f"Local vault unlocked at {self.local_vault_path}")
            else:
                logger.debug(f"Local vault not found at {self.local_vault_path}")

        except ImportError:
            logger.warn("cryptography not installed, local vault disabled")
        except Exception as e:
            logger.warn(f"Could not initialize local vault: {e}")
            self._local_vault = None

    def _get_from_local(self, name: str) -> Optional[str]:
        """Obtiene secret del vault local encriptado"""
        if not self._local_vault or not self._local_vault.is_unlocked:
            return None

        try:
            return self._local_vault.get_secret(name)
        except Exception:
            return None

    def _load_dotenv(self) -> None:
        """Carga variables desde archivo .env"""
        if self._dotenv_loaded:
            return

        if self.dotenv_path.exists():
            try:
                with open(self.dotenv_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, _, value = line.partition('=')
                            key = key.strip()
                            value = value.strip()
                            # Remover comillas si las hay
                            if value.startswith('"') and value.endswith('"'):
                                value = value[1:-1]
                            elif value.startswith("'") and value.endswith("'"):
                                value = value[1:-1]
                            self._dotenv_vars[key] = value
                logger.info(f"Loaded {len(self._dotenv_vars)} variables from .env")
            except Exception as e:
                logger.warn(f"Could not load .env file: {e}")

        self._dotenv_loaded = True

    def _get_from_env(self, name: str) -> Optional[str]:
        """Obtiene secret de variables de entorno"""
        return os.getenv(name)

    def _get_from_dotenv(self, name: str) -> Optional[str]:
        """Obtiene secret de archivo .env"""
        self._load_dotenv()
        return self._dotenv_vars.get(name)

    def _get_from_orchestrator(self, name: str) -> Optional[str]:
        """Obtiene secret del Orchestrator vault"""
        if not self.orchestrator_url or not self.orchestrator_token:
            logger.warn("Orchestrator not configured, falling back to env")
            return None

        try:
            import urllib.request
            import urllib.error

            url = f"{self.orchestrator_url}/api/v1/vault/secrets/{name}"
            req = urllib.request.Request(url)
            req.add_header("Authorization", f"Bearer {self.orchestrator_token}")
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
                return data.get("value")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                logger.warn(f"Secret '{name}' not found in Orchestrator")
            else:
                logger.warn(f"Orchestrator error: {e}")
            return None
        except Exception as e:
            logger.warn(f"Could not fetch secret from Orchestrator: {e}")
            return None

    def _get_from_aws(self, name: str) -> Optional[str]:
        """Obtiene secret de AWS Secrets Manager"""
        try:
            import boto3
            from botocore.exceptions import ClientError

            client = boto3.client('secretsmanager')
            response = client.get_secret_value(SecretId=name)

            if 'SecretString' in response:
                return response['SecretString']
            else:
                # Binary secret
                return base64.b64decode(response['SecretBinary']).decode()
        except ImportError:
            logger.warn("boto3 not installed, cannot use AWS Secrets Manager")
            return None
        except Exception as e:
            logger.warn(f"AWS Secrets Manager error: {e}")
            return None

    def _get_from_azure(self, name: str) -> Optional[str]:
        """Obtiene secret de Azure Key Vault"""
        try:
            from azure.identity import DefaultAzureCredential
            from azure.keyvault.secrets import SecretClient

            vault_url = os.getenv("AZURE_KEYVAULT_URL")
            if not vault_url:
                logger.warn("AZURE_KEYVAULT_URL not set")
                return None

            credential = DefaultAzureCredential()
            client = SecretClient(vault_url=vault_url, credential=credential)
            secret = client.get_secret(name)
            return secret.value
        except ImportError:
            logger.warn("azure-identity/azure-keyvault-secrets not installed")
            return None
        except Exception as e:
            logger.warn(f"Azure Key Vault error: {e}")
            return None

    def _get_from_hashicorp(self, name: str) -> Optional[str]:
        """Obtiene secret de HashiCorp Vault"""
        try:
            import hvac

            vault_url = os.getenv("VAULT_ADDR", "http://localhost:8200")
            vault_token = os.getenv("VAULT_TOKEN")

            if not vault_token:
                logger.warn("VAULT_TOKEN not set")
                return None

            client = hvac.Client(url=vault_url, token=vault_token)

            # Intentar leer de KV v2 primero
            try:
                secret = client.secrets.kv.v2.read_secret_version(path=name)
                return secret['data']['data'].get('value')
            except:
                # Fallback a KV v1
                secret = client.secrets.kv.v1.read_secret(path=name)
                return secret['data'].get('value')
        except ImportError:
            logger.warn("hvac not installed, cannot use HashiCorp Vault")
            return None
        except Exception as e:
            logger.warn(f"HashiCorp Vault error: {e}")
            return None

    @keyword("Get Secret")
    def get_secret(
        self,
        name: str,
        provider: Optional[str] = None,
        default: Optional[str] = None,
    ) -> str:
        """
        Obtiene un secret del vault.

        Args:
            name: Nombre del secret
            provider: Proveedor específico (env, dotenv, orchestrator, aws, azure, hashicorp)
            default: Valor por defecto si no se encuentra

        Returns:
            Valor del secret

        Raises:
            ValueError: Si el secret no existe y no hay default

        Example:
            | ${api_key}= | Get Secret | API_KEY |
            | ${db_pass}= | Get Secret | DB_PASSWORD | provider=orchestrator |
            | ${optional}= | Get Secret | OPTIONAL_KEY | default=fallback |
        """
        # Check cache
        cache_key = f"{provider or self.default_provider}:{name}"
        if self.cache_secrets and cache_key in self._cache:
            logger.debug(f"Secret '{name}' retrieved from cache")
            return self._cache[cache_key].value

        # Determinar proveedor
        prov = VaultProvider(provider) if provider else self.default_provider

        # Obtener valor según proveedor
        value = None
        if prov == VaultProvider.ENV:
            value = self._get_from_env(name)
        elif prov == VaultProvider.DOTENV:
            value = self._get_from_dotenv(name)
        elif prov == VaultProvider.LOCAL:
            value = self._get_from_local(name)
        elif prov == VaultProvider.ORCHESTRATOR:
            value = self._get_from_orchestrator(name)
        elif prov == VaultProvider.AWS:
            value = self._get_from_aws(name)
        elif prov == VaultProvider.AZURE:
            value = self._get_from_azure(name)
        elif prov == VaultProvider.HASHICORP:
            value = self._get_from_hashicorp(name)

        # Fallback chain: proveedor -> local -> env -> dotenv -> default
        if value is None and prov != VaultProvider.LOCAL:
            value = self._get_from_local(name)
        if value is None and prov != VaultProvider.ENV:
            value = self._get_from_env(name)
        if value is None and prov != VaultProvider.DOTENV:
            value = self._get_from_dotenv(name)
        if value is None:
            value = default

        if value is None:
            raise ValueError(f"Secret '{name}' not found in any vault")

        # Cache
        if self.cache_secrets:
            self._cache[cache_key] = SecretValue(
                name=name,
                value=value,
                provider=prov,
                cached=True,
            )

        # Log sin exponer el valor
        logger.info(f"Secret '{name}' retrieved from {prov.value}")
        return value

    @keyword("Get Secret As Dictionary")
    def get_secret_as_dictionary(
        self,
        name: str,
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Obtiene un secret que contiene JSON como diccionario.

        Args:
            name: Nombre del secret
            provider: Proveedor específico

        Returns:
            Diccionario con los valores del secret

        Example:
            | ${creds}= | Get Secret As Dictionary | DATABASE_CREDENTIALS |
            | Log | Host: ${creds}[host] |
        """
        value = self.get_secret(name, provider)
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            raise ValueError(f"Secret '{name}' is not valid JSON")

    @keyword("Set Secret")
    def set_secret(
        self,
        name: str,
        value: str,
        provider: Optional[str] = None,
        description: Optional[str] = None,
    ) -> None:
        """
        Guarda un secret en el vault (LOCAL y ORCHESTRATOR soportados).

        Args:
            name: Nombre del secret
            value: Valor a guardar
            provider: Proveedor ('local' o 'orchestrator')
            description: Descripción opcional (solo para local vault)

        Example:
            | Set Secret | API_KEY | ${key} | provider=local |
            | Set Secret | NEW_API_KEY | ${new_key} | provider=orchestrator |
        """
        prov = VaultProvider(provider) if provider else VaultProvider.LOCAL

        if prov == VaultProvider.LOCAL:
            if not self._local_vault or not self._local_vault.is_unlocked:
                raise ValueError("Local vault not configured or locked")

            self._local_vault.set_secret(name, value, description)
            logger.info(f"Secret '{name}' saved to local vault")

            # Invalidar cache
            cache_key = f"{prov}:{name}"
            if cache_key in self._cache:
                del self._cache[cache_key]

        elif prov == VaultProvider.ORCHESTRATOR:
            if not self.orchestrator_url or not self.orchestrator_token:
                raise ValueError("Orchestrator not configured")

            try:
                import urllib.request

                url = f"{self.orchestrator_url}/api/v1/vault/secrets"
                data = json.dumps({"name": name, "value": value}).encode()
                req = urllib.request.Request(url, data=data, method="POST")
                req.add_header("Authorization", f"Bearer {self.orchestrator_token}")
                req.add_header("Content-Type", "application/json")

                with urllib.request.urlopen(req, timeout=10) as response:
                    if response.status == 201:
                        logger.info(f"Secret '{name}' saved to Orchestrator")
                        # Invalidar cache
                        cache_key = f"{prov}:{name}"
                        if cache_key in self._cache:
                            del self._cache[cache_key]
            except Exception as e:
                raise ValueError(f"Could not save secret to Orchestrator: {e}")
        else:
            raise ValueError(f"Provider '{prov}' does not support writing secrets")

    @keyword("Delete Secret")
    def delete_secret(
        self,
        name: str,
        provider: Optional[str] = None,
    ) -> None:
        """
        Elimina un secret del vault (LOCAL y ORCHESTRATOR soportados).

        Args:
            name: Nombre del secret
            provider: Proveedor ('local' o 'orchestrator')

        Example:
            | Delete Secret | OLD_API_KEY | provider=local |
            | Delete Secret | OLD_API_KEY | provider=orchestrator |
        """
        prov = VaultProvider(provider) if provider else VaultProvider.LOCAL

        if prov == VaultProvider.LOCAL:
            if not self._local_vault or not self._local_vault.is_unlocked:
                raise ValueError("Local vault not configured or locked")

            self._local_vault.delete_secret(name)
            logger.info(f"Secret '{name}' deleted from local vault")

            # Invalidar cache
            cache_key = f"{prov}:{name}"
            if cache_key in self._cache:
                del self._cache[cache_key]

        elif prov == VaultProvider.ORCHESTRATOR:
            if not self.orchestrator_url or not self.orchestrator_token:
                raise ValueError("Orchestrator not configured")

            try:
                import urllib.request

                url = f"{self.orchestrator_url}/api/v1/vault/secrets/{name}"
                req = urllib.request.Request(url, method="DELETE")
                req.add_header("Authorization", f"Bearer {self.orchestrator_token}")

                with urllib.request.urlopen(req, timeout=10) as response:
                    if response.status == 204:
                        logger.info(f"Secret '{name}' deleted from Orchestrator")
                        # Invalidar cache
                        cache_key = f"{prov}:{name}"
                        if cache_key in self._cache:
                            del self._cache[cache_key]
            except Exception as e:
                raise ValueError(f"Could not delete secret from Orchestrator: {e}")
        else:
            raise ValueError(f"Provider '{prov}' does not support deleting secrets")

    @keyword("List Secrets")
    def list_secrets(self, provider: Optional[str] = None) -> list:
        """
        Lista los nombres de secrets disponibles.

        Args:
            provider: Proveedor ('local', 'dotenv', 'orchestrator')

        Returns:
            Lista de nombres de secrets

        Example:
            | ${secrets}= | List Secrets | provider=local |
            | ${secrets}= | List Secrets | provider=orchestrator |
            | Log Many | @{secrets} |
        """
        prov = VaultProvider(provider) if provider else VaultProvider.LOCAL

        if prov == VaultProvider.LOCAL:
            if not self._local_vault or not self._local_vault.is_unlocked:
                raise ValueError("Local vault not configured or locked")
            secrets = self._local_vault.list_secrets()
            return [s["name"] for s in secrets]

        elif prov == VaultProvider.DOTENV:
            self._load_dotenv()
            return list(self._dotenv_vars.keys())

        elif prov == VaultProvider.ORCHESTRATOR:
            if not self.orchestrator_url or not self.orchestrator_token:
                raise ValueError("Orchestrator not configured")

            try:
                import urllib.request

                url = f"{self.orchestrator_url}/api/v1/vault/secrets"
                req = urllib.request.Request(url)
                req.add_header("Authorization", f"Bearer {self.orchestrator_token}")

                with urllib.request.urlopen(req, timeout=10) as response:
                    data = json.loads(response.read().decode())
                    return [s["name"] for s in data.get("secrets", [])]
            except Exception as e:
                raise ValueError(f"Could not list secrets: {e}")
        else:
            raise ValueError(f"List secrets not supported for provider: {prov}")

    @keyword("Clear Secret Cache")
    def clear_secret_cache(self) -> None:
        """
        Limpia el cache de secrets.

        Example:
            | Clear Secret Cache |
        """
        self._cache.clear()
        logger.info("Secret cache cleared")

    @keyword("Secret Exists")
    def secret_exists(
        self,
        name: str,
        provider: Optional[str] = None,
    ) -> bool:
        """
        Verifica si un secret existe.

        Args:
            name: Nombre del secret
            provider: Proveedor específico

        Returns:
            True si el secret existe

        Example:
            | ${exists}= | Secret Exists | API_KEY |
            | Run Keyword If | not ${exists} | Fail | API_KEY not configured |
        """
        try:
            self.get_secret(name, provider)
            return True
        except ValueError:
            return False

    @keyword("Mask Secret In String")
    def mask_secret_in_string(
        self,
        text: str,
        secret_name: str,
        mask: str = "***",
        provider: Optional[str] = None,
    ) -> str:
        """
        Enmascara un secret en un string (útil para logging seguro).

        Args:
            text: Texto que puede contener el secret
            secret_name: Nombre del secret a enmascarar
            mask: String de reemplazo
            provider: Proveedor del secret

        Returns:
            Texto con el secret enmascarado

        Example:
            | ${safe_log}= | Mask Secret In String | Connection: ${conn_str} | DB_PASSWORD |
            | Log | ${safe_log} |
        """
        try:
            secret_value = self.get_secret(secret_name, provider)
            return text.replace(secret_value, mask)
        except ValueError:
            return text

    @keyword("Hash Secret")
    def hash_secret(
        self,
        name: str,
        algorithm: str = "sha256",
        provider: Optional[str] = None,
    ) -> str:
        """
        Retorna el hash de un secret (útil para comparaciones seguras).

        Args:
            name: Nombre del secret
            algorithm: Algoritmo de hash (sha256, sha512, md5)
            provider: Proveedor del secret

        Returns:
            Hash hexadecimal del secret

        Example:
            | ${hash}= | Hash Secret | API_KEY | algorithm=sha256 |
        """
        secret_value = self.get_secret(name, provider)

        if algorithm == "sha256":
            return hashlib.sha256(secret_value.encode()).hexdigest()
        elif algorithm == "sha512":
            return hashlib.sha512(secret_value.encode()).hexdigest()
        elif algorithm == "md5":
            return hashlib.md5(secret_value.encode()).hexdigest()
        else:
            raise ValueError(f"Unsupported hash algorithm: {algorithm}")

    # ==================== Local Vault Management Keywords ====================

    @keyword("Create Local Vault")
    def create_local_vault(self, master_password: str, vault_path: Optional[str] = None) -> None:
        """
        Crea un nuevo vault local encriptado.

        Args:
            master_password: Password maestro para el vault
            vault_path: Ruta al directorio del vault (default: .skuldbot)

        Example:
            | Create Local Vault | mi-password-seguro |
            | Create Local Vault | ${password} | vault_path=/path/to/.skuldbot |
        """
        try:
            from skuldbot.libs.local_vault import LocalVault

            path = Path(vault_path) if vault_path else self.local_vault_path
            vault = LocalVault(str(path), enable_audit=self.enable_audit)
            vault.create(master_password)

            # Usar este vault
            self._local_vault = vault
            self.local_vault_password = master_password

            logger.info(f"Local vault created at {path}")
        except Exception as e:
            raise ValueError(f"Could not create local vault: {e}")

    @keyword("Unlock Local Vault")
    def unlock_local_vault(self, master_password: str, vault_path: Optional[str] = None) -> None:
        """
        Desbloquea el vault local.

        Args:
            master_password: Password maestro
            vault_path: Ruta al directorio del vault

        Example:
            | Unlock Local Vault | mi-password-seguro |
        """
        try:
            from skuldbot.libs.local_vault import LocalVault

            path = Path(vault_path) if vault_path else self.local_vault_path
            vault = LocalVault(str(path), enable_audit=self.enable_audit)
            vault.unlock(master_password)

            self._local_vault = vault
            self.local_vault_password = master_password

            logger.info(f"Local vault unlocked at {path}")
        except Exception as e:
            raise ValueError(f"Could not unlock local vault: {e}")

    @keyword("Lock Local Vault")
    def lock_local_vault(self) -> None:
        """
        Bloquea el vault local, eliminando la clave de memoria.

        Example:
            | Lock Local Vault |
        """
        if self._local_vault:
            self._local_vault.lock()
            self._local_vault = None
            logger.info("Local vault locked")

    @keyword("Change Vault Password")
    def change_vault_password(self, old_password: str, new_password: str) -> None:
        """
        Cambia el master password del vault local.

        Args:
            old_password: Password actual
            new_password: Nuevo password

        Example:
            | Change Vault Password | old-pass | new-pass |
        """
        if not self._local_vault:
            raise ValueError("Local vault not initialized")

        self._local_vault.change_password(old_password, new_password)
        self.local_vault_password = new_password
        logger.info("Local vault password changed")

    @keyword("Get Vault Audit Log")
    def get_vault_audit_log(self, limit: int = 100) -> list:
        """
        Obtiene el log de auditoría del vault local.

        Args:
            limit: Número máximo de entradas

        Returns:
            Lista de entradas de auditoría

        Example:
            | ${log}= | Get Vault Audit Log | limit=50 |
            | Log Many | @{log} |
        """
        if not self._local_vault:
            raise ValueError("Local vault not initialized")

        return self._local_vault.get_audit_log(limit)

    @keyword("Local Vault Is Unlocked")
    def local_vault_is_unlocked(self) -> bool:
        """
        Verifica si el vault local está desbloqueado.

        Returns:
            True si está desbloqueado

        Example:
            | ${unlocked}= | Local Vault Is Unlocked |
            | Run Keyword If | not ${unlocked} | Unlock Local Vault | ${password} |
        """
        return self._local_vault is not None and self._local_vault.is_unlocked

    # ==================== Enterprise Vault Initialization Keywords ====================
    # These keywords initialize vault providers and load secrets into the global vault context
    # Secrets are loaded into ${vault.xxx} variables for use in subsequent nodes

    @keyword("Init Azure Vault")
    def init_azure_vault(
        self,
        vault_url: str,
        tenant_id: str,
        client_id: str,
        use_managed_identity: bool = False,
        secrets: list = None,
    ) -> Dict[str, Any]:
        """
        Initializes Azure Key Vault and loads specified secrets.

        Credentials are obtained from:
        - Managed Identity (if use_managed_identity=True and running in Azure)
        - Environment variable AZURE_CLIENT_SECRET (Service Principal)

        Args:
            vault_url: Azure Key Vault URL (https://myvault.vault.azure.net)
            tenant_id: Azure AD Tenant ID
            client_id: Azure AD Application (Client) ID
            use_managed_identity: Use Azure Managed Identity instead of Service Principal
            secrets: List of secret names to load (loads all if empty)

        Returns:
            Dictionary with loaded count and secret names

        Example:
            | ${result}= | Init Azure Vault | https://myvault.vault.azure.net | tenant-id | client-id |
            | ...        | secrets=${secrets_list} |
        """
        try:
            from azure.identity import DefaultAzureCredential, ClientSecretCredential, ManagedIdentityCredential
            from azure.keyvault.secrets import SecretClient

            # Choose credential based on configuration
            if use_managed_identity:
                credential = ManagedIdentityCredential()
                logger.info("Using Azure Managed Identity")
            else:
                client_secret = os.getenv("AZURE_CLIENT_SECRET")
                if not client_secret:
                    raise ValueError("AZURE_CLIENT_SECRET environment variable not set")
                credential = ClientSecretCredential(
                    tenant_id=tenant_id,
                    client_id=client_id,
                    client_secret=client_secret
                )
                logger.info("Using Azure Service Principal")

            client = SecretClient(vault_url=vault_url, credential=credential)

            loaded_secrets = []
            secrets_to_load = secrets if secrets else []

            # If no specific secrets, list all secrets
            if not secrets_to_load:
                try:
                    for secret_props in client.list_properties_of_secrets():
                        secrets_to_load.append(secret_props.name)
                except Exception as e:
                    logger.warn(f"Could not list secrets: {e}")

            # Load each secret into cache
            for secret_name in secrets_to_load:
                try:
                    secret = client.get_secret(secret_name)
                    cache_key = f"azure:{secret_name}"
                    self._cache[cache_key] = SecretValue(
                        name=secret_name,
                        value=secret.value,
                        provider=VaultProvider.AZURE,
                        cached=True
                    )
                    loaded_secrets.append(secret_name)
                    logger.info(f"Loaded secret: {secret_name}")
                except Exception as e:
                    logger.warn(f"Could not load secret '{secret_name}': {e}")

            return {
                "loaded": len(loaded_secrets),
                "secretNames": loaded_secrets
            }

        except ImportError:
            raise ValueError("azure-identity and azure-keyvault-secrets packages not installed")
        except Exception as e:
            raise ValueError(f"Azure Key Vault initialization failed: {e}")

    @keyword("Init AWS Vault")
    def init_aws_vault(
        self,
        region: str = "us-east-1",
        use_iam_role: bool = True,
        secrets: list = None,
    ) -> Dict[str, Any]:
        """
        Initializes AWS Secrets Manager and loads specified secrets.

        Credentials are obtained from:
        - IAM Role (if use_iam_role=True and running in AWS EC2/ECS/Lambda)
        - Environment variables AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY

        Args:
            region: AWS region
            use_iam_role: Use IAM Role (default) or Access Keys from env
            secrets: List of secret names/ARNs to load

        Returns:
            Dictionary with loaded count and secret names

        Example:
            | ${result}= | Init AWS Vault | region=us-east-1 | secrets=${secrets_list} |
        """
        try:
            import boto3
            from botocore.exceptions import ClientError

            # boto3 automatically uses IAM role if available, then env vars
            if not use_iam_role:
                access_key = os.getenv("AWS_ACCESS_KEY_ID")
                secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
                if not access_key or not secret_key:
                    raise ValueError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY not set")
                client = boto3.client(
                    'secretsmanager',
                    region_name=region,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key
                )
            else:
                client = boto3.client('secretsmanager', region_name=region)
                logger.info("Using AWS IAM Role or default credentials")

            loaded_secrets = []
            secrets_to_load = secrets if secrets else []

            # Load each secret into cache
            for secret_name in secrets_to_load:
                try:
                    response = client.get_secret_value(SecretId=secret_name)
                    if 'SecretString' in response:
                        value = response['SecretString']
                    else:
                        value = base64.b64decode(response['SecretBinary']).decode()

                    # Use last part of ARN or name as cache key
                    simple_name = secret_name.split('/')[-1] if '/' in secret_name else secret_name
                    cache_key = f"aws:{simple_name}"
                    self._cache[cache_key] = SecretValue(
                        name=simple_name,
                        value=value,
                        provider=VaultProvider.AWS,
                        cached=True
                    )
                    loaded_secrets.append(simple_name)
                    logger.info(f"Loaded secret: {simple_name}")
                except ClientError as e:
                    logger.warn(f"Could not load secret '{secret_name}': {e}")

            return {
                "loaded": len(loaded_secrets),
                "secretNames": loaded_secrets
            }

        except ImportError:
            raise ValueError("boto3 package not installed")
        except Exception as e:
            raise ValueError(f"AWS Secrets Manager initialization failed: {e}")

    @keyword("Init HashiCorp Vault")
    def init_hashicorp_vault(
        self,
        vault_addr: str,
        auth_method: str = "token",
        mount_point: str = "secret",
        secrets_path: str = "",
        secrets: list = None,
    ) -> Dict[str, Any]:
        """
        Initializes HashiCorp Vault and loads specified secrets.

        Credentials are obtained from environment variables:
        - VAULT_TOKEN (for token auth)
        - VAULT_ROLE_ID and VAULT_SECRET_ID (for AppRole auth)

        Args:
            vault_addr: Vault server address (https://vault.example.com:8200)
            auth_method: Authentication method ('token' or 'approle')
            mount_point: Secrets engine mount point (default: 'secret')
            secrets_path: Path within the secrets engine
            secrets: List of specific keys to load (loads all at path if empty)

        Returns:
            Dictionary with loaded count and secret names

        Example:
            | ${result}= | Init HashiCorp Vault | https://vault.example.com:8200 |
            | ...        | secrets_path=myapp/prod | secrets=${keys_list} |
        """
        try:
            import hvac

            # Authenticate based on method
            if auth_method == "token":
                vault_token = os.getenv("VAULT_TOKEN")
                if not vault_token:
                    raise ValueError("VAULT_TOKEN environment variable not set")
                client = hvac.Client(url=vault_addr, token=vault_token)
            elif auth_method == "approle":
                role_id = os.getenv("VAULT_ROLE_ID")
                secret_id = os.getenv("VAULT_SECRET_ID")
                if not role_id or not secret_id:
                    raise ValueError("VAULT_ROLE_ID and VAULT_SECRET_ID not set")
                client = hvac.Client(url=vault_addr)
                client.auth.approle.login(role_id=role_id, secret_id=secret_id)
            else:
                raise ValueError(f"Unsupported auth method: {auth_method}")

            if not client.is_authenticated():
                raise ValueError("HashiCorp Vault authentication failed")

            logger.info(f"Authenticated to HashiCorp Vault at {vault_addr}")

            loaded_secrets = []

            # Read secrets from path
            try:
                # Try KV v2 first
                secret_data = client.secrets.kv.v2.read_secret_version(
                    path=secrets_path,
                    mount_point=mount_point
                )
                data = secret_data['data']['data']
            except:
                # Fallback to KV v1
                secret_data = client.secrets.kv.v1.read_secret(
                    path=secrets_path,
                    mount_point=mount_point
                )
                data = secret_data['data']

            # Filter to specific keys if provided
            keys_to_load = secrets if secrets else list(data.keys())

            for key in keys_to_load:
                if key in data:
                    cache_key = f"hashicorp:{key}"
                    self._cache[cache_key] = SecretValue(
                        name=key,
                        value=str(data[key]),
                        provider=VaultProvider.HASHICORP,
                        cached=True
                    )
                    loaded_secrets.append(key)
                    logger.info(f"Loaded secret: {key}")
                else:
                    logger.warn(f"Secret key '{key}' not found at path")

            return {
                "loaded": len(loaded_secrets),
                "secretNames": loaded_secrets
            }

        except ImportError:
            raise ValueError("hvac package not installed")
        except Exception as e:
            raise ValueError(f"HashiCorp Vault initialization failed: {e}")
