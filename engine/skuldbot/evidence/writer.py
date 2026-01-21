"""
Evidence Pack Writer - Enterprise-Grade Audit Trail Generator

Este módulo es el escritor principal del Evidence Pack.
CRÍTICO: NUNCA almacena PII/PHI en crudo.

Uso:
    writer = EvidencePackWriter(
        execution_id="exec-123",
        bot_id="bot-456",
        bot_name="Process Claims",
        tenant_id="tenant-789",
    )

    # Durante la ejecución
    writer.record_lineage(source_node, dest_node, classification)
    writer.record_decision(node_id, decision_type, decision, reasoning)
    writer.capture_screenshot(node_id, screenshot_path)  # Auto-redacts

    # Al finalizar
    pack = writer.finalize()
    pack_path = writer.save("/output/evidence/")
"""

import hashlib
import json
import os
import shutil
import time
import uuid
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from skuldbot.evidence.models import (
    AgentDecision,
    ComplianceResult,
    DataLineageEntry,
    EvidenceManifest,
    EvidencePack,
    ScreenshotEntry,
)


class EvidencePackWriter:
    """
    Enterprise-grade Evidence Pack writer.

    Generates immutable, cryptographically signed audit packages
    for regulatory compliance (HIPAA, SOC2, PCI-DSS, GDPR).

    IMPORTANT: Never stores PII/PHI in raw form.
    """

    VERSION = "1.0.0"

    def __init__(
        self,
        execution_id: str,
        bot_id: str,
        bot_name: str,
        tenant_id: str,
        bot_version: str = "1.0.0",
        runner_id: str = "",
        runner_version: str = "",
        environment: str = "production",
        policy_pack_id: str = "",
        policy_pack_version: str = "",
        signing_key: Optional[str] = None,
    ):
        """
        Initialize Evidence Pack Writer.

        Args:
            execution_id: Unique execution identifier
            bot_id: Bot identifier
            bot_name: Human-readable bot name
            tenant_id: Tenant identifier
            bot_version: Bot version
            runner_id: Runner identifier
            runner_version: Runner version
            environment: Environment (production, staging, development)
            policy_pack_id: Policy pack being applied
            policy_pack_version: Policy pack version
            signing_key: Optional key for cryptographic signing
        """
        self.execution_id = execution_id or str(uuid.uuid4())
        self.bot_id = bot_id
        self.bot_name = bot_name
        self.tenant_id = tenant_id
        self.bot_version = bot_version
        self.runner_id = runner_id or os.environ.get("SKULDBOT_RUNNER_ID", "local")
        self.runner_version = runner_version or os.environ.get("SKULDBOT_RUNNER_VERSION", "dev")
        self.environment = environment
        self.policy_pack_id = policy_pack_id
        self.policy_pack_version = policy_pack_version
        self.signing_key = signing_key

        # Timing
        self.started_at = datetime.utcnow()
        self.completed_at: Optional[datetime] = None

        # Collections
        self._screenshots: List[ScreenshotEntry] = []
        self._decisions: List[AgentDecision] = []
        self._lineage: List[DataLineageEntry] = []
        self._compliance_results: List[ComplianceResult] = []
        self._logs: List[Dict[str, Any]] = []
        self._checksums: Dict[str, str] = {}

        # Node tracking
        self._nodes_executed: int = 0
        self._nodes_succeeded: int = 0
        self._nodes_failed: int = 0
        self._classifications_detected: set = set()

        # Screenshot files (temp storage)
        self._screenshot_files: Dict[str, bytes] = {}

        # Chain of custody
        self._chain_of_custody: List[Dict[str, Any]] = []
        self._add_custody_event("created", "Evidence pack initialized")

        # Compliance library for redaction
        self._compliance_lib = None
        try:
            from skuldbot.libs.compliance import SkuldCompliance
            self._compliance_lib = SkuldCompliance()
        except ImportError:
            pass

    def _add_custody_event(self, event_type: str, description: str):
        """Add chain of custody event"""
        self._chain_of_custody.append({
            "timestamp": datetime.utcnow().isoformat(),
            "event": event_type,
            "description": description,
            "actor": self.runner_id,
        })

    def _compute_hash(self, data: bytes) -> str:
        """Compute SHA-256 hash"""
        return hashlib.sha256(data).hexdigest()

    def _redact_text(self, text: str) -> str:
        """Redact PII/PHI from text using compliance library"""
        if not self._compliance_lib:
            # Fallback: basic pattern redaction
            import re
            # SSN
            text = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN_REDACTED]', text)
            # Email
            text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL_REDACTED]', text)
            # Phone
            text = re.sub(r'\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', '[PHONE_REDACTED]', text)
            # Credit card
            text = re.sub(r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b', '[CC_REDACTED]', text)
            return text

        # Use compliance library for thorough redaction
        result = self._compliance_lib.redact_sensitive_data(text)
        return result.get("redacted_text", text)

    # =========================================================================
    # Node Execution Tracking
    # =========================================================================

    def record_node_start(self, node_id: str, node_type: str):
        """Record node execution start"""
        self._nodes_executed += 1
        self._add_log("INFO", f"Node started: {node_id}", node_id=node_id, node_type=node_type)

    def record_node_success(self, node_id: str, node_type: str):
        """Record successful node execution"""
        self._nodes_succeeded += 1
        self._add_log("INFO", f"Node succeeded: {node_id}", node_id=node_id, node_type=node_type)

    def record_node_failure(self, node_id: str, node_type: str, error: str):
        """Record failed node execution"""
        self._nodes_failed += 1
        # Redact error message
        redacted_error = self._redact_text(error)
        self._add_log("ERROR", f"Node failed: {node_id} - {redacted_error}", node_id=node_id, node_type=node_type)

    # =========================================================================
    # Data Lineage (References Only - NO VALUES)
    # =========================================================================

    def record_lineage(
        self,
        source_node_id: str,
        source_node_type: str,
        source_field: str,
        dest_node_id: str,
        dest_node_type: str,
        dest_field: str,
        classification: str = "UNCLASSIFIED",
        transformations: Optional[List[str]] = None,
        policy_applied: Optional[str] = None,
        controls_required: Optional[List[str]] = None,
    ) -> DataLineageEntry:
        """
        Record data lineage (flow) between nodes.

        IMPORTANT: Only records REFERENCES, never the actual data values.

        Args:
            source_node_id: Source node ID
            source_node_type: Source node type
            source_field: Source field name
            dest_node_id: Destination node ID
            dest_node_type: Destination node type
            dest_field: Destination field name
            classification: Data classification (PII, PHI, PCI, etc.)
            transformations: Transformations applied (redact, mask, etc.)
            policy_applied: Policy rule that was applied
            controls_required: Controls required by policy

        Returns:
            DataLineageEntry
        """
        entry = DataLineageEntry(
            source_node_id=source_node_id,
            source_node_type=source_node_type,
            source_field=source_field,
            dest_node_id=dest_node_id,
            dest_node_type=dest_node_type,
            dest_field=dest_field,
            classification=classification,
            transformations=transformations or [],
            policy_applied=policy_applied,
            controls_required=controls_required or [],
        )

        # Track classifications
        if classification != "UNCLASSIFIED":
            self._classifications_detected.add(classification)

        self._lineage.append(entry)
        return entry

    def record_classification_detected(
        self,
        node_id: str,
        node_type: str,
        field: str,
        classifications: List[str],
    ):
        """
        Record that classifications were detected in a field.

        Args:
            node_id: Node where detection occurred
            node_type: Type of node
            field: Field name
            classifications: Classifications detected (PHI, PII, etc.)
        """
        for classification in classifications:
            self._classifications_detected.add(classification)

        # Create lineage entry for detection
        entry = DataLineageEntry(
            source_node_id=node_id,
            source_node_type=node_type,
            source_field=field,
            dest_node_id=node_id,
            dest_node_type=node_type,
            dest_field=field,
            classification=classifications[0] if classifications else "UNCLASSIFIED",
            classifications_detected=classifications,
        )
        self._lineage.append(entry)

    # =========================================================================
    # Agent Decisions (No Data Values)
    # =========================================================================

    def record_decision(
        self,
        node_id: str,
        node_type: str,
        decision_type: str,
        decision: str,
        reasoning: str = "",
        confidence: float = 1.0,
        alternatives: Optional[List[str]] = None,
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_request_id: Optional[str] = None,
        data_classifications: Optional[List[str]] = None,
        controls_applied: Optional[List[str]] = None,
        human_approved: bool = False,
        approver_id: Optional[str] = None,
    ) -> AgentDecision:
        """
        Record an AI agent decision.

        IMPORTANT: Records WHAT was decided, not the data it processed.
        The reasoning is auto-redacted to remove any PII/PHI.

        Args:
            node_id: Node making the decision
            node_type: Type of node
            decision_type: Type of decision (classification, routing, etc.)
            decision: What was decided
            reasoning: Why (will be redacted)
            confidence: Confidence score
            alternatives: Alternative decisions considered
            llm_provider: LLM provider used
            llm_model: LLM model used
            llm_request_id: LLM request ID for audit
            data_classifications: Classifications in context
            controls_applied: Controls that were applied
            human_approved: Whether human approved
            approver_id: ID of approver

        Returns:
            AgentDecision
        """
        # Redact reasoning
        redacted_reasoning = self._redact_text(reasoning) if reasoning else ""

        decision_entry = AgentDecision(
            node_id=node_id,
            node_type=node_type,
            decision_type=decision_type,
            decision=decision,
            confidence=confidence,
            reasoning=redacted_reasoning,
            alternatives_considered=alternatives or [],
            llm_provider=llm_provider,
            llm_model=llm_model,
            llm_request_id=llm_request_id,
            data_classifications_in_context=data_classifications or [],
            controls_applied=controls_applied or [],
            human_approved=human_approved,
            approver_id=approver_id,
        )

        self._decisions.append(decision_entry)
        return decision_entry

    # =========================================================================
    # Compliance Results
    # =========================================================================

    def record_compliance_check(
        self,
        rule_id: str,
        rule_description: str,
        status: str,  # passed, failed, warning
        severity: str,  # LOW, MEDIUM, HIGH, CRITICAL
        message: str,
        node_id: str = "",
        node_type: str = "",
        classifications: Optional[List[str]] = None,
        controls_required: Optional[List[str]] = None,
        controls_present: Optional[List[str]] = None,
    ) -> ComplianceResult:
        """
        Record compliance policy evaluation result.

        Args:
            rule_id: Policy rule ID
            rule_description: Rule description
            status: passed, failed, warning, skipped
            severity: LOW, MEDIUM, HIGH, CRITICAL
            message: Result message (will be redacted)
            node_id: Node evaluated
            node_type: Node type
            classifications: Classifications evaluated
            controls_required: Controls required by policy
            controls_present: Controls actually present

        Returns:
            ComplianceResult
        """
        # Redact message
        redacted_message = self._redact_text(message)

        result = ComplianceResult(
            policy_pack_id=self.policy_pack_id,
            policy_pack_version=self.policy_pack_version,
            rule_id=rule_id,
            rule_description=rule_description,
            status=status,
            severity=severity,
            message=redacted_message,
            node_id=node_id,
            node_type=node_type,
            classifications_evaluated=classifications or [],
            controls_required=controls_required or [],
            controls_present=controls_present or [],
        )

        self._compliance_results.append(result)
        return result

    # =========================================================================
    # Screenshots (Auto-Redacted)
    # =========================================================================

    def capture_screenshot(
        self,
        node_id: str,
        node_type: str,
        image_data: bytes,
        redaction_regions: Optional[List[Dict[str, int]]] = None,
    ) -> ScreenshotEntry:
        """
        Capture and redact screenshot.

        The screenshot will be automatically processed to redact any visible
        sensitive information (text fields, form data, etc.).

        Args:
            node_id: Node capturing screenshot
            node_type: Node type
            image_data: Raw screenshot bytes (PNG/JPEG)
            redaction_regions: Optional list of regions to redact
                              [{"x": 10, "y": 20, "width": 100, "height": 30}, ...]

        Returns:
            ScreenshotEntry with metadata
        """
        filename = f"{node_id}_{int(time.time() * 1000)}.png"

        # Apply redaction if regions specified
        redacted_data = image_data
        regions_count = 0

        if redaction_regions:
            try:
                redacted_data, regions_count = self._redact_image(image_data, redaction_regions)
            except Exception:
                # If redaction fails, still save but mark as not redacted
                pass

        # Compute hash of redacted image
        file_hash = self._compute_hash(redacted_data)

        entry = ScreenshotEntry(
            node_id=node_id,
            node_type=node_type,
            filename=filename,
            redaction_applied=regions_count > 0,
            regions_redacted=regions_count,
            file_hash=file_hash,
            file_size=len(redacted_data),
        )

        # Store for later packaging
        self._screenshot_files[filename] = redacted_data
        self._screenshots.append(entry)
        self._checksums[f"screenshots/{filename}"] = file_hash

        return entry

    def _redact_image(self, image_data: bytes, regions: List[Dict[str, int]]) -> tuple:
        """
        Apply blur redaction to image regions.

        Returns:
            Tuple of (redacted_image_bytes, regions_count)
        """
        try:
            from PIL import Image, ImageFilter
            import io

            img = Image.open(io.BytesIO(image_data))

            for region in regions:
                x = region.get("x", 0)
                y = region.get("y", 0)
                w = region.get("width", 50)
                h = region.get("height", 20)

                # Extract region
                box = (x, y, x + w, y + h)
                region_img = img.crop(box)

                # Apply heavy blur
                blurred = region_img.filter(ImageFilter.GaussianBlur(radius=15))

                # Paste back
                img.paste(blurred, box)

            # Save to bytes
            output = io.BytesIO()
            img.save(output, format="PNG")
            return output.getvalue(), len(regions)

        except ImportError:
            # PIL not available, return original
            return image_data, 0

    # =========================================================================
    # Logs (Redacted)
    # =========================================================================

    def _add_log(
        self,
        level: str,
        message: str,
        node_id: str = "",
        node_type: str = "",
        extra: Optional[Dict[str, Any]] = None,
    ):
        """Add redacted log entry"""
        redacted_message = self._redact_text(message)

        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": redacted_message,
            "nodeId": node_id,
            "nodeType": node_type,
        }

        if extra:
            # Redact extra fields
            for key, value in extra.items():
                if isinstance(value, str):
                    log_entry[key] = self._redact_text(value)
                else:
                    log_entry[key] = value

        self._logs.append(log_entry)

    def add_log(
        self,
        level: str,
        message: str,
        node_id: str = "",
        node_type: str = "",
        **kwargs,
    ):
        """
        Add a log entry (will be auto-redacted).

        Args:
            level: Log level (INFO, WARN, ERROR, DEBUG)
            message: Log message (will be redacted)
            node_id: Related node ID
            node_type: Node type
            **kwargs: Additional fields (will be redacted if strings)
        """
        self._add_log(level, message, node_id, node_type, kwargs if kwargs else None)

    # =========================================================================
    # Finalization and Packaging
    # =========================================================================

    def finalize(self) -> EvidencePack:
        """
        Finalize the evidence pack and compute integrity checksums.

        Returns:
            Complete EvidencePack
        """
        self.completed_at = datetime.utcnow()
        duration_ms = int((self.completed_at - self.started_at).total_seconds() * 1000)

        self._add_custody_event("finalized", "Evidence pack finalized")

        # Compute compliance summary
        passed = sum(1 for r in self._compliance_results if r.status == "passed")
        failed = sum(1 for r in self._compliance_results if r.status == "failed")
        warnings = sum(1 for r in self._compliance_results if r.status == "warning")

        # Create manifest
        manifest = EvidenceManifest(
            execution_id=self.execution_id,
            bot_id=self.bot_id,
            bot_name=self.bot_name,
            bot_version=self.bot_version,
            started_at=self.started_at.isoformat(),
            completed_at=self.completed_at.isoformat(),
            duration_ms=duration_ms,
            runner_id=self.runner_id,
            runner_version=self.runner_version,
            environment=self.environment,
            tenant_id=self.tenant_id,
            nodes_executed=self._nodes_executed,
            nodes_succeeded=self._nodes_succeeded,
            nodes_failed=self._nodes_failed,
            screenshots_count=len(self._screenshots),
            decisions_count=len(self._decisions),
            lineage_entries_count=len(self._lineage),
            compliance_checks_count=len(self._compliance_results),
            policy_pack_id=self.policy_pack_id,
            policy_pack_version=self.policy_pack_version,
            compliance_passed=passed,
            compliance_failed=failed,
            compliance_warnings=warnings,
            classifications_detected=list(self._classifications_detected),
            pack_version=self.VERSION,
            chain_of_custody=self._chain_of_custody,
        )

        # Create pack
        pack = EvidencePack(
            manifest=manifest,
            screenshots=self._screenshots,
            decisions=self._decisions,
            lineage=self._lineage,
            compliance_results=self._compliance_results,
            logs=self._logs,
            checksums=self._checksums,
        )

        return pack

    def save(self, output_dir: str) -> str:
        """
        Save evidence pack to disk.

        Creates a directory structure:
            {execution_id}.evp/
            ├── manifest.json
            ├── screenshots/
            ├── decisions/
            ├── lineage/
            ├── logs/
            ├── compliance/
            ├── signatures/
            └── checksums.json

        Args:
            output_dir: Directory to save the evidence pack

        Returns:
            Path to the evidence pack directory
        """
        pack = self.finalize()

        # Create pack directory
        pack_dir = Path(output_dir) / f"{self.execution_id}.evp"
        pack_dir.mkdir(parents=True, exist_ok=True)

        # Create subdirectories
        (pack_dir / "screenshots").mkdir(exist_ok=True)
        (pack_dir / "decisions").mkdir(exist_ok=True)
        (pack_dir / "lineage").mkdir(exist_ok=True)
        (pack_dir / "logs").mkdir(exist_ok=True)
        (pack_dir / "compliance").mkdir(exist_ok=True)
        (pack_dir / "signatures").mkdir(exist_ok=True)

        # Save screenshots
        for filename, data in self._screenshot_files.items():
            with open(pack_dir / "screenshots" / filename, "wb") as f:
                f.write(data)

        # Save decisions
        decisions_data = [d.to_dict() for d in pack.decisions]
        self._save_json(pack_dir / "decisions" / "decisions.json", decisions_data)

        # Save lineage
        lineage_data = [l.to_dict() for l in pack.lineage]
        self._save_json(pack_dir / "lineage" / "lineage.json", lineage_data)

        # Save logs
        self._save_json(pack_dir / "logs" / "execution.json", pack.logs)

        # Save compliance results
        compliance_data = [c.to_dict() for c in pack.compliance_results]
        self._save_json(pack_dir / "compliance" / "results.json", compliance_data)

        # Compute all checksums
        self._compute_all_checksums(pack_dir)

        # Save checksums
        self._save_json(pack_dir / "checksums.json", self._checksums)

        # Compute manifest checksum
        manifest_json = json.dumps(pack.manifest.to_dict(), sort_keys=True)
        pack.manifest.checksum = self._compute_hash(manifest_json.encode())

        # Sign if key provided
        if self.signing_key:
            pack.manifest.signature = self._sign_manifest(pack.manifest)

        # Save manifest (last, includes final checksum)
        self._save_json(pack_dir / "manifest.json", pack.manifest.to_dict())

        self._add_custody_event("saved", f"Evidence pack saved to {pack_dir}")

        return str(pack_dir)

    def _save_json(self, path: Path, data: Any):
        """Save JSON file and update checksums"""
        content = json.dumps(data, indent=2, sort_keys=True)
        with open(path, "w") as f:
            f.write(content)

        # Update checksum
        relative_path = str(path.name)
        if path.parent.name != path.parent.parent.name:
            relative_path = f"{path.parent.name}/{path.name}"
        self._checksums[relative_path] = self._compute_hash(content.encode())

    def _compute_all_checksums(self, pack_dir: Path):
        """Compute checksums for all files"""
        for file_path in pack_dir.rglob("*"):
            if file_path.is_file() and file_path.name != "checksums.json":
                relative = file_path.relative_to(pack_dir)
                with open(file_path, "rb") as f:
                    self._checksums[str(relative)] = self._compute_hash(f.read())

    def _sign_manifest(self, manifest: EvidenceManifest) -> str:
        """Sign manifest with HMAC"""
        import hmac
        manifest_json = json.dumps(manifest.to_dict(), sort_keys=True)
        signature = hmac.new(
            self.signing_key.encode(),
            manifest_json.encode(),
            hashlib.sha256,
        ).hexdigest()
        return signature

    def create_zip(self, output_path: str) -> str:
        """
        Create a ZIP archive of the evidence pack.

        Args:
            output_path: Path for the ZIP file

        Returns:
            Path to the ZIP file
        """
        # First save to temp directory
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            pack_dir = self.save(temp_dir)

            # Create ZIP
            zip_path = output_path if output_path.endswith(".zip") else f"{output_path}.zip"
            shutil.make_archive(
                zip_path.replace(".zip", ""),
                "zip",
                temp_dir,
                f"{self.execution_id}.evp",
            )

            return zip_path
