"""
Evidence Pack Encryption - AES-256-GCM with Key Management

Enterprise-grade encryption for evidence packs.
Supports AWS KMS, Azure Key Vault, and local key management.

Encryption Pattern:
1. Generate random Data Encryption Key (DEK) per evidence pack
2. Encrypt DEK with Key Encryption Key (KEK) from KMS
3. Store encrypted DEK in manifest
4. Encrypt all files with DEK using AES-256-GCM

This is the "envelope encryption" pattern used by AWS, Azure, and GCP.
"""

import base64
import hashlib
import json
import os
import secrets
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional, Tuple

# Cryptography imports
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.backends import default_backend
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False

# AWS imports
try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

# Azure imports
try:
    from azure.identity import DefaultAzureCredential
    from azure.keyvault.keys import KeyClient
    from azure.keyvault.keys.crypto import CryptographyClient, EncryptionAlgorithm
    HAS_AZURE = True
except ImportError:
    HAS_AZURE = False


class KeyProvider(Enum):
    """Supported key management providers"""
    LOCAL = "local"           # Local key derivation (dev/testing)
    AWS_KMS = "aws_kms"       # AWS Key Management Service
    AZURE_KV = "azure_kv"     # Azure Key Vault
    GCP_KMS = "gcp_kms"       # Google Cloud KMS
    HASHICORP = "hashicorp"   # HashiCorp Vault


@dataclass
class EncryptionMetadata:
    """Metadata about encryption for manifest"""
    algorithm: str = "AES-256-GCM"
    key_provider: str = "local"
    key_id: str = ""
    encrypted_dek: str = ""  # Base64 encoded encrypted DEK
    dek_algorithm: str = "AES-256"
    nonce_size: int = 12
    tag_size: int = 16
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "algorithm": self.algorithm,
            "keyProvider": self.key_provider,
            "keyId": self.key_id,
            "encryptedDek": self.encrypted_dek,
            "dekAlgorithm": self.dek_algorithm,
            "nonceSize": self.nonce_size,
            "tagSize": self.tag_size,
            "createdAt": self.created_at,
        }


class KeyManager(ABC):
    """Abstract base class for key management"""

    @abstractmethod
    def generate_data_key(self) -> Tuple[bytes, bytes]:
        """
        Generate a data encryption key (DEK).

        Returns:
            Tuple of (plaintext_key, encrypted_key)
        """
        pass

    @abstractmethod
    def decrypt_data_key(self, encrypted_key: bytes) -> bytes:
        """
        Decrypt an encrypted data key.

        Args:
            encrypted_key: The encrypted DEK

        Returns:
            Plaintext DEK
        """
        pass

    @abstractmethod
    def get_key_id(self) -> str:
        """Get the key identifier"""
        pass


class LocalKeyManager(KeyManager):
    """
    Local key management for development/testing.

    Uses PBKDF2 to derive KEK from a master secret.
    NOT RECOMMENDED FOR PRODUCTION - use AWS KMS or Azure Key Vault.
    """

    def __init__(self, master_secret: str, salt: Optional[bytes] = None):
        """
        Initialize with master secret.

        Args:
            master_secret: Master secret for key derivation
            salt: Optional salt (generated if not provided)
        """
        if not HAS_CRYPTOGRAPHY:
            raise ImportError("cryptography package required for encryption")

        self.salt = salt or os.urandom(16)
        self._key_id = hashlib.sha256(self.salt).hexdigest()[:16]

        # Derive KEK from master secret
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=self.salt,
            iterations=100000,
            backend=default_backend(),
        )
        self._kek = kdf.derive(master_secret.encode())

    def generate_data_key(self) -> Tuple[bytes, bytes]:
        """Generate DEK and encrypt it with KEK"""
        # Generate random 256-bit DEK
        plaintext_key = secrets.token_bytes(32)

        # Encrypt DEK with KEK using AES-256-GCM
        aesgcm = AESGCM(self._kek)
        nonce = os.urandom(12)
        encrypted_key = nonce + aesgcm.encrypt(nonce, plaintext_key, b"dek")

        return plaintext_key, encrypted_key

    def decrypt_data_key(self, encrypted_key: bytes) -> bytes:
        """Decrypt DEK using KEK"""
        nonce = encrypted_key[:12]
        ciphertext = encrypted_key[12:]

        aesgcm = AESGCM(self._kek)
        return aesgcm.decrypt(nonce, ciphertext, b"dek")

    def get_key_id(self) -> str:
        return f"local:{self._key_id}"


