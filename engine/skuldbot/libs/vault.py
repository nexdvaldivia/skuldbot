"""
SkuldVault - Gestión segura de secrets y credenciales

Esta librería provee acceso a secrets desde múltiples fuentes:
- Variables de entorno
- Archivos .env
- Orchestrator Vault (cuando está disponible)
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault

Los secrets NUNCA se loguean ni se exponen en reportes.
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
        orchestrator_url: Optional[str] = None,
        orchestrator_token: Optional[str] = None,
        cache_secrets: bool = True,
    ):
        """
        Inicializa el vault.

        Args:
            default_provider: Proveedor por defecto (env, dotenv, orchestrator, aws, azure, hashicorp)
            dotenv_path: Ruta al archivo .env (default: .env en directorio actual)
            orchestrator_url: URL del Orchestrator API
            orchestrator_token: Token de autenticación del Orchestrator
            cache_secrets: Si debe cachear secrets en memoria
        """
        self.default_provider = VaultProvider(default_provider)
        self.dotenv_path = Path(dotenv_path) if dotenv_path else Path(".env")
        self.orchestrator_url = orchestrator_url or os.getenv("SKULDBOT_ORCHESTRATOR_URL")
        self.orchestrator_token = orchestrator_token or os.getenv("SKULDBOT_ORCHESTRATOR_TOKEN")
        self.cache_secrets = cache_secrets

        self._cache: Dict[str, SecretValue] = {}
        self._dotenv_loaded = False
        self._dotenv_vars: Dict[str, str] = {}

        # Cargar .env si existe
        self._load_dotenv()

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
        elif prov == VaultProvider.ORCHESTRATOR:
            value = self._get_from_orchestrator(name)
        elif prov == VaultProvider.AWS:
            value = self._get_from_aws(name)
        elif prov == VaultProvider.AZURE:
            value = self._get_from_azure(name)
        elif prov == VaultProvider.HASHICORP:
            value = self._get_from_hashicorp(name)

        # Fallback chain: proveedor -> env -> dotenv -> default
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
    ) -> None:
        """
        Guarda un secret en el vault (solo Orchestrator soportado).

        Args:
            name: Nombre del secret
            value: Valor a guardar
            provider: Proveedor (solo 'orchestrator' soportado para escritura)

        Example:
            | Set Secret | NEW_API_KEY | ${new_key} | provider=orchestrator |
        """
        prov = VaultProvider(provider) if provider else VaultProvider.ORCHESTRATOR

        if prov != VaultProvider.ORCHESTRATOR:
            raise ValueError("Only 'orchestrator' provider supports writing secrets")

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

    @keyword("Delete Secret")
    def delete_secret(
        self,
        name: str,
        provider: Optional[str] = None,
    ) -> None:
        """
        Elimina un secret del vault (solo Orchestrator soportado).

        Args:
            name: Nombre del secret
            provider: Proveedor (solo 'orchestrator' soportado)

        Example:
            | Delete Secret | OLD_API_KEY | provider=orchestrator |
        """
        prov = VaultProvider(provider) if provider else VaultProvider.ORCHESTRATOR

        if prov != VaultProvider.ORCHESTRATOR:
            raise ValueError("Only 'orchestrator' provider supports deleting secrets")

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

    @keyword("List Secrets")
    def list_secrets(self, provider: Optional[str] = None) -> list:
        """
        Lista los nombres de secrets disponibles (solo Orchestrator).

        Args:
            provider: Proveedor (solo 'orchestrator' soportado)

        Returns:
            Lista de nombres de secrets

        Example:
            | ${secrets}= | List Secrets | provider=orchestrator |
            | Log Many | @{secrets} |
        """
        prov = VaultProvider(provider) if provider else VaultProvider.ORCHESTRATOR

        if prov == VaultProvider.DOTENV:
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
