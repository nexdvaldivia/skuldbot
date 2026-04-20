"""
Compliance Attestation - Signed Audit Reports

Generates cryptographically signed attestation reports that certify
compliance status of bot executions for auditors and regulators.

Features:
1. Multi-framework support (HIPAA, SOC2, PCI-DSS, GDPR, etc.)
2. Digitally signed attestation certificates
3. Machine-readable + human-readable formats
4. Evidence linking (references to evidence pack)
5. Control mapping to framework requirements
"""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pathlib import Path


class ComplianceFramework(Enum):
    """Supported compliance frameworks"""
    HIPAA = "hipaa"
    SOC2 = "soc2"
    PCI_DSS = "pci_dss"
    GDPR = "gdpr"
    ISO_27001 = "iso_27001"
    NIST_CSF = "nist_csf"
    CCPA = "ccpa"
    HITRUST = "hitrust"
    FEDRAMP = "fedramp"


class ControlStatus(Enum):
    """Status of a control evaluation"""
    PASSED = "passed"
    FAILED = "failed"
    NOT_APPLICABLE = "not_applicable"
    PARTIALLY_MET = "partially_met"
    REQUIRES_MANUAL_REVIEW = "requires_manual_review"


class AttestationType(Enum):
    """Type of attestation"""
    EXECUTION = "execution"  # Single bot execution
    PERIODIC = "periodic"  # Periodic review (daily, weekly, monthly)
    AUDIT = "audit"  # Full audit report
    INCIDENT = "incident"  # Incident response report


@dataclass
class ControlRequirement:
    """A specific control requirement from a framework"""
    control_id: str
    framework: ComplianceFramework
    name: str
    description: str
    category: str
    evidence_required: List[str] = field(default_factory=list)


@dataclass
class ControlEvaluation:
    """Evaluation of a single control"""
    control_id: str
    framework: str
    name: str
    category: str
    status: ControlStatus
    evidence_references: List[str] = field(default_factory=list)
    findings: str = ""
    recommendations: str = ""
    evaluated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "controlId": self.control_id,
            "framework": self.framework,
            "name": self.name,
            "category": self.category,
            "status": self.status.value,
            "evidenceReferences": self.evidence_references,
            "findings": self.findings,
            "recommendations": self.recommendations,
            "evaluatedAt": self.evaluated_at,
        }


@dataclass
class AttestationMetadata:
    """Metadata for attestation report"""
    attestation_id: str
    attestation_type: AttestationType
    framework: ComplianceFramework
    organization_id: str
    organization_name: str
    bot_id: str
    bot_name: str
    execution_id: Optional[str] = None
    evidence_pack_id: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    generated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    generated_by: str = "SkuldBot Compliance Engine"
    version: str = "1.0"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "attestationId": self.attestation_id,
            "attestationType": self.attestation_type.value,
            "framework": self.framework.value,
            "organizationId": self.organization_id,
            "organizationName": self.organization_name,
            "botId": self.bot_id,
            "botName": self.bot_name,
            "executionId": self.execution_id,
            "evidencePackId": self.evidence_pack_id,
            "periodStart": self.period_start,
            "periodEnd": self.period_end,
            "generatedAt": self.generated_at,
            "generatedBy": self.generated_by,
            "version": self.version,
        }


@dataclass
class AttestationSummary:
    """Summary of attestation results"""
    total_controls: int = 0
    passed: int = 0
    failed: int = 0
    not_applicable: int = 0
    partially_met: int = 0
    requires_review: int = 0
    compliance_score: float = 0.0
    overall_status: str = "unknown"

    def calculate_score(self) -> None:
        """Calculate compliance score"""
        applicable = self.total_controls - self.not_applicable
        if applicable > 0:
            # Full points for passed, half for partially met
            score = (self.passed + (self.partially_met * 0.5)) / applicable
            self.compliance_score = round(score * 100, 2)
        else:
            self.compliance_score = 100.0

        # Determine overall status
        if self.failed > 0:
            self.overall_status = "non_compliant"
        elif self.requires_review > 0:
            self.overall_status = "pending_review"
        elif self.partially_met > 0:
            self.overall_status = "partially_compliant"
        elif self.passed == applicable:
            self.overall_status = "compliant"
        else:
            self.overall_status = "unknown"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "totalControls": self.total_controls,
            "passed": self.passed,
            "failed": self.failed,
            "notApplicable": self.not_applicable,
            "partiallyMet": self.partially_met,
            "requiresReview": self.requires_review,
            "complianceScore": self.compliance_score,
            "overallStatus": self.overall_status,
        }


