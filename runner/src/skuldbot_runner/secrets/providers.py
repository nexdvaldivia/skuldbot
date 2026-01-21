"""Secret providers for different vault backends."""

import json
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


class SecretsProvider(ABC):
    """Base class for secrets providers."""

    @abstractmethod
    async def get_secret(self, key: str) -> str | None:
        """Get a secret value by key."""
        pass

    @abstractmethod
    async def get_secrets(self, keys: list[str]) -> dict[str, str | None]:
        """Get multiple secrets at once."""
        pass

    @abstractmethod
    async def set_secret(self, key: str, value: str) -> None:
        """Set a secret value (if supported)."""
        pass

    @abstractmethod
    async def delete_secret(self, key: str) -> None:
        """Delete a secret (if supported)."""
        pass

    @abstractmethod
    async def list_secrets(self) -> list[str]:
        """List available secret keys."""
        pass

    async def health_check(self) -> bool:
        """Check if the provider is healthy."""
        return True


class EnvSecretsProvider(SecretsProvider):
    """
    Environment variables secrets provider.
    Secrets are read from environment variables with an optional prefix.
    """

    def __init__(self, prefix: str = "SKULDBOT_SECRET_"):
        self.prefix = prefix
        logger.info("Initialized EnvSecretsProvider", prefix=prefix)

    async def get_secret(self, key: str) -> str | None:
        env_key = f"{self.prefix}{key.upper()}"
        value = os.environ.get(env_key)
        if value:
            logger.debug("Secret retrieved from env", key=key)
        return value

    async def get_secrets(self, keys: list[str]) -> dict[str, str | None]:
        return {key: await self.get_secret(key) for key in keys}

    async def set_secret(self, key: str, value: str) -> None:
        env_key = f"{self.prefix}{key.upper()}"
        os.environ[env_key] = value
        logger.debug("Secret set in env", key=key)

    async def delete_secret(self, key: str) -> None:
        env_key = f"{self.prefix}{key.upper()}"
        if env_key in os.environ:
            del os.environ[env_key]
            logger.debug("Secret deleted from env", key=key)

    async def list_secrets(self) -> list[str]:
        return [
            k[len(self.prefix):].lower()
            for k in os.environ.keys()
            if k.startswith(self.prefix)
        ]


class FileSecretsProvider(SecretsProvider):
    """
    File-based secrets provider.
    Secrets are stored in a JSON file (encrypted at rest recommended).
    """

    def __init__(self, file_path: str, encryption_key: str | None = None):
        self.file_path = Path(file_path)
        self.encryption_key = encryption_key
        self._cache: dict[str, str] | None = None
        logger.info("Initialized FileSecretsProvider", path=file_path)

    def _load_secrets(self) -> dict[str, str]:
        if self._cache is not None:
            return self._cache

        if not self.file_path.exists():
            self._cache = {}
            return self._cache

        content = self.file_path.read_text()

        # TODO: Decrypt if encryption_key is set
        if self.encryption_key:
            # Implement encryption/decryption with cryptography library
            pass

        self._cache = json.loads(content)
        return self._cache

    def _save_secrets(self, secrets: dict[str, str]) -> None:
        content = json.dumps(secrets, indent=2)

        # TODO: Encrypt if encryption_key is set
        if self.encryption_key:
            pass

        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_path.write_text(content)
        self._cache = secrets

    async def get_secret(self, key: str) -> str | None:
        secrets = self._load_secrets()
        return secrets.get(key)

    async def get_secrets(self, keys: list[str]) -> dict[str, str | None]:
        secrets = self._load_secrets()
        return {key: secrets.get(key) for key in keys}

    async def set_secret(self, key: str, value: str) -> None:
        secrets = self._load_secrets()
        secrets[key] = value
        self._save_secrets(secrets)
        logger.debug("Secret saved to file", key=key)

    async def delete_secret(self, key: str) -> None:
        secrets = self._load_secrets()
        if key in secrets:
            del secrets[key]
            self._save_secrets(secrets)
            logger.debug("Secret deleted from file", key=key)

    async def list_secrets(self) -> list[str]:
        return list(self._load_secrets().keys())


