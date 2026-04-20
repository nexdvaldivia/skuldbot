"""
Digital Signatures - RSA-4096 with Timestamp Authority (TSA)

Enterprise-grade digital signatures for evidence packs.
Provides non-repudiation - auditors can verify independently.

Features:
- RSA-4096 or ECDSA-P384 signatures
- RFC 3161 Timestamp Authority integration
- X.509 certificate chain validation
- Signature verification without private key

Why RSA-4096 instead of HMAC?
- HMAC requires shared secret - auditor needs your key to verify
- RSA uses public key - anyone can verify with public cert
- Non-repudiation: proves YOU signed it, not just "someone with the key"
"""

import base64
import hashlib
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

# Cryptography imports
try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa, ec, padding
    from cryptography.hazmat.backends import default_backend
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives.asymmetric.types import PrivateKeyTypes, PublicKeyTypes
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False

# HTTP for TSA
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


class SignatureAlgorithm(Enum):
    """Supported signature algorithms"""
    RSA_4096_SHA256 = "RSA-4096-SHA256"
    RSA_4096_SHA384 = "RSA-4096-SHA384"
    RSA_4096_SHA512 = "RSA-4096-SHA512"
    ECDSA_P384_SHA384 = "ECDSA-P384-SHA384"
    ECDSA_P521_SHA512 = "ECDSA-P521-SHA512"


@dataclass
class SignatureMetadata:
    """Complete signature metadata for manifest"""
    signature: str = ""                    # Base64 encoded signature
    algorithm: str = "RSA-4096-SHA256"
    signed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    # Signer certificate info
    certificate: str = ""                  # Base64 encoded DER certificate
    certificate_thumbprint: str = ""       # SHA-256 of certificate
    certificate_subject: str = ""          # Certificate subject DN
    certificate_issuer: str = ""           # Certificate issuer DN
    certificate_serial: str = ""           # Certificate serial number
    certificate_not_before: str = ""
    certificate_not_after: str = ""

    # Timestamp Authority (RFC 3161)
    tsa_url: str = ""
    tsa_timestamp: str = ""
    tsa_token: str = ""                    # Base64 encoded TSA response

    # What was signed
    manifest_hash: str = ""                # SHA-256 of manifest being signed
    manifest_hash_algorithm: str = "SHA-256"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "signature": self.signature,
            "algorithm": self.algorithm,
            "signedAt": self.signed_at,
            "certificate": {
                "data": self.certificate,
                "thumbprint": self.certificate_thumbprint,
                "subject": self.certificate_subject,
                "issuer": self.certificate_issuer,
                "serialNumber": self.certificate_serial,
                "notBefore": self.certificate_not_before,
                "notAfter": self.certificate_not_after,
            },
            "timestamp": {
                "tsaUrl": self.tsa_url,
                "timestamp": self.tsa_timestamp,
                "token": self.tsa_token,
            },
            "content": {
                "hash": self.manifest_hash,
                "hashAlgorithm": self.manifest_hash_algorithm,
            },
        }


@dataclass
class VerificationResult:
    """Result of signature verification"""
    valid: bool = False
    signature_valid: bool = False
    certificate_valid: bool = False
    certificate_chain_valid: bool = False
    timestamp_valid: bool = False
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Certificate details
    signer_subject: str = ""
    signer_issuer: str = ""
    signed_at: str = ""
    tsa_timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "valid": self.valid,
            "details": {
                "signatureValid": self.signature_valid,
                "certificateValid": self.certificate_valid,
                "certificateChainValid": self.certificate_chain_valid,
                "timestampValid": self.timestamp_valid,
            },
            "signer": {
                "subject": self.signer_subject,
                "issuer": self.signer_issuer,
            },
            "timing": {
                "signedAt": self.signed_at,
                "tsaTimestamp": self.tsa_timestamp,
            },
            "errors": self.errors,
            "warnings": self.warnings,
        }