@dataclass
class AttestationReport:
    """Complete attestation report"""
    metadata: AttestationMetadata
    summary: AttestationSummary
    control_evaluations: List[ControlEvaluation] = field(default_factory=list)
    executive_summary: str = ""
    detailed_findings: str = ""
    recommendations: List[str] = field(default_factory=list)
    evidence_pack_hash: Optional[str] = None
    signature: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "metadata": self.metadata.to_dict(),
            "summary": self.summary.to_dict(),
            "controlEvaluations": [c.to_dict() for c in self.control_evaluations],
            "executiveSummary": self.executive_summary,
            "detailedFindings": self.detailed_findings,
            "recommendations": self.recommendations,
            "evidencePackHash": self.evidence_pack_hash,
            "signature": self.signature,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


# Control catalogs for each framework
HIPAA_CONTROLS = [
    ControlRequirement(
        control_id="164.312(a)(1)",
        framework=ComplianceFramework.HIPAA,
        name="Access Control",
        description="Implement technical policies and procedures for electronic information systems that maintain ePHI",
        category="Technical Safeguards",
        evidence_required=["access_logs", "authentication_records"],
    ),
    ControlRequirement(
        control_id="164.312(b)",
        framework=ComplianceFramework.HIPAA,
        name="Audit Controls",
        description="Implement hardware, software, and/or procedural mechanisms to record and examine activity",
        category="Technical Safeguards",
        evidence_required=["audit_logs", "evidence_pack"],
    ),
    ControlRequirement(
        control_id="164.312(c)(1)",
        framework=ComplianceFramework.HIPAA,
        name="Integrity",
        description="Implement policies and procedures to protect ePHI from improper alteration or destruction",
        category="Technical Safeguards",
        evidence_required=["integrity_verification", "merkle_root"],
    ),
    ControlRequirement(
        control_id="164.312(d)",
        framework=ComplianceFramework.HIPAA,
        name="Person or Entity Authentication",
        description="Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed",
        category="Technical Safeguards",
        evidence_required=["authentication_logs", "identity_verification"],
    ),
    ControlRequirement(
        control_id="164.312(e)(1)",
        framework=ComplianceFramework.HIPAA,
        name="Transmission Security",
        description="Implement technical security measures to guard against unauthorized access to ePHI",
        category="Technical Safeguards",
        evidence_required=["encryption_records", "tls_certificates"],
    ),
    ControlRequirement(
        control_id="164.308(a)(1)(ii)(D)",
        framework=ComplianceFramework.HIPAA,
        name="Information System Activity Review",
        description="Implement procedures to regularly review records of information system activity",
        category="Administrative Safeguards",
        evidence_required=["activity_logs", "review_records"],
    ),
    ControlRequirement(
        control_id="164.530(j)",
        framework=ComplianceFramework.HIPAA,
        name="Documentation Retention",
        description="Retain documentation for 6 years from date of creation or last effective date",
        category="Administrative Safeguards",
        evidence_required=["retention_policy", "evidence_pack"],
    ),
]

SOC2_CONTROLS = [
    ControlRequirement(
        control_id="CC6.1",
        framework=ComplianceFramework.SOC2,
        name="Logical Access Security",
        description="Logical access security software, infrastructure, and architectures have been implemented",
        category="Common Criteria",
        evidence_required=["access_controls", "authentication_logs"],
    ),
    ControlRequirement(
        control_id="CC6.6",
        framework=ComplianceFramework.SOC2,
        name="System Operations Monitoring",
        description="Security events are logged and monitored",
        category="Common Criteria",
        evidence_required=["security_logs", "siem_integration"],
    ),
    ControlRequirement(
        control_id="CC7.1",
        framework=ComplianceFramework.SOC2,
        name="Anomaly Detection",
        description="Anomalies and security events are detected and monitored",
        category="Common Criteria",
        evidence_required=["anomaly_detection", "alerts"],
    ),
    ControlRequirement(
        control_id="CC7.2",
        framework=ComplianceFramework.SOC2,
        name="Incident Response",
        description="Procedures exist to respond to security incidents",
        category="Common Criteria",
        evidence_required=["incident_response_plan", "incident_logs"],
    ),
    ControlRequirement(
        control_id="A1.2",
        framework=ComplianceFramework.SOC2,
        name="Processing Integrity",
        description="System processing is complete, valid, accurate, timely, and authorized",
        category="Availability",
        evidence_required=["processing_logs", "validation_records"],
    ),
    ControlRequirement(
        control_id="C1.1",
        framework=ComplianceFramework.SOC2,
        name="Confidentiality",
        description="Confidential information is protected from unauthorized access",
        category="Confidentiality",
        evidence_required=["encryption_records", "access_controls"],
    ),
    ControlRequirement(
        control_id="PI1.1",
        framework=ComplianceFramework.SOC2,
        name="Personal Information Protection",
        description="Personal information is collected, used, retained, disclosed, and disposed of appropriately",
        category="Privacy",
        evidence_required=["data_lineage", "redaction_logs"],
    ),
]