class HashiCorpVaultProvider(SecretsProvider):
    """
    HashiCorp Vault secrets provider.
    Supports KV v1 and v2 secrets engines.
    """

    def __init__(
        self,
        url: str,
        token: str | None = None,
        role_id: str | None = None,
        secret_id: str | None = None,
        mount_point: str = "secret",
        kv_version: int = 2,
    ):
        self.url = url.rstrip("/")
        self.token = token
        self.role_id = role_id
        self.secret_id = secret_id
        self.mount_point = mount_point
        self.kv_version = kv_version
        self._client = None
        logger.info("Initialized HashiCorpVaultProvider", url=url, mount=mount_point)

    async def _get_client(self):
        if self._client is None:
            try:
                import hvac
            except ImportError:
                raise ImportError("hvac package required for HashiCorp Vault. Install with: pip install hvac")

            self._client = hvac.Client(url=self.url)

            if self.token:
                self._client.token = self.token
            elif self.role_id and self.secret_id:
                # AppRole authentication
                self._client.auth.approle.login(
                    role_id=self.role_id,
                    secret_id=self.secret_id,
                )

            if not self._client.is_authenticated():
                raise RuntimeError("Failed to authenticate with Vault")

        return self._client

    async def get_secret(self, key: str) -> str | None:
        client = await self._get_client()

        try:
            if self.kv_version == 2:
                response = client.secrets.kv.v2.read_secret_version(
                    path=key,
                    mount_point=self.mount_point,
                )
                return response["data"]["data"].get("value")
            else:
                response = client.secrets.kv.v1.read_secret(
                    path=key,
                    mount_point=self.mount_point,
                )
                return response["data"].get("value")
        except Exception as e:
            logger.warning("Failed to get secret from Vault", key=key, error=str(e))
            return None

    async def get_secrets(self, keys: list[str]) -> dict[str, str | None]:
        return {key: await self.get_secret(key) for key in keys}

    async def set_secret(self, key: str, value: str) -> None:
        client = await self._get_client()

        if self.kv_version == 2:
            client.secrets.kv.v2.create_or_update_secret(
                path=key,
                secret={"value": value},
                mount_point=self.mount_point,
            )
        else:
            client.secrets.kv.v1.create_or_update_secret(
                path=key,
                secret={"value": value},
                mount_point=self.mount_point,
            )

        logger.debug("Secret saved to Vault", key=key)

    async def delete_secret(self, key: str) -> None:
        client = await self._get_client()

        if self.kv_version == 2:
            client.secrets.kv.v2.delete_metadata_and_all_versions(
                path=key,
                mount_point=self.mount_point,
            )
        else:
            client.secrets.kv.v1.delete_secret(
                path=key,
                mount_point=self.mount_point,
            )

        logger.debug("Secret deleted from Vault", key=key)

    async def list_secrets(self) -> list[str]:
        client = await self._get_client()

        try:
            if self.kv_version == 2:
                response = client.secrets.kv.v2.list_secrets(
                    path="",
                    mount_point=self.mount_point,
                )
            else:
                response = client.secrets.kv.v1.list_secrets(
                    path="",
                    mount_point=self.mount_point,
                )
            return response["data"]["keys"]
        except Exception:
            return []

    async def health_check(self) -> bool:
        try:
            client = await self._get_client()
            return client.is_authenticated()
        except Exception:
            return False


class AzureKeyVaultProvider(SecretsProvider):
    """
    Azure Key Vault secrets provider.
    Supports managed identity and service principal authentication.
    """

    def __init__(
        self,
        vault_url: str,
        tenant_id: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        use_managed_identity: bool = False,
    ):
        self.vault_url = vault_url
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.use_managed_identity = use_managed_identity
        self._client = None
        logger.info("Initialized AzureKeyVaultProvider", vault_url=vault_url)

    async def _get_client(self):
        if self._client is None:
            try:
                from azure.identity import (
                    DefaultAzureCredential,
                    ClientSecretCredential,
                    ManagedIdentityCredential,
                )
                from azure.keyvault.secrets import SecretClient
            except ImportError:
                raise ImportError(
                    "azure-identity and azure-keyvault-secrets packages required. "
                    "Install with: pip install azure-identity azure-keyvault-secrets"
                )

            if self.use_managed_identity:
                credential = ManagedIdentityCredential()
            elif self.tenant_id and self.client_id and self.client_secret:
                credential = ClientSecretCredential(
                    tenant_id=self.tenant_id,
                    client_id=self.client_id,
                    client_secret=self.client_secret,
                )
            else:
                credential = DefaultAzureCredential()

            self._client = SecretClient(vault_url=self.vault_url, credential=credential)

        return self._client

    async def get_secret(self, key: str) -> str | None:
        client = await self._get_client()
        try:
            secret = client.get_secret(key)
            return secret.value
        except Exception as e:
            logger.warning("Failed to get secret from Azure KeyVault", key=key, error=str(e))
            return None

    async def get_secrets(self, keys: list[str]) -> dict[str, str | None]:
        return {key: await self.get_secret(key) for key in keys}

    async def set_secret(self, key: str, value: str) -> None:
        client = await self._get_client()
        client.set_secret(key, value)
        logger.debug("Secret saved to Azure KeyVault", key=key)

    async def delete_secret(self, key: str) -> None:
        client = await self._get_client()
        poller = client.begin_delete_secret(key)
        poller.wait()
        logger.debug("Secret deleted from Azure KeyVault", key=key)

    async def list_secrets(self) -> list[str]:
        client = await self._get_client()
        return [s.name for s in client.list_properties_of_secrets()]

    async def health_check(self) -> bool:
        try:
            client = await self._get_client()
            # Try to list secrets (limited to 1)
            list(client.list_properties_of_secrets())
            return True
        except Exception:
            return False


