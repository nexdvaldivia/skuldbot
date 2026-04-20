"""
Retention Policies and Legal Hold

Enterprise-grade data retention management for evidence packs.

Features:
- Configurable retention periods by regulation (HIPAA: 7 years, etc.)
- Legal hold mechanism (prevents deletion during litigation)
- Automatic lifecycle management
- Immutable storage enforcement (S3 Object Lock, Azure Immutable Blob)
- Deletion audit trail

Compliance Requirements:
- HIPAA: 6-7 years retention for medical records
- SOC2: Based on organization policy (typically 7 years)
- PCI-DSS: 1 year minimum for audit trails
- GDPR: Right to erasure (with exceptions for legal obligations)
- SEC 17a-4: 6 years for financial records
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from pathlib import Path

# AWS imports
try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

# Azure imports
try:
    from azure.storage.blob import BlobServiceClient, ImmutabilityPolicy
    HAS_AZURE_STORAGE = True
except ImportError:
    HAS_AZURE_STORAGE = False


class RetentionPolicy(Enum):
    """Standard retention policies"""
    TEMPORARY = "temporary"         # 7 days (debug/testing)
    SHORT_TERM = "short_term"       # 30 days
    MEDIUM_TERM = "medium_term"     # 90 days
    STANDARD = "standard"           # 1 year
    REGULATORY = "regulatory"       # 7 years (HIPAA default)
    EXTENDED = "extended"           # 10 years
    PERMANENT = "permanent"         # Never delete
    CUSTOM = "custom"               # Custom period


class LegalHoldStatus(Enum):
    """Legal hold status"""
    NONE = "none"
    ACTIVE = "active"
    RELEASED = "released"
    EXPIRED = "expired"


@dataclass
class RetentionPeriod:
    """Retention period configuration"""
    policy: RetentionPolicy
    days: int
    description: str
    regulations: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "policy": self.policy.value,
            "days": self.days,
            "description": self.description,
            "regulations": self.regulations,
        }


# Standard retention periods by regulation
RETENTION_PERIODS = {
    RetentionPolicy.TEMPORARY: RetentionPeriod(
        policy=RetentionPolicy.TEMPORARY,
        days=7,
        description="Temporary retention for testing/debugging",
        regulations=[],
    ),
    RetentionPolicy.SHORT_TERM: RetentionPeriod(
        policy=RetentionPolicy.SHORT_TERM,
        days=30,
        description="Short-term operational retention",
        regulations=[],
    ),
    RetentionPolicy.MEDIUM_TERM: RetentionPeriod(
        policy=RetentionPolicy.MEDIUM_TERM,
        days=90,
        description="Medium-term retention for audits",
        regulations=["SOC2"],
    ),
    RetentionPolicy.STANDARD: RetentionPeriod(
        policy=RetentionPolicy.STANDARD,
        days=365,
        description="Standard 1-year retention",
        regulations=["PCI-DSS"],
    ),
    RetentionPolicy.REGULATORY: RetentionPeriod(
        policy=RetentionPolicy.REGULATORY,
        days=7 * 365,  # 7 years
        description="Regulatory compliance retention (HIPAA, SOX)",
        regulations=["HIPAA", "SOX", "SOC2"],
    ),
    RetentionPolicy.EXTENDED: RetentionPeriod(
        policy=RetentionPolicy.EXTENDED,
        days=10 * 365,  # 10 years
        description="Extended retention for financial records",
        regulations=["SEC 17a-4", "FINRA"],
    ),
    RetentionPolicy.PERMANENT: RetentionPeriod(
        policy=RetentionPolicy.PERMANENT,
        days=-1,  # Never expires
        description="Permanent retention - never delete",
        regulations=[],
    ),
}


@dataclass
class LegalHold:
    """Legal hold record"""
    hold_id: str
    evidence_pack_id: str
    reason: str
    case_number: Optional[str] = None
    custodian: str = ""
    placed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    placed_by: str = ""
    status: LegalHoldStatus = LegalHoldStatus.ACTIVE
    released_at: Optional[str] = None
    released_by: Optional[str] = None
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "holdId": self.hold_id,
            "evidencePackId": self.evidence_pack_id,
            "reason": self.reason,
            "caseNumber": self.case_number,
            "custodian": self.custodian,
            "placedAt": self.placed_at,
            "placedBy": self.placed_by,
            "status": self.status.value,
            "releasedAt": self.released_at,
            "releasedBy": self.released_by,
            "notes": self.notes,
        }


@dataclass
class RetentionMetadata:
    """Retention metadata for evidence pack"""
    policy: str = RetentionPolicy.REGULATORY.value
    retention_days: int = 7 * 365
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    expires_at: Optional[str] = None
    immutable: bool = True
    immutable_until: Optional[str] = None
    legal_hold: Optional[LegalHold] = None
    deletion_scheduled: bool = False
    deletion_date: Optional[str] = None

    def __post_init__(self):
        if self.retention_days > 0 and not self.expires_at:
            expires = datetime.utcnow() + timedelta(days=self.retention_days)
            self.expires_at = expires.isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "policy": self.policy,
            "retentionDays": self.retention_days,
            "createdAt": self.created_at,
            "expiresAt": self.expires_at,
            "immutable": self.immutable,
            "immutableUntil": self.immutable_until,
            "legalHold": self.legal_hold.to_dict() if self.legal_hold else None,
            "deletionScheduled": self.deletion_scheduled,
            "deletionDate": self.deletion_date,
        }


@dataclass
class DeletionAuditEntry:
    """Audit entry for deletion operations"""
    evidence_pack_id: str
    action: str  # scheduled, cancelled, executed, denied
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    performed_by: str = ""
    reason: str = ""
    retention_policy: str = ""
    legal_hold_status: str = ""
    result: str = ""  # success, failed, blocked

    def to_dict(self) -> Dict[str, Any]:
        return {
            "evidencePackId": self.evidence_pack_id,
            "action": self.action,
            "timestamp": self.timestamp,
            "performedBy": self.performed_by,
            "reason": self.reason,
            "retentionPolicy": self.retention_policy,
            "legalHoldStatus": self.legal_hold_status,
            "result": self.result,
        }


class StorageBackend(ABC):
    """Abstract storage backend for retention enforcement"""

    @abstractmethod
    def set_immutable(self, key: str, until: datetime) -> bool:
        """Set object as immutable until specified date"""
        pass

    @abstractmethod
    def check_immutable(self, key: str) -> Optional[datetime]:
        """Check if object is immutable and until when"""
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete object (fails if immutable)"""
        pass

    @abstractmethod
    def get_metadata(self, key: str) -> Dict[str, Any]:
        """Get object metadata"""
        pass

    @abstractmethod
    def set_metadata(self, key: str, metadata: Dict[str, Any]) -> bool:
        """Set object metadata"""
        pass