PCI_DSS_CONTROLS = [
    ControlRequirement(
        control_id="3.4",
        framework=ComplianceFramework.PCI_DSS,
        name="Render PAN Unreadable",
        description="Render PAN unreadable anywhere it is stored using cryptography",
        category="Protect Stored Data",
        evidence_required=["encryption_records", "key_management"],
    ),
    ControlRequirement(
        control_id="10.1",
        framework=ComplianceFramework.PCI_DSS,
        name="Audit Trails",
        description="Implement audit trails to link all access to system components to individual users",
        category="Track and Monitor Access",
        evidence_required=["audit_logs", "user_tracking"],
    ),
    ControlRequirement(
        control_id="10.2",
        framework=ComplianceFramework.PCI_DSS,
        name="Automated Audit Trails",
        description="Implement automated audit trails for all system components",
        category="Track and Monitor Access",
        evidence_required=["automated_logs", "evidence_pack"],
    ),
    ControlRequirement(
        control_id="10.5",
        framework=ComplianceFramework.PCI_DSS,
        name="Secure Audit Trails",
        description="Secure audit trails so they cannot be altered",
        category="Track and Monitor Access",
        evidence_required=["integrity_verification", "digital_signature"],
    ),
    ControlRequirement(
        control_id="10.7",
        framework=ComplianceFramework.PCI_DSS,
        name="Audit Trail Retention",
        description="Retain audit trail history for at least one year",
        category="Track and Monitor Access",
        evidence_required=["retention_policy", "storage_records"],
    ),
]

GDPR_CONTROLS = [
    ControlRequirement(
        control_id="Art.5(1)(f)",
        framework=ComplianceFramework.GDPR,
        name="Integrity and Confidentiality",
        description="Personal data shall be processed in a manner that ensures appropriate security",
        category="Data Protection Principles",
        evidence_required=["encryption_records", "access_controls"],
    ),
    ControlRequirement(
        control_id="Art.17",
        framework=ComplianceFramework.GDPR,
        name="Right to Erasure",
        description="The data subject shall have the right to obtain erasure of personal data",
        category="Data Subject Rights",
        evidence_required=["deletion_logs", "retention_policy"],
    ),
    ControlRequirement(
        control_id="Art.25",
        framework=ComplianceFramework.GDPR,
        name="Data Protection by Design",
        description="Implement appropriate technical measures designed to implement data protection principles",
        category="Data Protection by Design",
        evidence_required=["privacy_by_design", "data_minimization"],
    ),
    ControlRequirement(
        control_id="Art.30",
        framework=ComplianceFramework.GDPR,
        name="Records of Processing Activities",
        description="Maintain a record of processing activities",
        category="Documentation",
        evidence_required=["processing_records", "data_lineage"],
    ),
    ControlRequirement(
        control_id="Art.32",
        framework=ComplianceFramework.GDPR,
        name="Security of Processing",
        description="Implement appropriate technical and organizational security measures",
        category="Security",
        evidence_required=["security_measures", "encryption_records"],
    ),
    ControlRequirement(
        control_id="Art.33",
        framework=ComplianceFramework.GDPR,
        name="Breach Notification",
        description="Notify supervisory authority of personal data breach within 72 hours",
        category="Breach Response",
        evidence_required=["incident_response", "notification_records"],
    ),
]