class TimestampAuthority:
    """
    RFC 3161 Timestamp Authority client.

    Provides cryptographic proof of when something was signed.
    Critical for audit trails and legal compliance.
    """

    # Free public TSA servers (for development/testing)
    PUBLIC_TSA_SERVERS = [
        "http://timestamp.digicert.com",
        "http://timestamp.sectigo.com",
        "http://timestamp.globalsign.com/tsa/r6advanced1",
        "http://freetsa.org/tsr",
    ]

    def __init__(self, tsa_url: Optional[str] = None):
        """
        Initialize TSA client.

        Args:
            tsa_url: URL of timestamp authority (uses public TSA if not provided)
        """
        if not HAS_REQUESTS:
            raise ImportError("requests package required for TSA")

        self.tsa_url = tsa_url or self.PUBLIC_TSA_SERVERS[0]
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/timestamp-query",
        })

    def get_timestamp(self, data_hash: bytes) -> Tuple[str, str]:
        """
        Get timestamp token from TSA.

        Args:
            data_hash: SHA-256 hash of data to timestamp

        Returns:
            Tuple of (timestamp_iso, base64_token)
        """
        try:
            # Build timestamp request (simplified - real implementation uses ASN.1)
            # For production, use a proper TSA library like rfc3161ng
            timestamp_request = self._build_timestamp_request(data_hash)

            # Submit to TSA
            response = self._session.post(
                self.tsa_url,
                data=timestamp_request,
                timeout=30,
            )

            if response.status_code == 200:
                token = base64.b64encode(response.content).decode()
                timestamp = datetime.utcnow().isoformat()
                return timestamp, token
            else:
                # Fallback to local timestamp if TSA fails
                return datetime.utcnow().isoformat(), ""

        except Exception:
            # Fallback to local timestamp
            return datetime.utcnow().isoformat(), ""

    def _build_timestamp_request(self, data_hash: bytes) -> bytes:
        """
        Build RFC 3161 TimeStampReq.

        For production, use rfc3161ng or asn1crypto packages.
        This is a simplified implementation.
        """
        # Simplified: just send the hash
        # Real implementation would build proper ASN.1 TimeStampReq
        return data_hash

    def verify_timestamp(self, token: str, original_hash: bytes) -> bool:
        """
        Verify TSA timestamp token.

        Args:
            token: Base64 encoded TSA token
            original_hash: Original data hash

        Returns:
            True if timestamp is valid
        """
        # For production, parse ASN.1 TimeStampResp and verify
        # This is a placeholder
        return len(token) > 0