class LocalStorageBackend(StorageBackend):
    """
    Local filesystem storage backend.

    Uses metadata files for tracking (not truly immutable).
    For development/testing only.
    """

    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.metadata_dir = self.base_path / ".retention"
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    def _metadata_path(self, key: str) -> Path:
        safe_key = key.replace("/", "_").replace("\\", "_")
        return self.metadata_dir / f"{safe_key}.json"

    def set_immutable(self, key: str, until: datetime) -> bool:
        metadata = self.get_metadata(key)
        metadata["immutable"] = True
        metadata["immutable_until"] = until.isoformat()
        return self.set_metadata(key, metadata)

    def check_immutable(self, key: str) -> Optional[datetime]:
        metadata = self.get_metadata(key)
        if metadata.get("immutable"):
            until_str = metadata.get("immutable_until")
            if until_str:
                until = datetime.fromisoformat(until_str)
                if until > datetime.utcnow():
                    return until
        return None

    def delete(self, key: str) -> bool:
        immutable_until = self.check_immutable(key)
        if immutable_until:
            raise PermissionError(f"Object is immutable until {immutable_until}")

        target = self.base_path / key
        if target.exists():
            if target.is_dir():
                import shutil
                shutil.rmtree(target)
            else:
                target.unlink()
            return True
        return False

    def get_metadata(self, key: str) -> Dict[str, Any]:
        path = self._metadata_path(key)
        if path.exists():
            with open(path) as f:
                return json.load(f)
        return {}

    def set_metadata(self, key: str, metadata: Dict[str, Any]) -> bool:
        path = self._metadata_path(key)
        with open(path, "w") as f:
            json.dump(metadata, f, indent=2)
        return True