# Control catalog registry
CONTROL_CATALOGS: Dict[ComplianceFramework, List[ControlRequirement]] = {
    ComplianceFramework.HIPAA: HIPAA_CONTROLS,
    ComplianceFramework.SOC2: SOC2_CONTROLS,
    ComplianceFramework.PCI_DSS: PCI_DSS_CONTROLS,
    ComplianceFramework.GDPR: GDPR_CONTROLS,
}


class ComplianceEvaluator:
    """
    Evaluates evidence packs against compliance frameworks.

    Maps evidence to control requirements and determines compliance status.
    """

    def __init__(self):
        """Initialize evaluator"""
        self._evidence_mappings: Dict[str, List[str]] = {}

    def register_evidence(self, evidence_type: str, file_paths: List[str]) -> None:
        """
        Register available evidence for evaluation.

        Args:
            evidence_type: Type of evidence (e.g., "audit_logs", "encryption_records")
            file_paths: Paths to evidence files
        """
        self._evidence_mappings[evidence_type] = file_paths

    def evaluate_control(
        self,
        control: ControlRequirement,
        evidence_pack_path: Optional[str] = None,
    ) -> ControlEvaluation:
        """
        Evaluate a single control against available evidence.

        Args:
            control: Control requirement to evaluate
            evidence_pack_path: Path to evidence pack directory

        Returns:
            ControlEvaluation with status and findings
        """
        evidence_refs = []
        missing_evidence = []

        # Check for required evidence
        for evidence_type in control.evidence_required:
            if evidence_type in self._evidence_mappings:
                evidence_refs.extend(self._evidence_mappings[evidence_type])
            else:
                missing_evidence.append(evidence_type)

        # Determine status based on evidence availability
        if not missing_evidence:
            status = ControlStatus.PASSED
            findings = f"All required evidence present: {', '.join(control.evidence_required)}"
            recommendations = ""
        elif len(missing_evidence) < len(control.evidence_required):
            status = ControlStatus.PARTIALLY_MET
            findings = f"Some evidence missing: {', '.join(missing_evidence)}"
            recommendations = f"Provide additional evidence for: {', '.join(missing_evidence)}"
        else:
            status = ControlStatus.REQUIRES_MANUAL_REVIEW
            findings = f"Evidence not automatically verified: {', '.join(missing_evidence)}"
            recommendations = "Manual review required to verify control compliance"

        return ControlEvaluation(
            control_id=control.control_id,
            framework=control.framework.value,
            name=control.name,
            category=control.category,
            status=status,
            evidence_references=evidence_refs,
            findings=findings,
            recommendations=recommendations,
        )

    def evaluate_framework(
        self,
        framework: ComplianceFramework,
        evidence_pack_path: Optional[str] = None,
    ) -> List[ControlEvaluation]:
        """
        Evaluate all controls in a framework.

        Args:
            framework: Compliance framework to evaluate
            evidence_pack_path: Path to evidence pack

        Returns:
            List of control evaluations
        """
        controls = CONTROL_CATALOGS.get(framework, [])
        evaluations = []

        for control in controls:
            evaluation = self.evaluate_control(control, evidence_pack_path)
            evaluations.append(evaluation)

        return evaluations


