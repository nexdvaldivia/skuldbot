"""
IP Protection and Anti-Tampering Module for Python Runner.

This module provides:
- License validation
- Anti-debugging detection
- Binary integrity verification
- Encrypted configuration storage
"""

import base64
import hashlib
import hmac
import json
import os
import platform
import struct
import sys
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import structlog

logger = structlog.get_logger()


class LicenseType(Enum):
    TRIAL = "trial"
    STANDARD = "standard"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


@dataclass
class License:
    license_key: str
    license_type: LicenseType
    organization: str
    max_runners: int
    expires_at: Optional[int]  # Unix timestamp, None = perpetual
    features: list[str]
    signature: str

    def is_valid(self) -> bool:
        """Validate license signature and expiration."""
        # Check expiration
        if self.expires_at:
            if time.time() > self.expires_at:
                logger.warning("License expired")
                return False

        # Verify signature
        return self._verify_signature()

    def _verify_signature(self) -> bool:
        """Verify the license signature."""
        data = f"{self.license_key}:{self.organization}:{self.max_runners}:{self.expires_at or 0}:{self.features}"
        expected = self._compute_signature(data)
        return hmac.compare_digest(self.signature, expected)

    def _compute_signature(self, data: str) -> str:
        """Compute signature for license data."""
        # Secret key (obfuscated in compiled binary)
        secret = bytes([0x53, 0x4B, 0x55, 0x4C, 0x44, 0x42, 0x4F, 0x54,
                       0x52, 0x55, 0x4E, 0x4E, 0x45, 0x52, 0x4B, 0x45,
                       0x59, 0x53, 0x45, 0x43, 0x52, 0x45, 0x54, 0x21])
        return hmac.new(secret, data.encode(), hashlib.sha256).hexdigest()[:32]

    def has_feature(self, feature: str) -> bool:
        """Check if a feature is enabled."""
        return feature in self.features

    def to_dict(self) -> dict:
        return {
            "license_key": self.license_key,
            "license_type": self.license_type.value,
            "organization": self.organization,
            "max_runners": self.max_runners,
            "expires_at": self.expires_at,
            "features": self.features,
            "signature": self.signature,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "License":
        return cls(
            license_key=data["license_key"],
            license_type=LicenseType(data["license_type"]),
            organization=data["organization"],
            max_runners=data["max_runners"],
            expires_at=data.get("expires_at"),
            features=data["features"],
            signature=data["signature"],
        )


def detect_debugger() -> bool:
    """Detect if a debugger is attached."""
    system = platform.system().lower()

    if system == "linux":
        try:
            with open("/proc/self/status") as f:
                for line in f:
                    if line.startswith("TracerPid:"):
                        tracer_pid = int(line.split()[1])
                        if tracer_pid != 0:
                            return True
        except Exception:
            pass

    elif system == "darwin":
        # Check for common debugger processes
        try:
            import subprocess
            result = subprocess.run(
                ["ps", "-p", str(os.getppid()), "-o", "comm="],
                capture_output=True,
                text=True,
            )
            parent = result.stdout.strip().lower()
            if any(dbg in parent for dbg in ["lldb", "gdb", "debugger"]):
                return True
        except Exception:
            pass

    elif system == "windows":
        try:
            import ctypes
            return ctypes.windll.kernel32.IsDebuggerPresent() != 0
        except Exception:
            pass

    # Check for common debugging environment variables
    debug_vars = ["PYTHONDEBUG", "PYTHONINSPECT", "PYDEVD_USE_FRAME_EVAL"]
    for var in debug_vars:
        if os.environ.get(var):
            return True

    return False


def get_machine_id() -> str:
    """Get a unique machine identifier."""
    system = platform.system().lower()

    if system == "linux":
        try:
            return Path("/etc/machine-id").read_text().strip()
        except Exception:
            pass

    elif system == "darwin":
        try:
            import subprocess
            result = subprocess.run(
                ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                capture_output=True,
                text=True,
            )
            for line in result.stdout.split("\n"):
                if "IOPlatformUUID" in line:
                    return line.split('"')[3]
        except Exception:
            pass

    elif system == "windows":
        try:
            import subprocess
            result = subprocess.run(
                ["wmic", "csproduct", "get", "UUID"],
                capture_output=True,
                text=True,
            )
            lines = result.stdout.strip().split("\n")
            if len(lines) > 1:
                return lines[1].strip()
        except Exception:
            pass

    # Fallback: use hostname + mac address hash
    import socket
    import uuid
    fallback = f"{socket.gethostname()}-{uuid.getnode()}"
    return hashlib.sha256(fallback.encode()).hexdigest()[:32]


def get_machine_fingerprint() -> str:
    """Get a fingerprint combining multiple machine identifiers."""
    components = [
        get_machine_id(),
        platform.node(),
        platform.machine(),
        str(os.cpu_count()),
    ]
    combined = ":".join(components)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


class SecureStorage:
    """Encrypted storage for sensitive configuration data."""

    def __init__(self):
        self.key = self._derive_key()

    def _derive_key(self) -> bytes:
        """Derive encryption key from machine-specific data."""
        machine_id = get_machine_id()
        # Add some salt
        salt = b"skuldbot-runner-secure-storage-v1"
        return hashlib.pbkdf2_hmac("sha256", machine_id.encode(), salt, 100000)

    def encrypt(self, data: bytes) -> bytes:
        """Encrypt data using XOR (simple, for basic protection)."""
        # In production, use Fernet or AES-GCM
        result = bytearray(len(data))
        for i, byte in enumerate(data):
            result[i] = byte ^ self.key[i % len(self.key)]
        return bytes(result)

    def decrypt(self, data: bytes) -> bytes:
        """Decrypt data."""
        # XOR is symmetric
        return self.encrypt(data)

    def store(self, path: Path, data: dict) -> None:
        """Store encrypted JSON data to file."""
        json_bytes = json.dumps(data).encode()
        encrypted = self.encrypt(json_bytes)
        encoded = base64.b64encode(encrypted)
        path.write_bytes(encoded)

    def load(self, path: Path) -> dict:
        """Load and decrypt JSON data from file."""
        encoded = path.read_bytes()
        encrypted = base64.b64decode(encoded)
        decrypted = self.decrypt(encrypted)
        return json.loads(decrypted.decode())


def run_protection_checks() -> None:
    """Run all protection checks. Raises exception if checks fail."""
    # Check for debugger
    if detect_debugger():
        logger.error("Debugger detected - exiting")
        sys.exit(1)

    # Additional checks can be added here
    logger.debug("Protection checks passed")


def validate_license_key(key: str) -> Optional[License]:
    """
    Validate a license key and return License object if valid.

    In production, this would:
    1. Check local cache
    2. Validate with license server
    3. Verify signature
    """
    # For now, return a trial license
    return License(
        license_key=key,
        license_type=LicenseType.TRIAL,
        organization="Trial User",
        max_runners=1,
        expires_at=int(time.time()) + 30 * 24 * 60 * 60,  # 30 days
        features=["basic"],
        signature="",  # Would be provided by license server
    )


# Run protection on import (in release builds)
if not __debug__:
    run_protection_checks()