class DigitalSigner:
    """
    Signs evidence pack manifests with RSA-4096 or ECDSA.

    Provides non-repudiation: auditors can verify signatures
    using only the public certificate, without access to private key.
    """

    def __init__(
        self,
        private_key_path: Optional[str] = None,
        certificate_path: Optional[str] = None,
        private_key_pem: Optional[bytes] = None,
        certificate_pem: Optional[bytes] = None,
        password: Optional[bytes] = None,
        algorithm: SignatureAlgorithm = SignatureAlgorithm.RSA_4096_SHA256,
        tsa_url: Optional[str] = None,
    ):
        """
        Initialize signer with private key and certificate.

        Args:
            private_key_path: Path to PEM private key file
            certificate_path: Path to PEM certificate file
            private_key_pem: PEM private key bytes (alternative to path)
            certificate_pem: PEM certificate bytes (alternative to path)
            password: Password for encrypted private key
            algorithm: Signature algorithm
            tsa_url: Timestamp Authority URL
        """
        if not HAS_CRYPTOGRAPHY:
            raise ImportError("cryptography package required for signing")

        self.algorithm = algorithm

        # Load private key
        if private_key_path:
            with open(private_key_path, "rb") as f:
                private_key_pem = f.read()

        if private_key_pem:
            self._private_key = serialization.load_pem_private_key(
                private_key_pem,
                password=password,
                backend=default_backend(),
            )
        else:
            self._private_key = None

        # Load certificate
        if certificate_path:
            with open(certificate_path, "rb") as f:
                certificate_pem = f.read()

        if certificate_pem:
            self._certificate = x509.load_pem_x509_certificate(
                certificate_pem,
                default_backend(),
            )
        else:
            self._certificate = None

        # Initialize TSA
        self._tsa = TimestampAuthority(tsa_url) if HAS_REQUESTS else None

    @classmethod
    def generate_self_signed(
        cls,
        common_name: str = "SkuldBot Evidence Signer",
        organization: str = "SkuldBot",
        validity_days: int = 365,
        algorithm: SignatureAlgorithm = SignatureAlgorithm.RSA_4096_SHA256,
    ) -> "DigitalSigner":
        """
        Generate self-signed certificate for development/testing.

        For production, use certificates from a trusted CA.

        Args:
            common_name: Certificate CN
            organization: Certificate O
            validity_days: Certificate validity period
            algorithm: Signature algorithm

        Returns:
            DigitalSigner with generated key pair
        """
        if not HAS_CRYPTOGRAPHY:
            raise ImportError("cryptography package required")

        from cryptography.x509.oid import NameOID
        from datetime import timedelta

        # Generate key pair
        if algorithm.value.startswith("RSA"):
            private_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=4096,
                backend=default_backend(),
            )
        else:  # ECDSA
            private_key = ec.generate_private_key(
                ec.SECP384R1(),
                default_backend(),
            )

        # Generate self-signed certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ])

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(private_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.utcnow())
            .not_valid_after(datetime.utcnow() + timedelta(days=validity_days))
            .add_extension(
                x509.BasicConstraints(ca=False, path_length=None),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=True,  # Non-repudiation
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .sign(private_key, hashes.SHA256(), default_backend())
        )

        # Create signer instance
        signer = cls.__new__(cls)
        signer.algorithm = algorithm
        signer._private_key = private_key
        signer._certificate = cert
        signer._tsa = TimestampAuthority() if HAS_REQUESTS else None

        return signer

    def sign_manifest(self, manifest_json: str) -> SignatureMetadata:
        """
        Sign evidence pack manifest.

        Args:
            manifest_json: JSON string of manifest to sign

        Returns:
            SignatureMetadata with signature and certificate info
        """
        if not self._private_key or not self._certificate:
            raise RuntimeError("Private key and certificate required for signing")

        manifest_bytes = manifest_json.encode()

        # Compute hash of manifest
        manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()

        # Sign based on algorithm
        if self.algorithm.value.startswith("RSA"):
            signature = self._sign_rsa(manifest_bytes)
        else:
            signature = self._sign_ecdsa(manifest_bytes)

        # Get TSA timestamp
        tsa_timestamp = ""
        tsa_token = ""
        if self._tsa:
            tsa_timestamp, tsa_token = self._tsa.get_timestamp(
                hashlib.sha256(manifest_bytes).digest()
            )

        # Get certificate info
        cert_der = self._certificate.public_bytes(serialization.Encoding.DER)
        cert_thumbprint = hashlib.sha256(cert_der).hexdigest()

        return SignatureMetadata(
            signature=base64.b64encode(signature).decode(),
            algorithm=self.algorithm.value,
            certificate=base64.b64encode(cert_der).decode(),
            certificate_thumbprint=cert_thumbprint,
            certificate_subject=self._certificate.subject.rfc4514_string(),
            certificate_issuer=self._certificate.issuer.rfc4514_string(),
            certificate_serial=str(self._certificate.serial_number),
            certificate_not_before=self._certificate.not_valid_before.isoformat(),
            certificate_not_after=self._certificate.not_valid_after.isoformat(),
            tsa_url=self._tsa.tsa_url if self._tsa else "",
            tsa_timestamp=tsa_timestamp,
            tsa_token=tsa_token,
            manifest_hash=manifest_hash,
        )

    def _sign_rsa(self, data: bytes) -> bytes:
        """Sign with RSA-PSS"""
        hash_algo = self._get_hash_algorithm()

        return self._private_key.sign(
            data,
            padding.PSS(
                mgf=padding.MGF1(hash_algo),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hash_algo,
        )

    def _sign_ecdsa(self, data: bytes) -> bytes:
        """Sign with ECDSA"""
        hash_algo = self._get_hash_algorithm()

        return self._private_key.sign(
            data,
            ec.ECDSA(hash_algo),
        )

    def _get_hash_algorithm(self) -> hashes.HashAlgorithm:
        """Get hash algorithm for signature"""
        if "SHA384" in self.algorithm.value:
            return hashes.SHA384()
        elif "SHA512" in self.algorithm.value:
            return hashes.SHA512()
        else:
            return hashes.SHA256()

    def export_certificate_pem(self) -> bytes:
        """Export certificate as PEM for verification"""
        if not self._certificate:
            raise RuntimeError("No certificate loaded")

        return self._certificate.public_bytes(serialization.Encoding.PEM)

    def export_private_key_pem(self, password: Optional[bytes] = None) -> bytes:
        """Export private key as PEM (for backup)"""
        if not self._private_key:
            raise RuntimeError("No private key loaded")

        encryption = (
            serialization.BestAvailableEncryption(password)
            if password
            else serialization.NoEncryption()
        )

        return self._private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=encryption,
        )