class AWSSecretsManagerProvider(SecretsProvider):
    """
    AWS Secrets Manager provider.
    Supports IAM role and access key authentication.
    """

    def __init__(
        self,
        region: str = "us-east-1",
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        prefix: str = "",
    ):
        self.region = region
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.prefix = prefix
        self._client = None
        logger.info("Initialized AWSSecretsManagerProvider", region=region)

    async def _get_client(self):
        if self._client is None:
            try:
                import boto3
            except ImportError:
                raise ImportError("boto3 package required. Install with: pip install boto3")

            if self.access_key_id and self.secret_access_key:
                self._client = boto3.client(
                    "secretsmanager",
                    region_name=self.region,
                    aws_access_key_id=self.access_key_id,
                    aws_secret_access_key=self.secret_access_key,
                )
            else:
                # Use default credentials (IAM role, env vars, etc.)
                self._client = boto3.client("secretsmanager", region_name=self.region)

        return self._client

    async def get_secret(self, key: str) -> str | None:
        client = await self._get_client()
        secret_name = f"{self.prefix}{key}" if self.prefix else key

        try:
            response = client.get_secret_value(SecretId=secret_name)
            # AWS can store string or binary
            if "SecretString" in response:
                secret_value = response["SecretString"]
                # Try to parse as JSON
                try:
                    data = json.loads(secret_value)
                    return data.get("value", secret_value)
                except json.JSONDecodeError:
                    return secret_value
            else:
                import base64
                return base64.b64decode(response["SecretBinary"]).decode()
        except Exception as e:
            logger.warning("Failed to get secret from AWS", key=key, error=str(e))
            return None

    async def get_secrets(self, keys: list[str]) -> dict[str, str | None]:
        return {key: await self.get_secret(key) for key in keys}

    async def set_secret(self, key: str, value: str) -> None:
        client = await self._get_client()
        secret_name = f"{self.prefix}{key}" if self.prefix else key

        try:
            # Try to update existing
            client.put_secret_value(
                SecretId=secret_name,
                SecretString=json.dumps({"value": value}),
            )
        except client.exceptions.ResourceNotFoundException:
            # Create new
            client.create_secret(
                Name=secret_name,
                SecretString=json.dumps({"value": value}),
            )

        logger.debug("Secret saved to AWS Secrets Manager", key=key)

    async def delete_secret(self, key: str) -> None:
        client = await self._get_client()
        secret_name = f"{self.prefix}{key}" if self.prefix else key

        client.delete_secret(
            SecretId=secret_name,
            ForceDeleteWithoutRecovery=True,
        )
        logger.debug("Secret deleted from AWS Secrets Manager", key=key)

    async def list_secrets(self) -> list[str]:
        client = await self._get_client()
        secrets = []
        paginator = client.get_paginator("list_secrets")

        for page in paginator.paginate():
            for secret in page["SecretList"]:
                name = secret["Name"]
                if self.prefix and name.startswith(self.prefix):
                    name = name[len(self.prefix):]
                secrets.append(name)

        return secrets

    async def health_check(self) -> bool:
        try:
            client = await self._get_client()
            client.list_secrets(MaxResults=1)
            return True
        except Exception:
            return False