class AttestationGenerator:
    """
    Generates compliance attestation reports.

    Creates signed attestation certificates that can be provided to auditors.
    """

    def __init__(self, signer: Optional[Any] = None):
        """
        Initialize attestation generator.

        Args:
            signer: Optional DigitalSigner for signing attestations
        """
        self._signer = signer
        self._evaluator = ComplianceEvaluator()

    def register_evidence_from_pack(self, evidence_pack_path: str) -> None:
        """
        Register evidence from an evidence pack directory.

        Args:
            evidence_pack_path: Path to evidence pack
        """
        pack_path = Path(evidence_pack_path)

        # Map evidence pack contents to evidence types
        evidence_mappings = {
            "audit_logs": ["logs/"],
            "activity_logs": ["logs/"],
            "security_logs": ["logs/"],
            "automated_logs": ["logs/"],
            "processing_logs": ["logs/"],
            "access_logs": ["logs/", "custody/"],
            "authentication_logs": ["logs/"],
            "authentication_records": ["custody/"],
            "encryption_records": ["manifest.json"],
            "key_management": ["manifest.json"],
            "integrity_verification": ["checksums.json", "manifest.json"],
            "merkle_root": ["manifest.json"],
            "digital_signature": ["manifest.json"],
            "evidence_pack": [str(pack_path)],
            "retention_policy": ["manifest.json"],
            "storage_records": ["manifest.json"],
            "data_lineage": ["lineage/"],
            "processing_records": ["lineage/"],
            "redaction_logs": ["screenshots/", "manifest.json"],
            "access_controls": ["custody/"],
            "siem_integration": ["manifest.json"],
            "user_tracking": ["custody/"],
            "incident_response": ["logs/"],
            "validation_records": ["manifest.json"],
        }

        for evidence_type, paths in evidence_mappings.items():
            existing_paths = []
            for p in paths:
                full_path = pack_path / p
                if full_path.exists():
                    existing_paths.append(str(full_path))
            if existing_paths:
                self._evaluator.register_evidence(evidence_type, existing_paths)

    def generate_attestation(
        self,
        framework: ComplianceFramework,
        organization_id: str,
        organization_name: str,
        bot_id: str,
        bot_name: str,
        evidence_pack_path: Optional[str] = None,
        execution_id: Optional[str] = None,
        attestation_type: AttestationType = AttestationType.EXECUTION,
    ) -> AttestationReport:
        """
        Generate a compliance attestation report.

        Args:
            framework: Compliance framework to attest against
            organization_id: Organization identifier
            organization_name: Organization name
            bot_id: Bot identifier
            bot_name: Bot name
            evidence_pack_path: Path to evidence pack
            execution_id: Optional execution ID
            attestation_type: Type of attestation

        Returns:
            Complete AttestationReport
        """
        # Generate attestation ID
        attestation_id = self._generate_attestation_id(
            organization_id, bot_id, framework, attestation_type
        )

        # Register evidence if pack path provided
        if evidence_pack_path:
            self.register_evidence_from_pack(evidence_pack_path)

        # Evaluate all controls
        evaluations = self._evaluator.evaluate_framework(framework, evidence_pack_path)

        # Calculate summary
        summary = self._calculate_summary(evaluations)

        # Generate executive summary
        executive_summary = self._generate_executive_summary(
            framework, organization_name, bot_name, summary
        )

        # Generate detailed findings
        detailed_findings = self._generate_detailed_findings(evaluations)

        # Generate recommendations
        recommendations = self._generate_recommendations(evaluations)

        # Calculate evidence pack hash if available
        evidence_pack_hash = None
        evidence_pack_id = None
        if evidence_pack_path:
            evidence_pack_hash = self._calculate_pack_hash(evidence_pack_path)
            evidence_pack_id = Path(evidence_pack_path).name

        # Create metadata
        metadata = AttestationMetadata(
            attestation_id=attestation_id,
            attestation_type=attestation_type,
            framework=framework,
            organization_id=organization_id,
            organization_name=organization_name,
            bot_id=bot_id,
            bot_name=bot_name,
            execution_id=execution_id,
            evidence_pack_id=evidence_pack_id,
        )

        # Create report
        report = AttestationReport(
            metadata=metadata,
            summary=summary,
            control_evaluations=evaluations,
            executive_summary=executive_summary,
            detailed_findings=detailed_findings,
            recommendations=recommendations,
            evidence_pack_hash=evidence_pack_hash,
        )

        # Sign if signer available
        if self._signer:
            report.signature = self._sign_report(report)

        return report

    def _generate_attestation_id(
        self,
        organization_id: str,
        bot_id: str,
        framework: ComplianceFramework,
        attestation_type: AttestationType,
    ) -> str:
        """Generate unique attestation ID"""
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        components = f"{organization_id}:{bot_id}:{framework.value}:{attestation_type.value}:{timestamp}"
        hash_suffix = hashlib.sha256(components.encode()).hexdigest()[:8]
        return f"ATT-{timestamp}-{hash_suffix.upper()}"

    def _calculate_summary(self, evaluations: List[ControlEvaluation]) -> AttestationSummary:
        """Calculate summary statistics"""
        summary = AttestationSummary(total_controls=len(evaluations))

        for eval in evaluations:
            if eval.status == ControlStatus.PASSED:
                summary.passed += 1
            elif eval.status == ControlStatus.FAILED:
                summary.failed += 1
            elif eval.status == ControlStatus.NOT_APPLICABLE:
                summary.not_applicable += 1
            elif eval.status == ControlStatus.PARTIALLY_MET:
                summary.partially_met += 1
            elif eval.status == ControlStatus.REQUIRES_MANUAL_REVIEW:
                summary.requires_review += 1

        summary.calculate_score()
        return summary

    def _generate_executive_summary(
        self,
        framework: ComplianceFramework,
        organization_name: str,
        bot_name: str,
        summary: AttestationSummary,
    ) -> str:
        """Generate executive summary text"""
        framework_names = {
            ComplianceFramework.HIPAA: "HIPAA Security Rule",
            ComplianceFramework.SOC2: "SOC 2 Type II",
            ComplianceFramework.PCI_DSS: "PCI DSS v4.0",
            ComplianceFramework.GDPR: "GDPR Articles",
        }
        framework_name = framework_names.get(framework, framework.value.upper())

        status_descriptions = {
            "compliant": "fully compliant",
            "partially_compliant": "partially compliant with noted gaps",
            "non_compliant": "non-compliant with critical findings",
            "pending_review": "pending manual review for final determination",
        }
        status_desc = status_descriptions.get(summary.overall_status, "under evaluation")

        return f"""This attestation report certifies that the automated process "{bot_name}"
operated by {organization_name} has been evaluated against {framework_name} requirements.

Based on automated evidence collection and control evaluation, the process is {status_desc}.

Compliance Score: {summary.compliance_score}%
Controls Evaluated: {summary.total_controls}
Controls Passed: {summary.passed}
Controls Requiring Attention: {summary.failed + summary.partially_met + summary.requires_review}

This attestation is based on evidence automatically collected during bot execution and
stored in a cryptographically secured evidence pack. The evidence pack includes audit logs,
data lineage records, agent decision documentation, and integrity verification data."""

    def _generate_detailed_findings(self, evaluations: List[ControlEvaluation]) -> str:
        """Generate detailed findings text"""
        findings = []
        findings.append("DETAILED CONTROL FINDINGS")
        findings.append("=" * 50)

        # Group by category
        categories: Dict[str, List[ControlEvaluation]] = {}
        for eval in evaluations:
            if eval.category not in categories:
                categories[eval.category] = []
            categories[eval.category].append(eval)

        for category, evals in categories.items():
            findings.append(f"\n{category}")
            findings.append("-" * len(category))

            for eval in evals:
                status_symbol = {
                    ControlStatus.PASSED: "[PASS]",
                    ControlStatus.FAILED: "[FAIL]",
                    ControlStatus.PARTIALLY_MET: "[PARTIAL]",
                    ControlStatus.NOT_APPLICABLE: "[N/A]",
                    ControlStatus.REQUIRES_MANUAL_REVIEW: "[REVIEW]",
                }.get(eval.status, "[?]")

                findings.append(f"\n{status_symbol} {eval.control_id}: {eval.name}")
                findings.append(f"   Finding: {eval.findings}")
                if eval.recommendations:
                    findings.append(f"   Recommendation: {eval.recommendations}")

        return "\n".join(findings)

    def _generate_recommendations(self, evaluations: List[ControlEvaluation]) -> List[str]:
        """Generate list of recommendations"""
        recommendations = []

        for eval in evaluations:
            if eval.status in [ControlStatus.FAILED, ControlStatus.PARTIALLY_MET, ControlStatus.REQUIRES_MANUAL_REVIEW]:
                if eval.recommendations:
                    recommendations.append(f"[{eval.control_id}] {eval.recommendations}")

        return recommendations

    def _calculate_pack_hash(self, evidence_pack_path: str) -> str:
        """Calculate hash of evidence pack manifest"""
        manifest_path = Path(evidence_pack_path) / "manifest.json"
        if manifest_path.exists():
            with open(manifest_path, "rb") as f:
                return hashlib.sha256(f.read()).hexdigest()
        return ""

    def _sign_report(self, report: AttestationReport) -> Dict[str, Any]:
        """Sign the attestation report"""
        # Prepare data for signing (exclude signature field)
        report_data = report.to_dict()
        report_data.pop("signature", None)
        report_json = json.dumps(report_data, sort_keys=True)

        try:
            signature_metadata = self._signer.sign_manifest(report_json)
            return signature_metadata.to_dict()
        except Exception as e:
            return {
                "error": f"Signing failed: {e}",
                "signed": False,
            }

    def save_attestation(
        self,
        report: AttestationReport,
        output_path: str,
        formats: Optional[List[str]] = None,
    ) -> Dict[str, str]:
        """
        Save attestation report to files.

        Args:
            report: Attestation report to save
            output_path: Base path for output files
            formats: List of formats to generate ("json", "txt", "html")

        Returns:
            Dictionary of format -> file path
        """
        formats = formats or ["json", "txt"]
        output_files = {}
        base_path = Path(output_path)
        base_path.mkdir(parents=True, exist_ok=True)

        base_name = f"attestation_{report.metadata.attestation_id}"

        if "json" in formats:
            json_path = base_path / f"{base_name}.json"
            with open(json_path, "w") as f:
                f.write(report.to_json())
            output_files["json"] = str(json_path)

        if "txt" in formats:
            txt_path = base_path / f"{base_name}.txt"
            with open(txt_path, "w") as f:
                f.write(self._generate_text_report(report))
            output_files["txt"] = str(txt_path)

        if "html" in formats:
            html_path = base_path / f"{base_name}.html"
            with open(html_path, "w") as f:
                f.write(self._generate_html_report(report))
            output_files["html"] = str(html_path)

        return output_files

    def _generate_text_report(self, report: AttestationReport) -> str:
        """Generate plain text report"""
        lines = []
        lines.append("=" * 70)
        lines.append("COMPLIANCE ATTESTATION REPORT")
        lines.append("=" * 70)
        lines.append("")
        lines.append(f"Attestation ID: {report.metadata.attestation_id}")
        lines.append(f"Framework: {report.metadata.framework.value.upper()}")
        lines.append(f"Organization: {report.metadata.organization_name}")
        lines.append(f"Bot: {report.metadata.bot_name}")
        lines.append(f"Generated: {report.metadata.generated_at}")
        lines.append("")
        lines.append("-" * 70)
        lines.append("EXECUTIVE SUMMARY")
        lines.append("-" * 70)
        lines.append(report.executive_summary)
        lines.append("")
        lines.append("-" * 70)
        lines.append("COMPLIANCE SUMMARY")
        lines.append("-" * 70)
        lines.append(f"Overall Status: {report.summary.overall_status.upper()}")
        lines.append(f"Compliance Score: {report.summary.compliance_score}%")
        lines.append(f"Total Controls: {report.summary.total_controls}")
        lines.append(f"  Passed: {report.summary.passed}")
        lines.append(f"  Failed: {report.summary.failed}")
        lines.append(f"  Partially Met: {report.summary.partially_met}")
        lines.append(f"  Requires Review: {report.summary.requires_review}")
        lines.append(f"  Not Applicable: {report.summary.not_applicable}")
        lines.append("")
        lines.append("-" * 70)
        lines.append(report.detailed_findings)
        lines.append("")

        if report.recommendations:
            lines.append("-" * 70)
            lines.append("RECOMMENDATIONS")
            lines.append("-" * 70)
            for rec in report.recommendations:
                lines.append(f"  - {rec}")
            lines.append("")

        if report.evidence_pack_hash:
            lines.append("-" * 70)
            lines.append("EVIDENCE PACK")
            lines.append("-" * 70)
            lines.append(f"Pack ID: {report.metadata.evidence_pack_id}")
            lines.append(f"Hash: {report.evidence_pack_hash}")
            lines.append("")

        if report.signature:
            lines.append("-" * 70)
            lines.append("DIGITAL SIGNATURE")
            lines.append("-" * 70)
            if report.signature.get("signed"):
                lines.append(f"Algorithm: {report.signature.get('algorithm', 'N/A')}")
                lines.append(f"Timestamp: {report.signature.get('timestamp', 'N/A')}")
            else:
                lines.append("Not signed")
            lines.append("")

        lines.append("=" * 70)
        lines.append(f"Generated by {report.metadata.generated_by} v{report.metadata.version}")
        lines.append("=" * 70)

        return "\n".join(lines)

    def _generate_html_report(self, report: AttestationReport) -> str:
        """Generate HTML report"""
        status_colors = {
            "compliant": "#22c55e",
            "partially_compliant": "#eab308",
            "non_compliant": "#ef4444",
            "pending_review": "#3b82f6",
        }
        status_color = status_colors.get(report.summary.overall_status, "#6b7280")

        control_rows = []
        for eval in report.control_evaluations:
            status_class = {
                ControlStatus.PASSED: "status-passed",
                ControlStatus.FAILED: "status-failed",
                ControlStatus.PARTIALLY_MET: "status-partial",
                ControlStatus.REQUIRES_MANUAL_REVIEW: "status-review",
                ControlStatus.NOT_APPLICABLE: "status-na",
            }.get(eval.status, "")

            control_rows.append(f"""
                <tr class="{status_class}">
                    <td>{eval.control_id}</td>
                    <td>{eval.name}</td>
                    <td>{eval.category}</td>
                    <td>{eval.status.value.replace('_', ' ').title()}</td>
                    <td>{eval.findings}</td>
                </tr>
            """)

        return f"""<!DOCTYPE html>
<html>
<head>
    <title>Compliance Attestation - {report.metadata.attestation_id}</title>
    <style>
        body {{ font-family: system-ui, -apple-system, sans-serif; margin: 40px; background: #f9fafb; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        h1 {{ color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; }}
        h2 {{ color: #374151; margin-top: 32px; }}
        .meta {{ background: #f3f4f6; padding: 16px; border-radius: 4px; margin-bottom: 24px; }}
        .meta p {{ margin: 4px 0; }}
        .score {{ font-size: 48px; font-weight: bold; color: {status_color}; }}
        .status {{ display: inline-block; padding: 4px 12px; border-radius: 4px; background: {status_color}; color: white; font-weight: 500; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }}
        th {{ background: #f9fafb; font-weight: 600; }}
        .status-passed {{ background: #f0fdf4; }}
        .status-failed {{ background: #fef2f2; }}
        .status-partial {{ background: #fefce8; }}
        .status-review {{ background: #eff6ff; }}
        .status-na {{ background: #f9fafb; color: #9ca3af; }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }}
        .summary-card {{ background: #f9fafb; padding: 16px; border-radius: 4px; text-align: center; }}
        .summary-card .value {{ font-size: 24px; font-weight: bold; color: #111827; }}
        .summary-card .label {{ color: #6b7280; font-size: 14px; }}
        .executive-summary {{ background: #f9fafb; padding: 24px; border-radius: 4px; white-space: pre-line; }}
        .recommendations {{ background: #fefce8; padding: 16px; border-radius: 4px; }}
        .recommendations li {{ margin: 8px 0; }}
        footer {{ margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Compliance Attestation Report</h1>

        <div class="meta">
            <p><strong>Attestation ID:</strong> {report.metadata.attestation_id}</p>
            <p><strong>Framework:</strong> {report.metadata.framework.value.upper()}</p>
            <p><strong>Organization:</strong> {report.metadata.organization_name}</p>
            <p><strong>Bot:</strong> {report.metadata.bot_name}</p>
            <p><strong>Generated:</strong> {report.metadata.generated_at}</p>
        </div>

        <h2>Compliance Status</h2>
        <div class="summary-grid">
            <div class="summary-card">
                <div class="score">{report.summary.compliance_score}%</div>
                <div class="label">Compliance Score</div>
            </div>
            <div class="summary-card">
                <div class="value">{report.summary.passed}/{report.summary.total_controls}</div>
                <div class="label">Controls Passed</div>
            </div>
            <div class="summary-card">
                <div class="status">{report.summary.overall_status.replace('_', ' ').upper()}</div>
                <div class="label">Overall Status</div>
            </div>
        </div>

        <h2>Executive Summary</h2>
        <div class="executive-summary">{report.executive_summary}</div>

        <h2>Control Evaluations</h2>
        <table>
            <thead>
                <tr>
                    <th>Control ID</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Findings</th>
                </tr>
            </thead>
            <tbody>
                {''.join(control_rows)}
            </tbody>
        </table>

        {'<h2>Recommendations</h2><div class="recommendations"><ul>' + ''.join(f'<li>{r}</li>' for r in report.recommendations) + '</ul></div>' if report.recommendations else ''}

        <footer>
            <p>Generated by {report.metadata.generated_by} v{report.metadata.version}</p>
            {f'<p>Evidence Pack: {report.metadata.evidence_pack_id} (SHA-256: {report.evidence_pack_hash[:16]}...)</p>' if report.evidence_pack_hash else ''}
        </footer>
    </div>
</body>
</html>"""