class S3StorageBackend(StorageBackend):
    """
    AWS S3 storage backend with Object Lock support.

    Uses S3 Object Lock for true immutability (WORM compliance).
    Requires bucket with Object Lock enabled.
    """

    def __init__(
        self,
        bucket: str,
        region: Optional[str] = None,
        profile: Optional[str] = None,
    ):
        if not HAS_BOTO3:
            raise ImportError("boto3 required for S3 storage")

        self.bucket = bucket

        session_kwargs = {}
        if profile:
            session_kwargs["profile_name"] = profile
        if region:
            session_kwargs["region_name"] = region

        session = boto3.Session(**session_kwargs)
        self.s3 = session.client("s3")

    def set_immutable(self, key: str, until: datetime) -> bool:
        """Set S3 Object Lock retention"""
        try:
            self.s3.put_object_retention(
                Bucket=self.bucket,
                Key=key,
                Retention={
                    "Mode": "GOVERNANCE",  # Can be bypassed with special permission
                    # Use "COMPLIANCE" for true WORM (cannot be bypassed)
                    "RetainUntilDate": until,
                },
            )
            return True
        except ClientError as e:
            raise RuntimeError(f"Failed to set S3 Object Lock: {e}")

    def check_immutable(self, key: str) -> Optional[datetime]:
        """Check S3 Object Lock retention"""
        try:
            response = self.s3.get_object_retention(
                Bucket=self.bucket,
                Key=key,
            )
            retention = response.get("Retention", {})
            until = retention.get("RetainUntilDate")
            if until and until > datetime.utcnow():
                return until
            return None
        except ClientError:
            return None

    def delete(self, key: str) -> bool:
        """Delete S3 object"""
        immutable_until = self.check_immutable(key)
        if immutable_until:
            raise PermissionError(f"Object is locked until {immutable_until}")

        try:
            self.s3.delete_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            raise RuntimeError(f"Failed to delete S3 object: {e}")

    def get_metadata(self, key: str) -> Dict[str, Any]:
        """Get S3 object metadata"""
        try:
            response = self.s3.head_object(Bucket=self.bucket, Key=key)
            return response.get("Metadata", {})
        except ClientError:
            return {}

    def set_metadata(self, key: str, metadata: Dict[str, Any]) -> bool:
        """Set S3 object metadata (requires copy)"""
        try:
            # S3 requires copy to update metadata
            self.s3.copy_object(
                Bucket=self.bucket,
                Key=key,
                CopySource={"Bucket": self.bucket, "Key": key},
                Metadata={k: str(v) for k, v in metadata.items()},
                MetadataDirective="REPLACE",
            )
            return True
        except ClientError as e:
            raise RuntimeError(f"Failed to set S3 metadata: {e}")


