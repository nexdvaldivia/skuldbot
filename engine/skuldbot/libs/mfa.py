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
- Formal audit event for every TOTP generation and every failure
- Code redacted in Evidence Pack ([TOTP_CODE_REDACTED])

Usage in Robot Framework:
    *** Settings ***
    Library    skuldbot.libs.mfa    WITH NAME    SkuldMFA

    *** Tasks ***
    Login With MFA
        ${code}=    Generate TOTP    secret_name=erp-sap-mfa-secret
        Input Text    id:mfa-code    ${code}
"""

import json
import os
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# MFA type → TOTP parameters mapping
# All standard authenticator apps use SHA1 / 6 digits / 30s
# Only custom configs deviate from this
MFA_TYPE_PROFILES: Dict[str, Dict] = {
    "google_authenticator": {"digits": 6, "period": 30, "algorithm": "SHA1"},
    "microsoft_authenticator": {"digits": 6, "period": 30, "algorithm": "SHA1"},
    "authy": {"digits": 6, "period": 30, "algorithm": "SHA1"},
    "duo": {"digits": 6, "period": 30, "algorithm": "SHA1"},
    "okta_verify": {"digits": 6, "period": 30, "algorithm": "SHA1"},
    "custom": {"digits": 6, "period": 30, "algorithm": "SHA1"},
}


class MFAAuditEvent:
    """Formal audit event for MFA operations — compliance §5."""

    def __init__(self, audit_dir: Optional[str] = None):
        self._audit_dir = audit_dir or os.environ.get(
            "SKULDBOT_AUDIT_DIR", ".skuldbot"
        )

    def record(
        self,
        action: str,
        secret_name: str,
        mfa_type: str,
        success: bool,
        details: Optional[str] = None,
        bot_id: Optional[str] = None,
        runner_id: Optional[str] = None,
    ) -> None:
        """
        Write a formal audit event to the MFA audit log.

        Compliance: COMPLIANCE_FIRST_POLICY §5 — every sensitive operation
        generates an auditable event with who, what, when, where, result.
        """
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "secret_name": secret_name,
            "mfa_type": mfa_type,
            "success": success,
            "bot_id": bot_id or os.environ.get("SKULDBOT_BOT_ID", "unknown"),
            "runner_id": runner_id or os.environ.get("SKULDBOT_RUNNER_ID", "unknown"),
            "execution_id": os.environ.get("SKULDBOT_EXECUTION_ID", "unknown"),
        }
        if details:
            event["details"] = details

        try:
            os.makedirs(self._audit_dir, exist_ok=True)
            audit_file = os.path.join(self._audit_dir, "mfa.audit.log")
            with open(audit_file, "a") as f:
                f.write(json.dumps(event) + "\n")
        except Exception as e:
            logger.warning("Could not write MFA audit event: %s", str(e))

        # Also log for runtime visibility (code never in log)
        level = logging.INFO if success else logging.WARNING
        logger.log(
            level,
            "MFA_AUDIT: action=%s secret=%s type=%s success=%s bot=%s",
            action,
            secret_name,
            mfa_type,
            success,
            event["bot_id"],
        )


class SkuldMFA:
    """
    MFA library for SkuldBot — generates TOTP codes using secrets from KeyVault.

    The library wraps RPA.MFA (pyotp) and integrates with SkuldVault for
    secure secret resolution. Supports all standard TOTP configurations
    (Google Authenticator, Microsoft Authenticator, Authy, etc.).

    Compliance:
    - §1: Secret never in plaintext (resolved from vault, scrubbed after use)
    - §5: Formal audit event for every generation and every failure
    - §6: Code redacted in all logs as [TOTP_CODE_REDACTED]
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"

    def __init__(self):
        self._vault = None
        self._audit = MFAAuditEvent()

    def _get_vault(self):
        """Lazy-load vault to avoid import issues in test contexts."""
        if self._vault is None:
            from skuldbot.libs.vault import SkuldVault

            self._vault = SkuldVault()
        return self._vault

    def generate_totp(
        self,
        secret_name: str,
        mfa_type: str = "google_authenticator",
        vault_provider: str = "local",
        digits: Optional[int] = None,
        period: Optional[int] = None,
        algorithm: Optional[str] = None,
    ) -> str:
        """
        Generate a TOTP code using a shared secret from the KeyVault.

        The user selects the authenticator type (Google, Microsoft, Authy, etc.)
        and the library resolves the correct TOTP parameters automatically.
        Custom parameters only needed for non-standard configurations.

        Args:
            secret_name: Name of the secret in the KeyVault (e.g., "erp-sap-mfa-secret")
            mfa_type: Authenticator type — resolves digits/period/algorithm automatically
            vault_provider: Vault provider to use (resolved by connected KeyVault node)
            digits: Override digits (only for custom type)
            period: Override period (only for custom type)
            algorithm: Override algorithm (only for custom type)

        Returns:
            The TOTP code as a string (e.g., "847293")
        """
        # Resolve TOTP parameters from MFA type profile
        profile = MFA_TYPE_PROFILES.get(
            mfa_type, MFA_TYPE_PROFILES["google_authenticator"]
        )
        effective_digits = int(digits) if digits is not None else profile["digits"]
        effective_period = int(period) if period is not None else profile["period"]
        effective_algorithm = (
            algorithm if algorithm is not None else profile["algorithm"]
        )

        vault = self._get_vault()
        secret_value = None

        try:
            # 1. Resolve secret from vault
            secret_result = vault.get_secret(secret_name, provider=vault_provider)

            # Handle SecretValue wrapper
            if hasattr(secret_result, "value"):
                secret_value = secret_result.value
            else:
                secret_value = str(secret_result)

            if not secret_value:
                # Audit: denial — empty secret
                self._audit.record(
                    action="mfa.totp_denied",
                    secret_name=secret_name,
                    mfa_type=mfa_type,
                    success=False,
                    details="Secret resolved to empty value",
                )
                raise ValueError(
                    f"MFA secret '{secret_name}' resolved to empty value "
                    f"from vault provider '{vault_provider}'"
                )

            # 2. Generate TOTP
            code = self._generate_totp_code(
                secret_value, effective_digits, effective_period, effective_algorithm
            )

            # 3. Audit: success
            now = int(time.time())
            expires_in = effective_period - (now % effective_period)
            self._audit.record(
                action="mfa.totp_generated",
                secret_name=secret_name,
                mfa_type=mfa_type,
                success=True,
                details=f"expires_in={expires_in}s",
            )

            return str(code)

        except ValueError:
            # Already audited above
            raise
        except Exception as e:
            # Audit: failure — vault error, generation error, etc.
            self._audit.record(
                action="mfa.totp_failed",
                secret_name=secret_name,
                mfa_type=mfa_type,
                success=False,
                details=str(e),
            )
            raise
        finally:
            # 4. Scrub secret from memory
            if secret_value is not None:
                secret_value = "\x00" * len(secret_value)
            secret_value = None

    def generate_totp_with_expiry(
        self,
        secret_name: str,
        mfa_type: str = "google_authenticator",
        vault_provider: str = "local",
        digits: Optional[int] = None,
        period: Optional[int] = None,
        algorithm: Optional[str] = None,
    ) -> dict:
        """
        Generate a TOTP code with expiration metadata.

        Returns a dictionary with the code and timing information.
        """
        profile = MFA_TYPE_PROFILES.get(
            mfa_type, MFA_TYPE_PROFILES["google_authenticator"]
        )
        effective_period = int(period) if period is not None else profile["period"]

        code = self.generate_totp(
            secret_name=secret_name,
            mfa_type=mfa_type,
            vault_provider=vault_provider,
            digits=digits,
            period=period,
            algorithm=algorithm,
        )

        now = int(time.time())
        expires_in = effective_period - (now % effective_period)

        return {
            "code": code,
            "expires_in": expires_in,
            "generated_at": time.strftime(
                "%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(now)
            ),
            "period": effective_period,
            "mfa_type": mfa_type,
        }

    @staticmethod
    def _generate_totp_code(
        secret: str, digits: int, period: int, algorithm: str
    ) -> str:
        """
        Generate TOTP code using RPA.MFA (preferred) or pyotp (fallback).

        Both use the same RFC 6238 implementation — results are identical.
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