class AWSKMSKeyManager(KeyManager):
    """
    AWS KMS key management for production.

    Uses AWS KMS to generate and manage data keys.
    Requires AWS credentials and KMS key ARN.
    """

    def __init__(
        self,
        key_arn: str,
        region: Optional[str] = None,
        profile: Optional[str] = None,
    ):
        """
        Initialize AWS KMS key manager.

        Args:
            key_arn: ARN of the KMS key
            region: AWS region (optional, uses default)
            profile: AWS profile name (optional)
        """
        if not HAS_BOTO3:
            raise ImportError("boto3 package required for AWS KMS")

        self.key_arn = key_arn

        session_kwargs = {}
        if profile:
            session_kwargs["profile_name"] = profile
        if region:
            session_kwargs["region_name"] = region

        session = boto3.Session(**session_kwargs)
        self.kms = session.client("kms")

    def generate_data_key(self) -> Tuple[bytes, bytes]:
        """Generate DEK using AWS KMS GenerateDataKey"""
        try:
            response = self.kms.generate_data_key(
                KeyId=self.key_arn,
                KeySpec="AES_256",
                EncryptionContext={
                    "purpose": "skuldbot_evidence_pack",
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )

            plaintext_key = response["Plaintext"]
            encrypted_key = response["CiphertextBlob"]

            return plaintext_key, encrypted_key

        except ClientError as e:
            raise RuntimeError(f"AWS KMS error: {e}")

    def decrypt_data_key(self, encrypted_key: bytes) -> bytes:
        """Decrypt DEK using AWS KMS"""
        try:
            response = self.kms.decrypt(
                CiphertextBlob=encrypted_key,
                EncryptionContext={
                    "purpose": "skuldbot_evidence_pack",
                },
            )
            return response["Plaintext"]

        except ClientError as e:
            raise RuntimeError(f"AWS KMS decrypt error: {e}")

    def get_key_id(self) -> str:
        return f"aws-kms:{self.key_arn}"


class AzureKeyVaultManager(KeyManager):
    """
    Azure Key Vault key management for production.

    Uses Azure Key Vault for key management.
    Requires Azure credentials and Key Vault URL.
    """

    def __init__(
        self,
        vault_url: str,
        key_name: str,
        key_version: Optional[str] = None,
    ):
        """
        Initialize Azure Key Vault manager.

        Args:
            vault_url: Key Vault URL (https://<vault-name>.vault.azure.net)
            key_name: Name of the key in Key Vault
            key_version: Specific key version (optional, uses latest)
        """
        if not HAS_AZURE:
            raise ImportError("azure-keyvault-keys package required for Azure Key Vault")

        self.vault_url = vault_url
        self.key_name = key_name
        self.key_version = key_version

        credential = DefaultAzureCredential()
        self.key_client = KeyClient(vault_url=vault_url, credential=credential)

        # Get the key
        key = self.key_client.get_key(key_name, key_version)
        self.crypto_client = CryptographyClient(key, credential=credential)
        self._key_id = key.id

    def generate_data_key(self) -> Tuple[bytes, bytes]:
        """Generate DEK and encrypt with Azure Key Vault"""
        # Generate random DEK locally
        plaintext_key = secrets.token_bytes(32)

        # Encrypt with Azure Key Vault
        result = self.crypto_client.encrypt(
            EncryptionAlgorithm.rsa_oaep_256,
            plaintext_key,
        )

        return plaintext_key, result.ciphertext

    def decrypt_data_key(self, encrypted_key: bytes) -> bytes:
        """Decrypt DEK using Azure Key Vault"""
        result = self.crypto_client.decrypt(
            EncryptionAlgorithm.rsa_oaep_256,
            encrypted_key,
        )
        return result.plaintext

    def get_key_id(self) -> str:
        return f"azure-kv:{self._key_id}"


class EvidenceEncryptor:
    """
    Encrypts evidence pack files using AES-256-GCM.

    Uses envelope encryption:
    1. DEK (Data Encryption Key) encrypts the actual data
    2. KEK (Key Encryption Key) from KMS encrypts the DEK
    3. Only encrypted DEK is stored with the evidence pack

    Each file gets a unique nonce for security.
    """

    NONCE_SIZE = 12  # 96 bits for GCM
    TAG_SIZE = 16    # 128 bits authentication tag

    def __init__(self, key_manager: KeyManager):
        """
        Initialize encryptor with key manager.

        Args:
            key_manager: Key manager instance (Local, AWS KMS, Azure KV)
        """
        if not HAS_CRYPTOGRAPHY:
            raise ImportError("cryptography package required for encryption")

        self.key_manager = key_manager
        self._dek: Optional[bytes] = None
        self._encrypted_dek: Optional[bytes] = None
        self._aesgcm: Optional[AESGCM] = None

    def initialize(self) -> EncryptionMetadata:
        """
        Initialize encryption for a new evidence pack.
        Generates a new DEK for this pack.

        Returns:
            EncryptionMetadata to store in manifest
        """
        # Generate new DEK
        self._dek, self._encrypted_dek = self.key_manager.generate_data_key()
        self._aesgcm = AESGCM(self._dek)

        # Determine provider type
        key_id = self.key_manager.get_key_id()
        if key_id.startswith("aws-kms:"):
            provider = KeyProvider.AWS_KMS.value
        elif key_id.startswith("azure-kv:"):
            provider = KeyProvider.AZURE_KV.value
        else:
            provider = KeyProvider.LOCAL.value

        return EncryptionMetadata(
            algorithm="AES-256-GCM",
            key_provider=provider,
            key_id=key_id,
            encrypted_dek=base64.b64encode(self._encrypted_dek).decode(),
            dek_algorithm="AES-256",
            nonce_size=self.NONCE_SIZE,
            tag_size=self.TAG_SIZE,
        )

    def encrypt_file(self, plaintext: bytes, associated_data: bytes = b"") -> bytes:
        """
        Encrypt a file with AES-256-GCM.

        Args:
            plaintext: Data to encrypt
            associated_data: Additional authenticated data (AAD)

        Returns:
            Encrypted data (nonce + ciphertext + tag)
        """
        if not self._aesgcm:
            raise RuntimeError("Encryptor not initialized. Call initialize() first.")

        # Generate unique nonce for this file
        nonce = os.urandom(self.NONCE_SIZE)

        # Encrypt with AES-256-GCM
        ciphertext = self._aesgcm.encrypt(nonce, plaintext, associated_data)

        # Return nonce + ciphertext (tag is appended by AESGCM)
        return nonce + ciphertext

    def encrypt_json(self, data: Dict[str, Any], associated_data: bytes = b"") -> bytes:
        """
        Encrypt JSON data.

        Args:
            data: Dictionary to encrypt
            associated_data: AAD

        Returns:
            Encrypted JSON
        """
        plaintext = json.dumps(data, sort_keys=True).encode()
        return self.encrypt_file(plaintext, associated_data)


class EvidenceDecryptor:
    """
    Decrypts evidence pack files.

    Used for verification and auditing.
    """

    def __init__(self, key_manager: KeyManager):
        """
        Initialize decryptor.

        Args:
            key_manager: Key manager with access to KEK
        """
        if not HAS_CRYPTOGRAPHY:
            raise ImportError("cryptography package required for decryption")

        self.key_manager = key_manager
        self._aesgcm: Optional[AESGCM] = None

    def initialize(self, encryption_metadata: EncryptionMetadata) -> None:
        """
        Initialize decryptor from evidence pack metadata.

        Args:
            encryption_metadata: Metadata from manifest
        """
        # Decode and decrypt the DEK
        encrypted_dek = base64.b64decode(encryption_metadata.encrypted_dek)
        dek = self.key_manager.decrypt_data_key(encrypted_dek)

        self._aesgcm = AESGCM(dek)

    def decrypt_file(self, ciphertext: bytes, associated_data: bytes = b"") -> bytes:
        """
        Decrypt a file.

        Args:
            ciphertext: Encrypted data (nonce + ciphertext + tag)
            associated_data: AAD used during encryption

        Returns:
            Decrypted plaintext
        """
        if not self._aesgcm:
            raise RuntimeError("Decryptor not initialized. Call initialize() first.")

        # Extract nonce
        nonce = ciphertext[:12]
        encrypted_data = ciphertext[12:]

        # Decrypt
        return self._aesgcm.decrypt(nonce, encrypted_data, associated_data)

    def decrypt_json(self, ciphertext: bytes, associated_data: bytes = b"") -> Dict[str, Any]:
        """
        Decrypt JSON data.

        Args:
            ciphertext: Encrypted JSON
            associated_data: AAD

        Returns:
            Decrypted dictionary
        """
        plaintext = self.decrypt_file(ciphertext, associated_data)
        return json.loads(plaintext.decode())


def create_key_manager(
    provider: KeyProvider,
    **kwargs,
) -> KeyManager:
    """
    Factory function to create appropriate key manager.

    Args:
        provider: Key management provider
        **kwargs: Provider-specific arguments

    Returns:
        KeyManager instance

    Examples:
        # Local (development)
        km = create_key_manager(KeyProvider.LOCAL, master_secret="dev-secret")

        # AWS KMS (production)
        km = create_key_manager(
            KeyProvider.AWS_KMS,
            key_arn="arn:aws:kms:us-east-1:123456789:key/abc-123"
        )

        # Azure Key Vault (production)
        km = create_key_manager(
            KeyProvider.AZURE_KV,
            vault_url="https://myvault.vault.azure.net",
            key_name="evidence-key"
        )
    """
    if provider == KeyProvider.LOCAL:
        master_secret = kwargs.get("master_secret")
        if not master_secret:
            raise ValueError("master_secret required for local key manager")
        return LocalKeyManager(master_secret, kwargs.get("salt"))

    elif provider == KeyProvider.AWS_KMS:
        key_arn = kwargs.get("key_arn")
        if not key_arn:
            raise ValueError("key_arn required for AWS KMS")
        return AWSKMSKeyManager(
            key_arn,
            kwargs.get("region"),
            kwargs.get("profile"),
        )

    elif provider == KeyProvider.AZURE_KV:
        vault_url = kwargs.get("vault_url")
        key_name = kwargs.get("key_name")
        if not vault_url or not key_name:
            raise ValueError("vault_url and key_name required for Azure Key Vault")
        return AzureKeyVaultManager(
            vault_url,
            key_name,
            kwargs.get("key_version"),
        )

    else:
        raise ValueError(f"Unsupported key provider: {provider}")
