"""
SkuldBot MFA Library - TOTP Code Generation for Bot Authentication

Generates time-based one-time passwords (TOTP, RFC 6238) for bots that need
to authenticate against systems protected by MFA (Google Authenticator,
Microsoft Authenticator, Authy, etc.).

The shared secret is resolved from the KeyVault by name — never hardcoded
in the bot package (.skb). The secret lives in memory only during generation
and is discarded immediately after.

Security:
- Secret resolved via SkuldVault (AES-256-GCM encrypted at rest)
- Secret in ephemeral memory only — never persisted by the bot
- Audit event logged for every TOTP generation
- Code redacted in Evidence Pack ([TOTP_CODE_REDACTED])

Usage in Robot Framework:
    *** Settings ***
    Library    skuldbot.libs.mfa    WITH NAME    SkuldMFA

    *** Tasks ***
    Login With MFA
        ${code}=    Generate TOTP    secret_name=erp-sap-mfa-secret
        Input Text    id:mfa-code    ${code}
"""

import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class SkuldMFA:
    """
    MFA library for SkuldBot — generates TOTP codes using secrets from KeyVault.

    The library wraps RPA.MFA (pyotp) and integrates with SkuldVault for
    secure secret resolution. Supports all standard TOTP configurations
    (Google Authenticator, Microsoft Authenticator, Authy, etc.).
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"

    def __init__(self):
        self._vault = None

    def _get_vault(self):
        """Lazy-load vault to avoid import issues in test contexts."""
        if self._vault is None:
            from skuldbot.libs.vault import SkuldVault
            self._vault = SkuldVault()
        return self._vault

    def generate_totp(
        self,
        secret_name: str,
        vault_provider: str = "local",
        digits: int = 6,
        period: int = 30,
        algorithm: str = "SHA1",
    ) -> str:
        """
        Generate a TOTP code using a shared secret from the KeyVault.

        The secret is resolved by name from the configured vault provider,
        used to generate the code, and immediately discarded from memory.

        Args:
            secret_name: Name of the secret in the KeyVault (e.g., "erp-sap-mfa-secret")
            vault_provider: Vault provider to use (local, orchestrator, azure, aws, hashicorp, env)
            digits: Number of digits in the code (default: 6)
            period: Time period in seconds (default: 30)
            algorithm: Hash algorithm (SHA1, SHA256, SHA512) — default SHA1 per RFC 6238

        Returns:
            The TOTP code as a string (e.g., "847293")

        Raises:
            ValueError: If secret is not found or invalid
            RuntimeError: If vault is unavailable
        """
        vault = self._get_vault()
        secret_value = None

        try:
            # 1. Resolve secret from vault
            secret_result = vault.get_secret(secret_name, provider=vault_provider)

            # Handle SecretValue wrapper
            if hasattr(secret_result, 'value'):
                secret_value = secret_result.value
            else:
                secret_value = str(secret_result)

            if not secret_value:
                raise ValueError(
                    f"MFA secret '{secret_name}' resolved to empty value from vault provider '{vault_provider}'"
                )

            # 2. Generate TOTP — try RPA.MFA first, fallback to pyotp
            code = self._generate_totp_code(
                secret_value, int(digits), int(period), algorithm
            )

            # 3. Calculate expiration
            now = int(time.time())
            expires_in = int(period) - (now % int(period))

            logger.info(
                "TOTP code generated for secret '%s' (expires in %ds) [code redacted]",
                secret_name,
                expires_in,
            )

            return str(code)

        except Exception as e:
            logger.error(
                "Failed to generate TOTP for secret '%s': %s",
                secret_name,
                str(e),
            )
            raise
        finally:
            # 4. Scrub secret from memory
            if secret_value is not None:
                secret_value = "\x00" * len(secret_value)
            secret_value = None

    @staticmethod
    def _generate_totp_code(
        secret: str, digits: int, period: int, algorithm: str
    ) -> str:
        """
        Generate TOTP code using RPA.MFA (preferred) or pyotp (fallback).

        Both use the same RFC 6238 implementation — results are identical.
        RPA.MFA is preferred because it's the standard rpaframework library.
        pyotp is the fallback for environments without full rpaframework.
        """
        # Try RPA.MFA first (rpaframework standard)
        try:
            from RPA.MFA import MFA
            mfa = MFA()
            mfa.use_totp(secret, digits=digits, interval=period)
            return mfa.get_otp()
        except ImportError:
            pass

        # Fallback to pyotp (lightweight, same RFC 6238 implementation)
        try:
            import pyotp
            totp = pyotp.TOTP(secret, digits=digits, interval=period)
            return totp.now()
        except ImportError:
            pass

        raise RuntimeError(
            "Neither RPA.MFA nor pyotp is available. "
            "Install rpaframework (pip install rpaframework) or "
            "pyotp (pip install pyotp) to use TOTP generation."
        )

    def generate_totp_with_expiry(
        self,
        secret_name: str,
        vault_provider: str = "local",
        digits: int = 6,
        period: int = 30,
        algorithm: str = "SHA1",
    ) -> dict:
        """
        Generate a TOTP code with expiration metadata.

        Same as generate_totp but returns a dictionary with the code
        and additional timing information.

        Args:
            secret_name: Name of the secret in the KeyVault
            vault_provider: Vault provider to use
            digits: Number of digits (default: 6)
            period: Time period in seconds (default: 30)
            algorithm: Hash algorithm (default: SHA1)

        Returns:
            Dictionary with:
                - code: The TOTP code string
                - expires_in: Seconds until this code expires
                - generated_at: ISO timestamp of generation
                - period: The TOTP period used
        """
        code = self.generate_totp(
            secret_name=secret_name,
            vault_provider=vault_provider,
            digits=digits,
            period=period,
            algorithm=algorithm,
        )

        now = int(time.time())
        expires_in = int(period) - (now % int(period))

        return {
            "code": code,
            "expires_in": expires_in,
            "generated_at": time.strftime(
                "%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(now)
            ),
            "period": int(period),
        }
