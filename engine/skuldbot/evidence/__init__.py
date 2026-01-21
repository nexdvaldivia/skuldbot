"""
SkuldBot Evidence Pack - Enterprise-Grade Audit Trail

Este módulo genera paquetes de evidencia inmutables y criptográficamente
verificables para cada ejecución de bot.

IMPORTANTE: El Evidence Pack NUNCA almacena PII/PHI en crudo.
- Screenshots: Auto-redactados con OCR detection
- Data Lineage: Solo referencias (node_id, field_name, classification)
- Logs: Redactados automáticamente
- Agent Decisions: Registra QUÉ decidió, no los datos procesados

Enterprise Features:
- AES-256-GCM encryption at rest (envelope encryption with KMS)
- RSA-4096 / ECDSA-P384 digital signatures with TSA timestamping
- Merkle Tree integrity verification and inclusion proofs
- Retention Policies with Legal Hold support
- SIEM Integration (Splunk, DataDog, CloudWatch, ELK)
- Cryptographically-linked Chain of Custody
- Multi-framework Compliance Attestation (HIPAA, SOC2, PCI-DSS, GDPR)
- OCR-based PII/PHI detection and automatic redaction

Estructura del .evp:
    execution_id.evp/
    ├── manifest.json           # Metadata y chain of custody (SIGNED)
    ├── screenshots/            # Screenshots redactados y encriptados
    ├── decisions/              # Decisiones de agentes AI
    ├── lineage/               # Data lineage (referencias)
    ├── logs/                  # Logs redactados
    ├── compliance/            # Resultados de policy checks
    ├── custody/               # Chain of custody events
    ├── attestations/          # Compliance attestation reports
    └── checksums.json         # Merkle tree y hashes
"""

from skuldbot.evidence.writer import EvidencePackWriter
from skuldbot.evidence.models import (
    EvidencePack,
    EvidenceManifest,
    DataLineageEntry,
    AgentDecision,
    ComplianceResult,
)

# Encryption
from skuldbot.evidence.encryption import (
    KeyManager,
    LocalKeyManager,
    AWSKMSKeyManager,
    AzureKeyVaultManager,
    EvidenceEncryptor,
    EvidenceDecryptor,
    EncryptedFileMetadata,
)

# Digital Signatures
from skuldbot.evidence.signature import (
    DigitalSigner,
    SignatureVerifier,
    TimestampAuthority,
    SignatureMetadata,
)

# Integrity / Merkle Trees
from skuldbot.evidence.integrity import (
    MerkleTree,
    MerkleProof,
    IntegrityVerifier,
    IntegrityMetadata,
    TamperCheckResult,
)

# Retention Policies
from skuldbot.evidence.retention import (
    RetentionPolicy,
    LegalHold,
    RetentionManager,
    LocalStorageBackend,
    S3StorageBackend,
)

# SIEM Integration
from skuldbot.evidence.siem import (
    SIEMEvent,
    SIEMForwarder,
    SplunkHECBackend,
    DataDogBackend,
    CloudWatchLogsBackend,
    ElasticsearchBackend,
)

# Chain of Custody
from skuldbot.evidence.custody import (
    CustodyEvent,
    CustodyAction,
    ChainOfCustody,
    ChainVerifier,
)

# Compliance Attestation
from skuldbot.evidence.attestation import (
    ComplianceFramework,
    ControlStatus,
    AttestationType,
    ControlEvaluation,
    AttestationReport,
    AttestationGenerator,
    ComplianceEvaluator,
)

# OCR Redaction
from skuldbot.evidence.ocr_redaction import (
    OCRRedactor,
    SensitiveDataType,
    RedactionStyle,
    TesseractEngine,
    AWSTextractEngine,
    SensitiveDataDetector,
    BatchRedactor,
    RedactionResult,
)

__all__ = [
    # Writer
    "EvidencePackWriter",
    # Models
    "EvidencePack",
    "EvidenceManifest",
    "DataLineageEntry",
    "AgentDecision",
    "ComplianceResult",
    # Encryption
    "KeyManager",
    "LocalKeyManager",
    "AWSKMSKeyManager",
    "AzureKeyVaultManager",
    "EvidenceEncryptor",
    "EvidenceDecryptor",
    "EncryptedFileMetadata",
    # Signatures
    "DigitalSigner",
    "SignatureVerifier",
    "TimestampAuthority",
    "SignatureMetadata",
    # Integrity
    "MerkleTree",
    "MerkleProof",
    "IntegrityVerifier",
    "IntegrityMetadata",
    "TamperCheckResult",
    # Retention
    "RetentionPolicy",
    "LegalHold",
    "RetentionManager",
    "LocalStorageBackend",
    "S3StorageBackend",
    # SIEM
    "SIEMEvent",
    "SIEMForwarder",
    "SplunkHECBackend",
    "DataDogBackend",
    "CloudWatchLogsBackend",
    "ElasticsearchBackend",
    # Custody
    "CustodyEvent",
    "CustodyAction",
    "ChainOfCustody",
    "ChainVerifier",
    # Attestation
    "ComplianceFramework",
    "ControlStatus",
    "AttestationType",
    "ControlEvaluation",
    "AttestationReport",
    "AttestationGenerator",
    "ComplianceEvaluator",
    # OCR Redaction
    "OCRRedactor",
    "SensitiveDataType",
    "RedactionStyle",
    "TesseractEngine",
    "AWSTextractEngine",
    "SensitiveDataDetector",
    "BatchRedactor",
    "RedactionResult",
]
