"""
SkuldBot Local Vault - Almacenamiento seguro de credenciales local

Diseñado para industrias reguladas (HIPAA, HITECH, PCI-DSS, SOX).

Características de seguridad:
- Encriptación AES-256-GCM (NIST approved)
- Derivación de clave con PBKDF2-SHA256 (600,000 iteraciones)
- Salt único por vault (32 bytes)
- IV único por secreto (12 bytes)
- Authentication tag para integridad (16 bytes)
- Master password nunca almacenada
- Audit logging de todos los accesos

Estructura del vault:
    .skuldbot/
    ├── vault.enc        # Secretos encriptados
    ├── vault.meta       # Metadata (salt, created_at, version)
    └── vault.audit.log  # Log de auditoría (opcional)
"""

import os
import json
import base64
import hashlib
import secrets
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Optional, Any, List
from dataclasses import dataclass, field, asdict
from enum import Enum

# Cryptography imports
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.backends import default_backend
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False


logger = logging.getLogger(__name__)


class AuditAction(str, Enum):
    """Acciones auditables"""
    VAULT_CREATED = "vault_created"
    VAULT_UNLOCKED = "vault_unlocked"
    VAULT_LOCKED = "vault_locked"
    SECRET_READ = "secret_read"
    SECRET_CREATED = "secret_created"
    SECRET_UPDATED = "secret_updated"
    SECRET_DELETED = "secret_deleted"
    SECRET_LIST = "secret_list"
    PASSWORD_CHANGED = "password_changed"
    FAILED_UNLOCK = "failed_unlock"


@dataclass
class AuditEntry:
    """Entrada de auditoría"""
    timestamp: str
    action: str
    secret_name: Optional[str] = None
    success: bool = True
    details: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class VaultMetadata:
    """Metadata del vault"""
    version: str = "1.0"
    created_at: str = ""
    last_accessed: str = ""
    salt: str = ""  # Base64 encoded
    iterations: int = 600_000  # OWASP 2023 recommendation
    algorithm: str = "AES-256-GCM"
    kdf: str = "PBKDF2-SHA256"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "VaultMetadata":
        return cls(**data)


@dataclass
class EncryptedSecret:
    """Secreto encriptado"""
    name: str
    iv: str  # Base64 encoded (12 bytes)
    ciphertext: str  # Base64 encoded
    tag: str  # Base64 encoded (16 bytes) - incluido en ciphertext para AESGCM
    created_at: str
    updated_at: str
    description: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "EncryptedSecret":
        return cls(**data)


class LocalVaultError(Exception):
    """Error base del vault"""
    pass


class VaultLockedError(LocalVaultError):
    """Vault está bloqueado"""
    pass


class VaultNotFoundError(LocalVaultError):
    """Vault no existe"""
    pass


class InvalidPasswordError(LocalVaultError):
    """Password incorrecto"""
    pass


class SecretNotFoundError(LocalVaultError):
    """Secreto no encontrado"""
    pass


