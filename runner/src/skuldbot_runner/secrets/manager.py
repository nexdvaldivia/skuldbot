"""Secrets manager that coordinates multiple providers."""

from typing import Any

import structlog

from .providers import (
    SecretsProvider,
    EnvSecretsProvider,
    FileSecretsProvider,
    HashiCorpVaultProvider,
    AzureKeyVaultProvider,
    AWSSecretsManagerProvider,
)

logger = structlog.get_logger()


class SecretsManager:
    """
    Manages secrets across multiple providers with fallback support.

    The manager checks providers in order until a secret is found.
    This allows layered configuration: env vars override vault, etc.
    """

    def __init__(self):
        self._providers: list[tuple[str, SecretsProvider]] = []
        self._primary_provider: SecretsProvider | None = None

    def add_provider(self, name: str, provider: SecretsProvider, primary: bool = False) -> None:
        """Add a secrets provider."""
        self._providers.append((name, provider))
        if primary:
            self._primary_provider = provider
        logger.info("Added secrets provider", name=name, primary=primary)

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> "SecretsManager":
        """
        Create a SecretsManager from configuration.

        Config format:
        {
            "providers": [
                {
                    "name": "env",
                    "type": "env",
                    "prefix": "SKULDBOT_SECRET_",
                    "primary": false
                },
                {
                    "name": "vault",
                    "type": "hashicorp",
                    "url": "https://vault.example.com",
                    "token": "...",
                    "primary": true
                }
            ]
        }
        """
        manager = cls()

        for provider_config in config.get("providers", []):
            provider_type = provider_config.get("type", "env")
            name = provider_config.get("name", provider_type)
            primary = provider_config.get("primary", False)

            provider = cls._create_provider(provider_type, provider_config)
            manager.add_provider(name, provider, primary)

        # Always add env as fallback if no providers configured
        if not manager._providers:
            manager.add_provider("env", EnvSecretsProvider())

        return manager

    @staticmethod
    def _create_provider(provider_type: str, config: dict[str, Any]) -> SecretsProvider:
        """Create a provider instance from config."""
        if provider_type == "env":
            return EnvSecretsProvider(
                prefix=config.get("prefix", "SKULDBOT_SECRET_"),
            )

        elif provider_type == "file":
            return FileSecretsProvider(
                file_path=config.get("file_path", "~/.skuldbot/secrets.json"),
                encryption_key=config.get("encryption_key"),
            )

        elif provider_type == "hashicorp":
            return HashiCorpVaultProvider(
                url=config["url"],
                token=config.get("token"),
                role_id=config.get("role_id"),
                secret_id=config.get("secret_id"),
                mount_point=config.get("mount_point", "secret"),
                kv_version=config.get("kv_version", 2),
            )

        elif provider_type == "azure":
            return AzureKeyVaultProvider(
                vault_url=config["vault_url"],
                tenant_id=config.get("tenant_id"),
                client_id=config.get("client_id"),
                client_secret=config.get("client_secret"),
                use_managed_identity=config.get("use_managed_identity", False),
            )

        elif provider_type == "aws":
            return AWSSecretsManagerProvider(
                region=config.get("region", "us-east-1"),
                access_key_id=config.get("access_key_id"),
                secret_access_key=config.get("secret_access_key"),
                prefix=config.get("prefix", ""),
            )

        else:
            raise ValueError(f"Unknown provider type: {provider_type}")

    async def get_secret(self, key: str) -> str | None:
        """
        Get a secret, checking providers in order.
        Returns the first found value or None.
        """
        for name, provider in self._providers:
            value = await provider.get_secret(key)
            if value is not None:
                logger.debug("Secret found", key=key, provider=name)
                return value

        logger.debug("Secret not found in any provider", key=key)
        return None

    async def get_secrets(self, keys: list[str]) -> dict[str, str | None]:
        """Get multiple secrets."""
        return {key: await self.get_secret(key) for key in keys}

    async def set_secret(self, key: str, value: str) -> None:
        """Set a secret in the primary provider."""
        if not self._primary_provider:
            if self._providers:
                self._primary_provider = self._providers[0][1]
            else:
                raise RuntimeError("No secrets provider configured")

        await self._primary_provider.set_secret(key, value)

    async def delete_secret(self, key: str) -> None:
        """Delete a secret from the primary provider."""
        if self._primary_provider:
            await self._primary_provider.delete_secret(key)

    async def list_secrets(self) -> dict[str, list[str]]:
        """List secrets from all providers."""
        result = {}
        for name, provider in self._providers:
            result[name] = await provider.list_secrets()
        return result

    async def health_check(self) -> dict[str, bool]:
        """Check health of all providers."""
        result = {}
        for name, provider in self._providers:
            result[name] = await provider.health_check()
        return result

    def resolve_variables(self, text: str) -> str:
        """
        Resolve secret references in text.
        Format: ${vault.secret_name} or ${secret:secret_name}

        Note: This is synchronous for template processing.
        Use get_secret() for async access.
        """
        import re
        import asyncio

        pattern = r'\$\{(?:vault\.|secret:)([^}]+)\}'

        def replace(match):
            key = match.group(1)
            # Run async in sync context
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # We're in an async context, can't use run_until_complete
                    # Return placeholder for later resolution
                    return match.group(0)
                value = loop.run_until_complete(self.get_secret(key))
                return value if value else match.group(0)
            except Exception:
                return match.group(0)

        return re.sub(pattern, replace, text)


# Global instance for convenience
_default_manager: SecretsManager | None = None


def get_secrets_manager() -> SecretsManager:
    """Get the default secrets manager."""
    global _default_manager
    if _default_manager is None:
        _default_manager = SecretsManager()
        _default_manager.add_provider("env", EnvSecretsProvider())
    return _default_manager


def configure_secrets(config: dict[str, Any]) -> SecretsManager:
    """Configure and return the default secrets manager."""
    global _default_manager
    _default_manager = SecretsManager.from_config(config)
    return _default_manager