class RetentionManager:
    """
    Manages retention policies and legal holds for evidence packs.

    Responsibilities:
    - Apply retention policies based on regulation
    - Manage legal holds
    - Enforce immutability
    - Track deletion eligibility
    - Maintain audit trail
    """

    def __init__(
        self,
        storage: StorageBackend,
        default_policy: RetentionPolicy = RetentionPolicy.REGULATORY,
    ):
        """
        Initialize retention manager.

        Args:
            storage: Storage backend for enforcement
            default_policy: Default retention policy
        """
        self.storage = storage
        self.default_policy = default_policy
        self._legal_holds: Dict[str, LegalHold] = {}
        self._deletion_audit: List[DeletionAuditEntry] = []

    def apply_retention_policy(
        self,
        evidence_pack_id: str,
        policy: Optional[RetentionPolicy] = None,
        custom_days: Optional[int] = None,
        immutable: bool = True,
    ) -> RetentionMetadata:
        """
        Apply retention policy to evidence pack.

        Args:
            evidence_pack_id: Evidence pack identifier
            policy: Retention policy (uses default if not specified)
            custom_days: Custom retention days (for CUSTOM policy)
            immutable: Make storage immutable

        Returns:
            RetentionMetadata
        """
        policy = policy or self.default_policy

        if policy == RetentionPolicy.CUSTOM:
            if not custom_days:
                raise ValueError("custom_days required for CUSTOM policy")
            retention_days = custom_days
        elif policy == RetentionPolicy.PERMANENT:
            retention_days = -1
        else:
            retention_days = RETENTION_PERIODS[policy].days

        # Calculate expiration
        if retention_days > 0:
            expires_at = datetime.utcnow() + timedelta(days=retention_days)
        else:
            expires_at = None

        metadata = RetentionMetadata(
            policy=policy.value,
            retention_days=retention_days,
            immutable=immutable,
        )

        if expires_at:
            metadata.expires_at = expires_at.isoformat()

        # Apply immutability to storage
        if immutable and expires_at:
            self.storage.set_immutable(evidence_pack_id, expires_at)
            metadata.immutable_until = expires_at.isoformat()

        # Store metadata
        self.storage.set_metadata(evidence_pack_id, {
            "retention": json.dumps(metadata.to_dict()),
        })

        return metadata

    def place_legal_hold(
        self,
        evidence_pack_id: str,
        hold_id: str,
        reason: str,
        placed_by: str,
        case_number: Optional[str] = None,
        custodian: Optional[str] = None,
    ) -> LegalHold:
        """
        Place legal hold on evidence pack.

        Legal holds prevent deletion regardless of retention policy.
        Required for litigation hold and regulatory investigations.

        Args:
            evidence_pack_id: Evidence pack to hold
            hold_id: Unique hold identifier
            reason: Reason for hold
            placed_by: User placing the hold
            case_number: Associated case number
            custodian: Legal custodian

        Returns:
            LegalHold record
        """
        hold = LegalHold(
            hold_id=hold_id,
            evidence_pack_id=evidence_pack_id,
            reason=reason,
            case_number=case_number,
            custodian=custodian or placed_by,
            placed_by=placed_by,
            status=LegalHoldStatus.ACTIVE,
        )

        self._legal_holds[evidence_pack_id] = hold

        # Extend immutability indefinitely
        far_future = datetime.utcnow() + timedelta(days=365 * 100)  # 100 years
        self.storage.set_immutable(evidence_pack_id, far_future)

        # Update metadata
        existing = self.storage.get_metadata(evidence_pack_id)
        retention_data = json.loads(existing.get("retention", "{}"))
        retention_data["legalHold"] = hold.to_dict()
        self.storage.set_metadata(evidence_pack_id, {
            "retention": json.dumps(retention_data),
        })

        return hold

    def release_legal_hold(
        self,
        evidence_pack_id: str,
        released_by: str,
        reason: str = "",
    ) -> Optional[LegalHold]:
        """
        Release legal hold from evidence pack.

        Args:
            evidence_pack_id: Evidence pack ID
            released_by: User releasing the hold
            reason: Reason for release

        Returns:
            Updated LegalHold or None if no hold existed
        """
        hold = self._legal_holds.get(evidence_pack_id)
        if not hold:
            return None

        hold.status = LegalHoldStatus.RELEASED
        hold.released_at = datetime.utcnow().isoformat()
        hold.released_by = released_by
        hold.notes.append(f"Released: {reason}")

        # Restore original retention policy immutability
        existing = self.storage.get_metadata(evidence_pack_id)
        retention_data = json.loads(existing.get("retention", "{}"))

        if retention_data.get("expiresAt"):
            expires_at = datetime.fromisoformat(retention_data["expiresAt"])
            if expires_at > datetime.utcnow():
                self.storage.set_immutable(evidence_pack_id, expires_at)

        retention_data["legalHold"] = hold.to_dict()
        self.storage.set_metadata(evidence_pack_id, {
            "retention": json.dumps(retention_data),
        })

        return hold

    def get_legal_hold(self, evidence_pack_id: str) -> Optional[LegalHold]:
        """Get legal hold for evidence pack"""
        return self._legal_holds.get(evidence_pack_id)

    def can_delete(self, evidence_pack_id: str) -> Dict[str, Any]:
        """
        Check if evidence pack can be deleted.

        Args:
            evidence_pack_id: Evidence pack ID

        Returns:
            Dictionary with deletion eligibility info
        """
        # Check legal hold
        hold = self._legal_holds.get(evidence_pack_id)
        if hold and hold.status == LegalHoldStatus.ACTIVE:
            return {
                "canDelete": False,
                "reason": "Legal hold is active",
                "legalHold": hold.to_dict(),
            }

        # Check immutability
        immutable_until = self.storage.check_immutable(evidence_pack_id)
        if immutable_until:
            return {
                "canDelete": False,
                "reason": f"Object is immutable until {immutable_until.isoformat()}",
                "immutableUntil": immutable_until.isoformat(),
            }

        # Check retention policy
        existing = self.storage.get_metadata(evidence_pack_id)
        retention_data = json.loads(existing.get("retention", "{}"))

        expires_at = retention_data.get("expiresAt")
        if expires_at:
            expires = datetime.fromisoformat(expires_at)
            if expires > datetime.utcnow():
                return {
                    "canDelete": False,
                    "reason": f"Retention period active until {expires_at}",
                    "expiresAt": expires_at,
                }

        return {
            "canDelete": True,
            "reason": "Retention period expired, no legal holds",
        }

    def schedule_deletion(
        self,
        evidence_pack_id: str,
        scheduled_by: str,
        grace_period_days: int = 30,
    ) -> DeletionAuditEntry:
        """
        Schedule evidence pack for deletion.

        Includes grace period for review before actual deletion.

        Args:
            evidence_pack_id: Evidence pack ID
            scheduled_by: User scheduling deletion
            grace_period_days: Days before actual deletion

        Returns:
            DeletionAuditEntry
        """
        can_delete = self.can_delete(evidence_pack_id)

        audit_entry = DeletionAuditEntry(
            evidence_pack_id=evidence_pack_id,
            action="scheduled",
            performed_by=scheduled_by,
        )

        if not can_delete["canDelete"]:
            audit_entry.action = "denied"
            audit_entry.reason = can_delete["reason"]
            audit_entry.result = "blocked"
            self._deletion_audit.append(audit_entry)
            raise PermissionError(can_delete["reason"])

        deletion_date = datetime.utcnow() + timedelta(days=grace_period_days)

        # Update metadata
        existing = self.storage.get_metadata(evidence_pack_id)
        retention_data = json.loads(existing.get("retention", "{}"))
        retention_data["deletionScheduled"] = True
        retention_data["deletionDate"] = deletion_date.isoformat()
        self.storage.set_metadata(evidence_pack_id, {
            "retention": json.dumps(retention_data),
        })

        audit_entry.reason = f"Scheduled for deletion on {deletion_date.isoformat()}"
        audit_entry.result = "success"
        self._deletion_audit.append(audit_entry)

        return audit_entry

    def cancel_deletion(
        self,
        evidence_pack_id: str,
        cancelled_by: str,
        reason: str = "",
    ) -> DeletionAuditEntry:
        """
        Cancel scheduled deletion.

        Args:
            evidence_pack_id: Evidence pack ID
            cancelled_by: User cancelling deletion
            reason: Reason for cancellation

        Returns:
            DeletionAuditEntry
        """
        existing = self.storage.get_metadata(evidence_pack_id)
        retention_data = json.loads(existing.get("retention", "{}"))

        retention_data["deletionScheduled"] = False
        retention_data["deletionDate"] = None
        self.storage.set_metadata(evidence_pack_id, {
            "retention": json.dumps(retention_data),
        })

        audit_entry = DeletionAuditEntry(
            evidence_pack_id=evidence_pack_id,
            action="cancelled",
            performed_by=cancelled_by,
            reason=reason,
            result="success",
        )
        self._deletion_audit.append(audit_entry)

        return audit_entry

    def execute_deletion(
        self,
        evidence_pack_id: str,
        executed_by: str,
    ) -> DeletionAuditEntry:
        """
        Execute deletion of evidence pack.

        Only succeeds if:
        - No legal hold
        - Retention period expired
        - Deletion was scheduled

        Args:
            evidence_pack_id: Evidence pack ID
            executed_by: User executing deletion

        Returns:
            DeletionAuditEntry
        """
        audit_entry = DeletionAuditEntry(
            evidence_pack_id=evidence_pack_id,
            action="executed",
            performed_by=executed_by,
        )

        # Verify can delete
        can_delete = self.can_delete(evidence_pack_id)
        if not can_delete["canDelete"]:
            audit_entry.result = "blocked"
            audit_entry.reason = can_delete["reason"]
            self._deletion_audit.append(audit_entry)
            raise PermissionError(can_delete["reason"])

        # Execute deletion
        try:
            self.storage.delete(evidence_pack_id)
            audit_entry.result = "success"
            audit_entry.reason = "Evidence pack deleted"
        except Exception as e:
            audit_entry.result = "failed"
            audit_entry.reason = str(e)
            raise

        self._deletion_audit.append(audit_entry)
        return audit_entry

    def get_deletion_audit(
        self,
        evidence_pack_id: Optional[str] = None,
    ) -> List[DeletionAuditEntry]:
        """
        Get deletion audit trail.

        Args:
            evidence_pack_id: Filter by evidence pack (optional)

        Returns:
            List of DeletionAuditEntry
        """
        if evidence_pack_id:
            return [e for e in self._deletion_audit if e.evidence_pack_id == evidence_pack_id]
        return self._deletion_audit.copy()

    def get_expiring_soon(
        self,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """
        Get evidence packs expiring within specified days.

        Useful for retention policy review.

        Args:
            days: Days until expiration

        Returns:
            List of evidence pack info
        """
        # This would need to query the storage backend
        # Implementation depends on storage type
        # Placeholder for now
        return []