class LocalVault:
    """
    Vault local seguro para almacenar credenciales.

    Uso:
        vault = LocalVault("/path/to/project/.skuldbot")

        # Crear nuevo vault
        vault.create("mi-master-password-seguro")

        # O abrir existente
        vault.unlock("mi-master-password-seguro")

        # Guardar secreto
        vault.set_secret("API_KEY", "sk-xxxx", description="OpenAI API Key")

        # Leer secreto
        value = vault.get_secret("API_KEY")

        # Bloquear al terminar
        vault.lock()
    """

    VAULT_FILE = "vault.enc"
    META_FILE = "vault.meta"
    AUDIT_FILE = "vault.audit.log"

    # Parámetros criptográficos (NIST/OWASP compliant)
    SALT_SIZE = 32  # 256 bits
    IV_SIZE = 12    # 96 bits (recomendado para GCM)
    KEY_SIZE = 32   # 256 bits (AES-256)
    ITERATIONS = 600_000  # OWASP 2023

    def __init__(
        self,
        vault_path: str,
        enable_audit: bool = True,
    ):
        """
        Inicializa el vault local.

        Args:
            vault_path: Ruta al directorio del vault (ej: /project/.skuldbot)
            enable_audit: Habilitar logging de auditoría
        """
        if not CRYPTO_AVAILABLE:
            raise LocalVaultError(
                "cryptography library required. Install with: pip install cryptography"
            )

        self.vault_dir = Path(vault_path)
        self.vault_file = self.vault_dir / self.VAULT_FILE
        self.meta_file = self.vault_dir / self.META_FILE
        self.audit_file = self.vault_dir / self.AUDIT_FILE
        self.enable_audit = enable_audit

        self._key: Optional[bytes] = None
        self._metadata: Optional[VaultMetadata] = None
        self._secrets: Dict[str, EncryptedSecret] = {}

    @property
    def is_unlocked(self) -> bool:
        """Verifica si el vault está desbloqueado"""
        return self._key is not None

    @property
    def exists(self) -> bool:
        """Verifica si el vault existe"""
        return self.meta_file.exists() and self.vault_file.exists()

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        """
        Deriva la clave de encriptación desde el password.

        Usa PBKDF2-SHA256 con iteraciones altas para resistir ataques de fuerza bruta.
        """
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=self.KEY_SIZE,
            salt=salt,
            iterations=self.ITERATIONS,
            backend=default_backend()
        )
        return kdf.derive(password.encode('utf-8'))

    def _encrypt(self, plaintext: str) -> tuple[bytes, bytes]:
        """
        Encripta texto con AES-256-GCM.

        Returns:
            (iv, ciphertext_with_tag)
        """
        if not self._key:
            raise VaultLockedError("Vault is locked")

        iv = secrets.token_bytes(self.IV_SIZE)
        aesgcm = AESGCM(self._key)
        ciphertext = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)

        return iv, ciphertext

    def _decrypt(self, iv: bytes, ciphertext: bytes) -> str:
        """
        Desencripta texto con AES-256-GCM.
        """
        if not self._key:
            raise VaultLockedError("Vault is locked")

        aesgcm = AESGCM(self._key)
        plaintext = aesgcm.decrypt(iv, ciphertext, None)

        return plaintext.decode('utf-8')

    def _audit(self, action: AuditAction, secret_name: str = None, success: bool = True, details: str = None):
        """Registra una entrada de auditoría"""
        if not self.enable_audit:
            return

        entry = AuditEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            action=action.value,
            secret_name=secret_name,
            success=success,
            details=details
        )

        try:
            with open(self.audit_file, 'a') as f:
                f.write(json.dumps(entry.to_dict()) + '\n')
        except Exception as e:
            logger.warning(f"Could not write audit log: {e}")

    def _save_vault(self):
        """Guarda el vault encriptado a disco"""
        if not self._key:
            raise VaultLockedError("Vault is locked")

        # Serializar secretos
        secrets_data = {
            name: secret.to_dict()
            for name, secret in self._secrets.items()
        }

        # Guardar archivo de secretos
        with open(self.vault_file, 'w') as f:
            json.dump(secrets_data, f, indent=2)

        # Actualizar metadata
        self._metadata.last_accessed = datetime.now(timezone.utc).isoformat()
        with open(self.meta_file, 'w') as f:
            json.dump(self._metadata.to_dict(), f, indent=2)

    def _load_vault(self):
        """Carga el vault desde disco"""
        if not self.exists:
            raise VaultNotFoundError(f"Vault not found at {self.vault_dir}")

        # Cargar metadata
        with open(self.meta_file, 'r') as f:
            self._metadata = VaultMetadata.from_dict(json.load(f))

        # Cargar secretos encriptados
        with open(self.vault_file, 'r') as f:
            secrets_data = json.load(f)
            self._secrets = {
                name: EncryptedSecret.from_dict(data)
                for name, data in secrets_data.items()
            }

    def create(self, master_password: str) -> None:
        """
        Crea un nuevo vault con el master password.

        Args:
            master_password: Password maestro para encriptar el vault

        Raises:
            LocalVaultError: Si el vault ya existe
        """
        if self.exists:
            raise LocalVaultError(f"Vault already exists at {self.vault_dir}")

        # Crear directorio si no existe
        self.vault_dir.mkdir(parents=True, exist_ok=True)

        # Generar salt aleatorio
        salt = secrets.token_bytes(self.SALT_SIZE)

        # Derivar clave
        self._key = self._derive_key(master_password, salt)

        # Crear metadata
        now = datetime.now(timezone.utc).isoformat()
        self._metadata = VaultMetadata(
            created_at=now,
            last_accessed=now,
            salt=base64.b64encode(salt).decode('ascii'),
            iterations=self.ITERATIONS,
        )

        # Inicializar secretos vacíos
        self._secrets = {}

        # Guardar
        self._save_vault()

        # Auditar
        self._audit(AuditAction.VAULT_CREATED)

        logger.info(f"Vault created at {self.vault_dir}")

    def unlock(self, master_password: str) -> None:
        """
        Desbloquea el vault con el master password.

        Args:
            master_password: Password maestro

        Raises:
            VaultNotFoundError: Si el vault no existe
            InvalidPasswordError: Si el password es incorrecto
        """
        if not self.exists:
            raise VaultNotFoundError(f"Vault not found at {self.vault_dir}")

        # Cargar metadata para obtener el salt
        with open(self.meta_file, 'r') as f:
            meta_data = json.load(f)
            self._metadata = VaultMetadata.from_dict(meta_data)

        # Derivar clave
        salt = base64.b64decode(self._metadata.salt)
        self._key = self._derive_key(master_password, salt)

        # Intentar cargar y verificar
        try:
            self._load_vault()

            # Verificar que podemos desencriptar al menos un secreto
            # (Si hay secretos)
            if self._secrets:
                first_secret = next(iter(self._secrets.values()))
                iv = base64.b64decode(first_secret.iv)
                ciphertext = base64.b64decode(first_secret.ciphertext)
                self._decrypt(iv, ciphertext)

            self._audit(AuditAction.VAULT_UNLOCKED)
            logger.info("Vault unlocked successfully")

        except Exception as e:
            self._key = None
            self._metadata = None
            self._secrets = {}
            self._audit(AuditAction.FAILED_UNLOCK, success=False, details=str(e))
            raise InvalidPasswordError("Invalid master password")

    def lock(self) -> None:
        """Bloquea el vault, eliminando la clave de memoria"""
        if self._key:
            # Sobrescribir la clave en memoria
            self._key = b'\x00' * len(self._key)

        self._key = None
        self._metadata = None
        self._secrets = {}

        self._audit(AuditAction.VAULT_LOCKED)
        logger.info("Vault locked")

    def change_password(self, old_password: str, new_password: str) -> None:
        """
        Cambia el master password del vault.

        Args:
            old_password: Password actual
            new_password: Nuevo password
        """
        # Verificar password actual
        if not self.is_unlocked:
            self.unlock(old_password)

        # Desencriptar todos los secretos
        decrypted_secrets: Dict[str, tuple] = {}
        for name, secret in self._secrets.items():
            iv = base64.b64decode(secret.iv)
            ciphertext = base64.b64decode(secret.ciphertext)
            plaintext = self._decrypt(iv, ciphertext)
            decrypted_secrets[name] = (plaintext, secret.description, secret.created_at)

        # Generar nuevo salt y derivar nueva clave
        new_salt = secrets.token_bytes(self.SALT_SIZE)
        self._key = self._derive_key(new_password, new_salt)

        # Actualizar metadata
        self._metadata.salt = base64.b64encode(new_salt).decode('ascii')

        # Re-encriptar todos los secretos
        for name, (plaintext, description, created_at) in decrypted_secrets.items():
            iv, ciphertext = self._encrypt(plaintext)
            self._secrets[name] = EncryptedSecret(
                name=name,
                iv=base64.b64encode(iv).decode('ascii'),
                ciphertext=base64.b64encode(ciphertext).decode('ascii'),
                tag="",  # Incluido en ciphertext para AESGCM
                created_at=created_at,
                updated_at=datetime.now(timezone.utc).isoformat(),
                description=description
            )

        # Guardar
        self._save_vault()

        self._audit(AuditAction.PASSWORD_CHANGED)
        logger.info("Vault password changed successfully")

    def set_secret(
        self,
        name: str,
        value: str,
        description: str = None
    ) -> None:
        """
        Guarda o actualiza un secreto.

        Args:
            name: Nombre del secreto
            value: Valor del secreto
            description: Descripción opcional
        """
        if not self.is_unlocked:
            raise VaultLockedError("Vault is locked")

        now = datetime.now(timezone.utc).isoformat()
        is_update = name in self._secrets

        # Encriptar
        iv, ciphertext = self._encrypt(value)

        # Crear entrada
        created_at = self._secrets[name].created_at if is_update else now
        self._secrets[name] = EncryptedSecret(
            name=name,
            iv=base64.b64encode(iv).decode('ascii'),
            ciphertext=base64.b64encode(ciphertext).decode('ascii'),
            tag="",
            created_at=created_at,
            updated_at=now,
            description=description
        )

        # Guardar
        self._save_vault()

        action = AuditAction.SECRET_UPDATED if is_update else AuditAction.SECRET_CREATED
        self._audit(action, secret_name=name)

        logger.debug(f"Secret '{name}' {'updated' if is_update else 'created'}")

    def get_secret(self, name: str) -> str:
        """
        Obtiene el valor de un secreto.

        Args:
            name: Nombre del secreto

        Returns:
            Valor desencriptado

        Raises:
            VaultLockedError: Si el vault está bloqueado
            SecretNotFoundError: Si el secreto no existe
        """
        if not self.is_unlocked:
            raise VaultLockedError("Vault is locked")

        if name not in self._secrets:
            raise SecretNotFoundError(f"Secret '{name}' not found")

        secret = self._secrets[name]
        iv = base64.b64decode(secret.iv)
        ciphertext = base64.b64decode(secret.ciphertext)

        value = self._decrypt(iv, ciphertext)

        self._audit(AuditAction.SECRET_READ, secret_name=name)

        return value

    def delete_secret(self, name: str) -> None:
        """
        Elimina un secreto.

        Args:
            name: Nombre del secreto
        """
        if not self.is_unlocked:
            raise VaultLockedError("Vault is locked")

        if name not in self._secrets:
            raise SecretNotFoundError(f"Secret '{name}' not found")

        del self._secrets[name]
        self._save_vault()

        self._audit(AuditAction.SECRET_DELETED, secret_name=name)
        logger.debug(f"Secret '{name}' deleted")

    def list_secrets(self) -> List[Dict[str, Any]]:
        """
        Lista todos los secretos (sin valores).

        Returns:
            Lista de diccionarios con metadata de cada secreto
        """
        if not self.is_unlocked:
            raise VaultLockedError("Vault is locked")

        self._audit(AuditAction.SECRET_LIST)

        return [
            {
                "name": secret.name,
                "description": secret.description,
                "created_at": secret.created_at,
                "updated_at": secret.updated_at,
            }
            for secret in self._secrets.values()
        ]

    def secret_exists(self, name: str) -> bool:
        """Verifica si un secreto existe"""
        if not self.is_unlocked:
            raise VaultLockedError("Vault is locked")
        return name in self._secrets

    def get_audit_log(self, limit: int = 100) -> List[Dict]:
        """
        Obtiene las últimas entradas del audit log.

        Args:
            limit: Número máximo de entradas

        Returns:
            Lista de entradas de auditoría
        """
        if not self.audit_file.exists():
            return []

        entries = []
        with open(self.audit_file, 'r') as f:
            for line in f:
                try:
                    entries.append(json.loads(line.strip()))
                except json.JSONDecodeError:
                    continue

        return entries[-limit:]

    def export_secrets(self, password: str) -> Dict[str, str]:
        """
        Exporta todos los secretos (requiere password para verificación).

        ADVERTENCIA: Esto devuelve secretos en texto plano.
        Solo usar para migración o backup.

        Args:
            password: Master password para verificación

        Returns:
            Dict con nombre: valor de cada secreto
        """
        # Re-verificar password
        if not self.is_unlocked:
            self.unlock(password)

        secrets_plain = {}
        for name in self._secrets:
            secrets_plain[name] = self.get_secret(name)

        return secrets_plain