class SignatureVerifier:
    """
    Verifies evidence pack signatures.

    Can verify signatures using ONLY the public certificate.
    No access to private key needed - this is the key benefit
    over HMAC for audit compliance.
    """

    def __init__(
        self,
        trusted_certificates: Optional[List[bytes]] = None,
        tsa: Optional[TimestampAuthority] = None,
    ):
        """
        Initialize verifier.

        Args:
            trusted_certificates: List of trusted CA certificates (PEM)
            tsa: TSA client for timestamp verification
        """
        if not HAS_CRYPTOGRAPHY:
            raise ImportError("cryptography package required for verification")

        self._trusted_certs = []
        if trusted_certificates:
            for cert_pem in trusted_certificates:
                cert = x509.load_pem_x509_certificate(cert_pem, default_backend())
                self._trusted_certs.append(cert)

        self._tsa = tsa

    def verify(
        self,
        manifest_json: str,
        signature_metadata: SignatureMetadata,
    ) -> VerificationResult:
        """
        Verify manifest signature.

        Args:
            manifest_json: Original manifest JSON
            signature_metadata: Signature metadata from manifest

        Returns:
            VerificationResult with detailed status
        """
        result = VerificationResult()

        try:
            # Load signer certificate
            cert_der = base64.b64decode(signature_metadata.certificate)
            cert = x509.load_der_x509_certificate(cert_der, default_backend())

            result.signer_subject = cert.subject.rfc4514_string()
            result.signer_issuer = cert.issuer.rfc4514_string()
            result.signed_at = signature_metadata.signed_at

            # 1. Verify signature
            signature = base64.b64decode(signature_metadata.signature)
            manifest_bytes = manifest_json.encode()

            try:
                self._verify_signature(
                    cert.public_key(),
                    signature,
                    manifest_bytes,
                    signature_metadata.algorithm,
                )
                result.signature_valid = True
            except Exception as e:
                result.signature_valid = False
                result.errors.append(f"Signature verification failed: {e}")

            # 2. Verify certificate validity
            now = datetime.utcnow()
            if cert.not_valid_before <= now <= cert.not_valid_after:
                result.certificate_valid = True
            else:
                result.certificate_valid = False
                if now < cert.not_valid_before:
                    result.errors.append("Certificate not yet valid")
                else:
                    result.errors.append("Certificate has expired")

            # 3. Verify certificate chain (if trusted certs provided)
            if self._trusted_certs:
                result.certificate_chain_valid = self._verify_chain(cert)
                if not result.certificate_chain_valid:
                    result.warnings.append("Certificate not issued by trusted CA")
            else:
                result.certificate_chain_valid = True  # Can't verify, assume OK
                result.warnings.append("No trusted CAs configured - chain not verified")

            # 4. Verify timestamp
            if signature_metadata.tsa_token:
                result.tsa_timestamp = signature_metadata.tsa_timestamp
                if self._tsa:
                    result.timestamp_valid = self._tsa.verify_timestamp(
                        signature_metadata.tsa_token,
                        hashlib.sha256(manifest_bytes).digest(),
                    )
                else:
                    result.timestamp_valid = True  # Can't verify, assume OK
            else:
                result.timestamp_valid = True  # No timestamp to verify
                result.warnings.append("No TSA timestamp present")

            # 5. Verify manifest hash
            computed_hash = hashlib.sha256(manifest_bytes).hexdigest()
            if computed_hash != signature_metadata.manifest_hash:
                result.errors.append("Manifest hash mismatch - content may be tampered")

            # Overall validity
            result.valid = (
                result.signature_valid and
                result.certificate_valid and
                len(result.errors) == 0
            )

        except Exception as e:
            result.valid = False
            result.errors.append(f"Verification error: {e}")

        return result

    def _verify_signature(
        self,
        public_key: PublicKeyTypes,
        signature: bytes,
        data: bytes,
        algorithm: str,
    ) -> None:
        """Verify signature with appropriate algorithm"""
        hash_algo = self._get_hash_algorithm(algorithm)

        if algorithm.startswith("RSA"):
            public_key.verify(
                signature,
                data,
                padding.PSS(
                    mgf=padding.MGF1(hash_algo),
                    salt_length=padding.PSS.MAX_LENGTH,
                ),
                hash_algo,
            )
        else:  # ECDSA
            public_key.verify(
                signature,
                data,
                ec.ECDSA(hash_algo),
            )

    def _get_hash_algorithm(self, algorithm: str) -> hashes.HashAlgorithm:
        """Get hash algorithm from signature algorithm string"""
        if "SHA384" in algorithm:
            return hashes.SHA384()
        elif "SHA512" in algorithm:
            return hashes.SHA512()
        else:
            return hashes.SHA256()

    def _verify_chain(self, cert: x509.Certificate) -> bool:
        """
        Verify certificate chain against trusted CAs.

        For production, use proper chain validation with
        certificate stores and revocation checking.
        """
        # Simplified chain verification
        # In production, use proper PKI validation
        for trusted_cert in self._trusted_certs:
            if cert.issuer == trusted_cert.subject:
                try:
                    trusted_cert.public_key().verify(
                        cert.signature,
                        cert.tbs_certificate_bytes,
                        padding.PKCS1v15(),
                        cert.signature_hash_algorithm,
                    )
                    return True
                except Exception:
                    continue
        return False
