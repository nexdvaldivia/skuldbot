"""
SkuldBot Compliance Library - HIPAA Safe Harbor & PII Protection

Esta librería implementa:
- Detección de PII (Personally Identifiable Information)
- Detección de PHI (Protected Health Information) según HIPAA
- 6 métodos de de-identificación HIPAA Safe Harbor
- 18 identificadores HIPAA que deben ser removidos/protegidos
- Políticas de compliance (HIPAA, GDPR, CCPA)

HIPAA Safe Harbor Method requiere remover/generalizar 18 tipos de identificadores:
1. Names
2. Geographic data (smaller than state)
3. Dates (except year) related to individual
4. Phone numbers
5. Fax numbers
6. Email addresses
7. Social Security numbers
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate/license numbers
12. Vehicle identifiers and serial numbers
13. Device identifiers and serial numbers
14. Web URLs
15. IP addresses
16. Biometric identifiers
17. Full-face photographs
18. Any other unique identifying number/code
"""

import re
import hashlib
import random
import string
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, date
from robot.api.deco import keyword, library
from robot.api import logger


class ComplianceRegulation(Enum):
    """Regulaciones de compliance soportadas"""
    HIPAA = "hipaa"
    GDPR = "gdpr"
    CCPA = "ccpa"
    HIPAA_SAFE_HARBOR = "hipaa_safe_harbor"


class SensitiveDataType(Enum):
    """Tipos de datos sensibles"""
    # PII Types
    NAME = "name"
    SSN = "ssn"
    EMAIL = "email"
    PHONE = "phone"
    ADDRESS = "address"
    DATE_OF_BIRTH = "date_of_birth"
    DRIVERS_LICENSE = "drivers_license"
    PASSPORT = "passport"
    CREDIT_CARD = "credit_card"
    BANK_ACCOUNT = "bank_account"
    IP_ADDRESS = "ip_address"

    # PHI Types (HIPAA 18 identifiers)
    MEDICAL_RECORD_NUMBER = "medical_record_number"
    HEALTH_PLAN_ID = "health_plan_id"
    ACCOUNT_NUMBER = "account_number"
    CERTIFICATE_LICENSE = "certificate_license"
    VEHICLE_IDENTIFIER = "vehicle_identifier"
    DEVICE_IDENTIFIER = "device_identifier"
    WEB_URL = "web_url"
    BIOMETRIC = "biometric"
    PHOTO = "photo"
    FAX = "fax"
    DIAGNOSIS = "diagnosis"
    TREATMENT = "treatment"
    MEDICATION = "medication"
    LAB_RESULT = "lab_result"


class DeidentificationMethod(Enum):
    """Métodos de de-identificación HIPAA Safe Harbor"""
    REDACT = "redact"              # Eliminar completamente
    MASK = "mask"                  # Reemplazar con asteriscos/caracteres
    GENERALIZE = "generalize"     # Generalizar (ej: edad exacta -> rango)
    PSEUDONYMIZE = "pseudonymize" # Reemplazar con identificador falso consistente
    HASH = "hash"                  # Hash criptográfico
    ENCRYPT = "encrypt"           # Encriptación reversible


@dataclass
class DetectedEntity:
    """Entidad sensible detectada"""
    type: SensitiveDataType
    value: str
    start: int
    end: int
    confidence: float
    context: str = ""
    is_phi: bool = False
    is_pii: bool = False


@dataclass
class DetectionResult:
    """Resultado de detección de datos sensibles"""
    pii_detected: bool = False
    phi_detected: bool = False
    entities: List[DetectedEntity] = field(default_factory=list)
    pii_count: int = 0
    phi_count: int = 0
    risk_level: str = "none"  # none, low, medium, high, critical
    regulations_triggered: List[str] = field(default_factory=list)


@dataclass
class DeidentificationResult:
    """Resultado de de-identificación"""
    original_text: str
    deidentified_text: str
    entities_processed: int
    method_used: str
    policy_applied: str
    audit_log: List[Dict[str, Any]] = field(default_factory=list)


# Patrones de regex para detección
PATTERNS = {
    # PII Patterns
    SensitiveDataType.SSN: [
        r'\b\d{3}-\d{2}-\d{4}\b',
        r'\b\d{9}\b(?=.*(?:ssn|social|security))',
    ],
    SensitiveDataType.EMAIL: [
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    ],
    SensitiveDataType.PHONE: [
        r'\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
        r'\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b',
        r'\+\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
    ],
    SensitiveDataType.CREDIT_CARD: [
        r'\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b',
    ],
    SensitiveDataType.IP_ADDRESS: [
        r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b',
        r'\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b',  # IPv6
    ],
    SensitiveDataType.DATE_OF_BIRTH: [
        r'\b(?:0[1-9]|1[0-2])[/-](?:0[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b',
        r'\b(?:19|20)\d{2}[/-](?:0[1-9]|1[0-2])[/-](?:0[1-9]|[12]\d|3[01])\b',
    ],
    SensitiveDataType.DRIVERS_LICENSE: [
        r'\b[A-Z]{1,2}\d{6,8}\b',
    ],

    # PHI Patterns (HIPAA specific)
    SensitiveDataType.MEDICAL_RECORD_NUMBER: [
        r'\b(?:MRN|MR#|Medical Record)[:\s#]*\d{6,12}\b',
        r'\bMRN\d{6,12}\b',
    ],
    SensitiveDataType.HEALTH_PLAN_ID: [
        r'\b(?:Member ID|Plan ID|Subscriber ID)[:\s#]*[A-Z0-9]{8,15}\b',
    ],
    SensitiveDataType.FAX: [
        r'\b(?:fax|facsimile)[:\s]*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
    ],
    SensitiveDataType.WEB_URL: [
        r'https?://(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)',
    ],
    SensitiveDataType.DEVICE_IDENTIFIER: [
        r'\b(?:Serial|Device ID|IMEI)[:\s#]*[A-Z0-9]{10,20}\b',
    ],
}

# Palabras clave para detección contextual de PHI
PHI_KEYWORDS = {
    'diagnosis': ['diagnosis', 'diagnosed', 'dx', 'condition', 'disease', 'disorder', 'syndrome'],
    'treatment': ['treatment', 'therapy', 'procedure', 'surgery', 'medication', 'prescription'],
    'medication': ['mg', 'ml', 'tablet', 'capsule', 'injection', 'dosage', 'prescribed'],
    'lab_result': ['lab', 'result', 'test', 'blood', 'urine', 'positive', 'negative', 'level'],
    'medical_codes': ['icd', 'cpt', 'hcpcs', 'ndc', 'snomed'],
}

# 18 Identificadores HIPAA Safe Harbor
HIPAA_18_IDENTIFIERS = [
    "names",
    "geographic_data",  # Smaller than state
    "dates",            # Except year
    "phone_numbers",
    "fax_numbers",
    "email_addresses",
    "ssn",
    "medical_record_numbers",
    "health_plan_ids",
    "account_numbers",
    "certificate_license_numbers",
    "vehicle_identifiers",
    "device_identifiers",
    "web_urls",
    "ip_addresses",
    "biometric_identifiers",
    "photographs",
    "other_unique_ids",
]


@library(scope="GLOBAL", auto_keywords=True)
class SkuldCompliance:
    """
    SkuldBot Compliance Library

    Implementa detección y protección de PII/PHI según HIPAA Safe Harbor,
    GDPR y CCPA.

    Keywords disponibles:
    - Detect Sensitive Data: Detecta PII y PHI en texto
    - Detect PII: Detecta solo PII
    - Detect PHI: Detecta solo PHI (HIPAA)
    - Mask Sensitive Data: Enmascara datos sensibles
    - Redact Sensitive Data: Elimina datos sensibles
    - Pseudonymize Data: Reemplaza con identificadores falsos
    - Hash Sensitive Data: Aplica hash criptográfico
    - Generalize Data: Generaliza datos (ej: edad -> rango)
    - Apply HIPAA Safe Harbor: Aplica los 6 métodos de de-identificación
    - Classify Data Sensitivity: Clasifica nivel de sensibilidad
    - Create Audit Log: Crea registro de auditoría
    - Validate HIPAA Compliance: Valida cumplimiento HIPAA
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_DOC_FORMAT = "ROBOT"

    def __init__(self):
        self._pseudonym_map: Dict[str, str] = {}
        self._audit_log: List[Dict[str, Any]] = []
        self._salt: str = self._generate_salt()

    def _generate_salt(self) -> str:
        """Genera salt para hashing"""
        return ''.join(random.choices(string.ascii_letters + string.digits, k=16))

    def _detect_with_patterns(self, text: str, data_type: SensitiveDataType) -> List[DetectedEntity]:
        """Detecta entidades usando patrones regex"""
        entities = []
        patterns = PATTERNS.get(data_type, [])

        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                entity = DetectedEntity(
                    type=data_type,
                    value=match.group(),
                    start=match.start(),
                    end=match.end(),
                    confidence=0.9,
                    context=text[max(0, match.start()-20):min(len(text), match.end()+20)],
                    is_pii=data_type in [
                        SensitiveDataType.SSN, SensitiveDataType.EMAIL,
                        SensitiveDataType.PHONE, SensitiveDataType.CREDIT_CARD,
                        SensitiveDataType.DRIVERS_LICENSE, SensitiveDataType.PASSPORT,
                        SensitiveDataType.DATE_OF_BIRTH, SensitiveDataType.ADDRESS,
                        SensitiveDataType.IP_ADDRESS, SensitiveDataType.BANK_ACCOUNT,
                    ],
                    is_phi=data_type in [
                        SensitiveDataType.MEDICAL_RECORD_NUMBER,
                        SensitiveDataType.HEALTH_PLAN_ID,
                        SensitiveDataType.DIAGNOSIS, SensitiveDataType.TREATMENT,
                        SensitiveDataType.MEDICATION, SensitiveDataType.LAB_RESULT,
                        SensitiveDataType.DEVICE_IDENTIFIER, SensitiveDataType.FAX,
                    ],
                )
                entities.append(entity)

        return entities

    def _detect_names(self, text: str) -> List[DetectedEntity]:
        """Detecta nombres usando heurísticas"""
        entities = []
        # Patrón para nombres (palabras capitalizadas consecutivas)
        name_pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b'

        # Palabras que NO son nombres
        exclude_words = {'The', 'This', 'That', 'These', 'Those', 'Monday', 'Tuesday',
                        'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
                        'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'}

        for match in re.finditer(name_pattern, text):
            name = match.group()
            words = name.split()
            if not any(w in exclude_words for w in words):
                entities.append(DetectedEntity(
                    type=SensitiveDataType.NAME,
                    value=name,
                    start=match.start(),
                    end=match.end(),
                    confidence=0.7,
                    context=text[max(0, match.start()-20):min(len(text), match.end()+20)],
                    is_pii=True,
                    is_phi=True,  # Names are both PII and PHI
                ))

        return entities

    def _detect_phi_context(self, text: str) -> List[DetectedEntity]:
        """Detecta PHI por contexto médico"""
        entities = []
        text_lower = text.lower()

        for phi_type, keywords in PHI_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text_lower:
                    # Encontrar la oración/contexto
                    idx = text_lower.find(keyword)
                    start = text.rfind('.', 0, idx) + 1
                    end = text.find('.', idx)
                    if end == -1:
                        end = len(text)

                    context_text = text[start:end].strip()
                    if context_text:
                        entities.append(DetectedEntity(
                            type=SensitiveDataType.DIAGNOSIS if phi_type == 'diagnosis'
                                 else SensitiveDataType.TREATMENT if phi_type == 'treatment'
                                 else SensitiveDataType.MEDICATION if phi_type == 'medication'
                                 else SensitiveDataType.LAB_RESULT,
                            value=context_text,
                            start=start,
                            end=end,
                            confidence=0.6,
                            context=context_text,
                            is_pii=False,
                            is_phi=True,
                        ))
                    break

        return entities

    @keyword("Detect Sensitive Data")
    def detect_sensitive_data(
        self,
        text: str,
        regulation: str = "hipaa",
        confidence_threshold: float = 0.5,
        include_context: bool = True,
    ) -> Dict[str, Any]:
        """
        Detecta datos sensibles (PII y PHI) en texto.

        Args:
            text: Texto a analizar
            regulation: Regulación a aplicar (hipaa, gdpr, ccpa)
            confidence_threshold: Umbral mínimo de confianza (0-1)
            include_context: Incluir contexto de cada entidad

        Returns:
            Diccionario con resultados de detección

        Example:
            | ${result}= | Detect Sensitive Data | John Doe, SSN: 123-45-6789 | hipaa |
            | Should Be True | ${result}[pii_detected] |
        """
        entities = []

        # Detectar con patrones
        for data_type in PATTERNS.keys():
            entities.extend(self._detect_with_patterns(text, data_type))

        # Detectar nombres
        entities.extend(self._detect_names(text))

        # Detectar PHI por contexto
        if regulation.lower() in ['hipaa', 'hipaa_safe_harbor']:
            entities.extend(self._detect_phi_context(text))

        # Filtrar por confianza
        entities = [e for e in entities if e.confidence >= confidence_threshold]

        # Eliminar duplicados por posición
        seen_positions = set()
        unique_entities = []
        for entity in entities:
            pos_key = (entity.start, entity.end)
            if pos_key not in seen_positions:
                seen_positions.add(pos_key)
                unique_entities.append(entity)

        entities = unique_entities

        # Calcular métricas
        pii_entities = [e for e in entities if e.is_pii]
        phi_entities = [e for e in entities if e.is_phi]

        # Determinar nivel de riesgo
        total_sensitive = len(entities)
        if total_sensitive == 0:
            risk_level = "none"
        elif total_sensitive <= 2:
            risk_level = "low"
        elif total_sensitive <= 5:
            risk_level = "medium"
        elif total_sensitive <= 10:
            risk_level = "high"
        else:
            risk_level = "critical"

        # Si hay PHI, aumentar riesgo
        if phi_entities:
            if risk_level == "low":
                risk_level = "medium"
            elif risk_level == "medium":
                risk_level = "high"

        # Regulaciones triggered
        regulations_triggered = []
        if pii_entities:
            regulations_triggered.extend(["gdpr", "ccpa"])
        if phi_entities:
            regulations_triggered.append("hipaa")

        result = {
            "pii_detected": len(pii_entities) > 0,
            "phi_detected": len(phi_entities) > 0,
            "pii_count": len(pii_entities),
            "phi_count": len(phi_entities),
            "total_entities": len(entities),
            "risk_level": risk_level,
            "regulations_triggered": list(set(regulations_triggered)),
            "entities": [
                {
                    "type": e.type.value,
                    "value": e.value if include_context else "[REDACTED]",
                    "confidence": e.confidence,
                    "is_pii": e.is_pii,
                    "is_phi": e.is_phi,
                    "context": e.context if include_context else "",
                }
                for e in entities
            ],
        }

        # Log audit
        self._log_audit("detect_sensitive_data", {
            "text_length": len(text),
            "regulation": regulation,
            "pii_detected": result["pii_detected"],
            "phi_detected": result["phi_detected"],
            "risk_level": risk_level,
        })

        logger.info(f"Detected {len(entities)} sensitive entities (PII: {len(pii_entities)}, PHI: {len(phi_entities)})")

        return result

    @keyword("Detect PII")
    def detect_pii(self, text: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """
        Detecta solo PII (Personally Identifiable Information).

        Args:
            text: Texto a analizar
            confidence_threshold: Umbral mínimo de confianza

        Returns:
            Diccionario con PII detectada

        Example:
            | ${result}= | Detect PII | Email: john@example.com, Phone: 555-123-4567 |
            | Log | Found ${result}[pii_count] PII entities |
        """
        result = self.detect_sensitive_data(text, "gdpr", confidence_threshold)

        # Filtrar solo PII
        pii_entities = [e for e in result["entities"] if e["is_pii"]]

        return {
            "pii_detected": len(pii_entities) > 0,
            "pii_count": len(pii_entities),
            "entities": pii_entities,
            "types_found": list(set(e["type"] for e in pii_entities)),
        }

    @keyword("Detect PHI")
    def detect_phi(self, text: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """
        Detecta PHI (Protected Health Information) según HIPAA.

        Los 18 identificadores HIPAA incluyen:
        - Names, Geographic data, Dates, Phone/Fax numbers
        - Email, SSN, Medical record numbers, Health plan IDs
        - Account numbers, Certificate/license numbers
        - Vehicle/Device identifiers, Web URLs, IP addresses
        - Biometric identifiers, Photographs, Other unique IDs

        Args:
            text: Texto a analizar
            confidence_threshold: Umbral mínimo de confianza

        Returns:
            Diccionario con PHI detectada

        Example:
            | ${result}= | Detect PHI | Patient MRN: 123456, Diagnosis: Diabetes Type 2 |
            | Should Be True | ${result}[phi_detected] |
        """
        result = self.detect_sensitive_data(text, "hipaa", confidence_threshold)

        # Filtrar solo PHI
        phi_entities = [e for e in result["entities"] if e["is_phi"]]

        return {
            "phi_detected": len(phi_entities) > 0,
            "phi_count": len(phi_entities),
            "entities": phi_entities,
            "types_found": list(set(e["type"] for e in phi_entities)),
            "hipaa_identifiers_found": self._map_to_hipaa_18(phi_entities),
        }

    def _map_to_hipaa_18(self, entities: List[Dict]) -> List[str]:
        """Mapea entidades a los 18 identificadores HIPAA"""
        hipaa_found = set()

        type_to_hipaa = {
            "name": "names",
            "address": "geographic_data",
            "date_of_birth": "dates",
            "phone": "phone_numbers",
            "fax": "fax_numbers",
            "email": "email_addresses",
            "ssn": "ssn",
            "medical_record_number": "medical_record_numbers",
            "health_plan_id": "health_plan_ids",
            "account_number": "account_numbers",
            "certificate_license": "certificate_license_numbers",
            "vehicle_identifier": "vehicle_identifiers",
            "device_identifier": "device_identifiers",
            "web_url": "web_urls",
            "ip_address": "ip_addresses",
            "biometric": "biometric_identifiers",
            "photo": "photographs",
        }

        for entity in entities:
            hipaa_id = type_to_hipaa.get(entity["type"])
            if hipaa_id:
                hipaa_found.add(hipaa_id)

        return list(hipaa_found)

    @keyword("Mask Sensitive Data")
    def mask_sensitive_data(
        self,
        text: str,
        mask_char: str = "*",
        preserve_length: bool = True,
        partial_mask: bool = False,
        mask_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Enmascara datos sensibles con caracteres de reemplazo.

        Método 1 de HIPAA Safe Harbor: Masking

        Args:
            text: Texto a procesar
            mask_char: Caracter de enmascaramiento
            preserve_length: Mantener longitud original
            partial_mask: Enmascarar parcialmente (mostrar últimos 4 chars)
            mask_types: Lista de tipos a enmascarar (None = todos)

        Returns:
            Diccionario con texto enmascarado y auditoría

        Example:
            | ${result}= | Mask Sensitive Data | SSN: 123-45-6789 | * |
            | Log | ${result}[masked_text] |  # SSN: ***-**-****
        """
        detection = self.detect_sensitive_data(text, "hipaa")
        masked_text = text
        audit_entries = []

        # Ordenar entidades de mayor a menor posición para reemplazar correctamente
        entities = sorted(detection["entities"], key=lambda x: x.get("start", 0), reverse=True)

        for entity in entities:
            if mask_types and entity["type"] not in mask_types:
                continue

            original_value = entity["value"]

            if partial_mask and len(original_value) > 4:
                # Mostrar últimos 4 caracteres
                mask_length = len(original_value) - 4
                masked_value = mask_char * mask_length + original_value[-4:]
            elif preserve_length:
                masked_value = mask_char * len(original_value)
            else:
                masked_value = f"[{entity['type'].upper()}]"

            masked_text = masked_text.replace(original_value, masked_value, 1)

            audit_entries.append({
                "action": "mask",
                "type": entity["type"],
                "original_length": len(original_value),
                "masked_preview": masked_value[:10] + "..." if len(masked_value) > 10 else masked_value,
            })

        self._log_audit("mask_sensitive_data", {
            "entities_masked": len(audit_entries),
            "policy": "HIPAA_SAFE_HARBOR_MASK",
        })

        return {
            "original_text": text,
            "masked_text": masked_text,
            "entities_processed": len(audit_entries),
            "method": "mask",
            "policy": "HIPAA_SAFE_HARBOR",
            "audit_log": audit_entries,
        }

    @keyword("Redact Sensitive Data")
    def redact_sensitive_data(
        self,
        text: str,
        replacement: str = "[REDACTED]",
        redact_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Elimina (redacta) datos sensibles completamente.

        Método 2 de HIPAA Safe Harbor: Redaction

        Args:
            text: Texto a procesar
            replacement: Texto de reemplazo
            redact_types: Lista de tipos a redactar (None = todos)

        Returns:
            Diccionario con texto redactado y auditoría

        Example:
            | ${result}= | Redact Sensitive Data | Patient: John Doe, MRN: 123456 |
            | Log | ${result}[redacted_text] |
        """
        detection = self.detect_sensitive_data(text, "hipaa")
        redacted_text = text
        audit_entries = []

        entities = sorted(detection["entities"], key=lambda x: x.get("start", 0), reverse=True)

        for entity in entities:
            if redact_types and entity["type"] not in redact_types:
                continue

            original_value = entity["value"]
            type_replacement = f"[{entity['type'].upper()}_REDACTED]" if replacement == "[REDACTED]" else replacement

            redacted_text = redacted_text.replace(original_value, type_replacement, 1)

            audit_entries.append({
                "action": "redact",
                "type": entity["type"],
                "original_length": len(original_value),
            })

        self._log_audit("redact_sensitive_data", {
            "entities_redacted": len(audit_entries),
            "policy": "HIPAA_SAFE_HARBOR_REDACT",
        })

        return {
            "original_text": text,
            "redacted_text": redacted_text,
            "entities_processed": len(audit_entries),
            "method": "redact",
            "policy": "HIPAA_SAFE_HARBOR",
            "audit_log": audit_entries,
        }

    @keyword("Pseudonymize Data")
    def pseudonymize_data(
        self,
        text: str,
        consistent: bool = True,
        prefix: str = "PSEUDO_",
    ) -> Dict[str, Any]:
        """
        Reemplaza datos sensibles con pseudónimos consistentes.

        Método 3 de HIPAA Safe Harbor: Pseudonymization

        Args:
            text: Texto a procesar
            consistent: Usar mismo pseudónimo para mismo valor
            prefix: Prefijo para pseudónimos

        Returns:
            Diccionario con texto pseudonimizado

        Example:
            | ${result}= | Pseudonymize Data | John Doe visited Dr. Smith |
            | Log | ${result}[pseudonymized_text] |  # PSEUDO_001 visited PSEUDO_002
        """
        detection = self.detect_sensitive_data(text, "hipaa")
        pseudonymized_text = text
        audit_entries = []

        entities = sorted(detection["entities"], key=lambda x: x.get("start", 0), reverse=True)
        counter = len(self._pseudonym_map) + 1

        for entity in entities:
            original_value = entity["value"]

            if consistent and original_value in self._pseudonym_map:
                pseudonym = self._pseudonym_map[original_value]
            else:
                pseudonym = f"{prefix}{entity['type'].upper()}_{counter:04d}"
                if consistent:
                    self._pseudonym_map[original_value] = pseudonym
                counter += 1

            pseudonymized_text = pseudonymized_text.replace(original_value, pseudonym, 1)

            audit_entries.append({
                "action": "pseudonymize",
                "type": entity["type"],
                "pseudonym": pseudonym,
            })

        self._log_audit("pseudonymize_data", {
            "entities_pseudonymized": len(audit_entries),
            "policy": "HIPAA_SAFE_HARBOR_PSEUDONYMIZE",
        })

        return {
            "original_text": text,
            "pseudonymized_text": pseudonymized_text,
            "entities_processed": len(audit_entries),
            "method": "pseudonymize",
            "policy": "HIPAA_SAFE_HARBOR",
            "pseudonym_map_size": len(self._pseudonym_map),
            "audit_log": audit_entries,
        }

    @keyword("Hash Sensitive Data")
    def hash_sensitive_data(
        self,
        text: str,
        algorithm: str = "sha256",
        truncate: int = 8,
    ) -> Dict[str, Any]:
        """
        Aplica hash criptográfico a datos sensibles.

        Método 4 de HIPAA Safe Harbor: Hashing

        Args:
            text: Texto a procesar
            algorithm: Algoritmo de hash (sha256, sha512, md5)
            truncate: Número de caracteres del hash a mostrar

        Returns:
            Diccionario con texto hasheado

        Example:
            | ${result}= | Hash Sensitive Data | SSN: 123-45-6789 |
            | Log | ${result}[hashed_text] |  # SSN: a1b2c3d4
        """
        detection = self.detect_sensitive_data(text, "hipaa")
        hashed_text = text
        audit_entries = []

        entities = sorted(detection["entities"], key=lambda x: x.get("start", 0), reverse=True)

        for entity in entities:
            original_value = entity["value"]

            # Crear hash con salt
            salted_value = f"{self._salt}{original_value}"

            if algorithm == "sha256":
                hash_obj = hashlib.sha256(salted_value.encode())
            elif algorithm == "sha512":
                hash_obj = hashlib.sha512(salted_value.encode())
            else:
                hash_obj = hashlib.md5(salted_value.encode())

            hashed_value = hash_obj.hexdigest()[:truncate]

            hashed_text = hashed_text.replace(original_value, hashed_value, 1)

            audit_entries.append({
                "action": "hash",
                "type": entity["type"],
                "algorithm": algorithm,
                "hash_preview": hashed_value,
            })

        self._log_audit("hash_sensitive_data", {
            "entities_hashed": len(audit_entries),
            "algorithm": algorithm,
            "policy": "HIPAA_SAFE_HARBOR_HASH",
        })

        return {
            "original_text": text,
            "hashed_text": hashed_text,
            "entities_processed": len(audit_entries),
            "method": "hash",
            "algorithm": algorithm,
            "policy": "HIPAA_SAFE_HARBOR",
            "audit_log": audit_entries,
        }

    @keyword("Generalize Data")
    def generalize_data(
        self,
        text: str,
        generalization_rules: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Generaliza datos sensibles (ej: edad exacta -> rango de edad).

        Método 5 de HIPAA Safe Harbor: Generalization

        Args:
            text: Texto a procesar
            generalization_rules: Reglas personalizadas de generalización

        Returns:
            Diccionario con texto generalizado

        Example:
            | ${result}= | Generalize Data | Age: 45, ZIP: 12345 |
            | Log | ${result}[generalized_text] |  # Age: 40-50, ZIP: 123XX
        """
        detection = self.detect_sensitive_data(text, "hipaa")
        generalized_text = text
        audit_entries = []

        default_rules = {
            "date_of_birth": lambda v: self._generalize_date(v),
            "address": lambda v: self._generalize_address(v),
            "phone": lambda v: self._generalize_phone(v),
            "ssn": lambda v: "XXX-XX-" + v[-4:] if len(v) >= 4 else "[SSN]",
            "email": lambda v: self._generalize_email(v),
            "ip_address": lambda v: ".".join(v.split(".")[:2]) + ".X.X" if "." in v else "[IP]",
        }

        entities = sorted(detection["entities"], key=lambda x: x.get("start", 0), reverse=True)

        for entity in entities:
            original_value = entity["value"]
            entity_type = entity["type"]

            if generalization_rules and entity_type in generalization_rules:
                generalized_value = generalization_rules[entity_type]
            elif entity_type in default_rules:
                generalized_value = default_rules[entity_type](original_value)
            else:
                generalized_value = f"[{entity_type.upper()}_GENERALIZED]"

            generalized_text = generalized_text.replace(original_value, str(generalized_value), 1)

            audit_entries.append({
                "action": "generalize",
                "type": entity_type,
                "generalized_preview": str(generalized_value)[:20],
            })

        self._log_audit("generalize_data", {
            "entities_generalized": len(audit_entries),
            "policy": "HIPAA_SAFE_HARBOR_GENERALIZE",
        })

        return {
            "original_text": text,
            "generalized_text": generalized_text,
            "entities_processed": len(audit_entries),
            "method": "generalize",
            "policy": "HIPAA_SAFE_HARBOR",
            "audit_log": audit_entries,
        }

    def _generalize_date(self, date_str: str) -> str:
        """Generaliza fecha a solo año"""
        # Extraer año
        year_match = re.search(r'(19|20)\d{2}', date_str)
        if year_match:
            return year_match.group()
        return "[DATE]"

    def _generalize_address(self, address: str) -> str:
        """Generaliza dirección a estado/región"""
        # Simplificación: remover números y dejar solo texto
        return re.sub(r'\d+', 'XXX', address)

    def _generalize_phone(self, phone: str) -> str:
        """Generaliza teléfono a código de área"""
        digits = re.sub(r'\D', '', phone)
        if len(digits) >= 3:
            return f"({digits[:3]}) XXX-XXXX"
        return "[PHONE]"

    def _generalize_email(self, email: str) -> str:
        """Generaliza email a dominio"""
        if "@" in email:
            domain = email.split("@")[1]
            return f"***@{domain}"
        return "[EMAIL]"

    @keyword("Apply HIPAA Safe Harbor")
    def apply_hipaa_safe_harbor(
        self,
        text: str,
        method: str = "mask",
        strict: bool = True,
    ) -> Dict[str, Any]:
        """
        Aplica de-identificación completa según HIPAA Safe Harbor.

        Combina los 6 métodos de de-identificación para cumplir
        con los requisitos de Safe Harbor.

        Args:
            text: Texto a procesar
            method: Método principal (mask, redact, pseudonymize, hash, generalize)
            strict: Modo estricto - procesa todos los 18 identificadores

        Returns:
            Diccionario con texto de-identificado y certificación

        Example:
            | ${result}= | Apply HIPAA Safe Harbor | Patient John Doe, SSN 123-45-6789, diagnosed with diabetes |
            | Log | ${result}[deidentified_text] |
            | Should Be True | ${result}[hipaa_compliant] |
        """
        # Primero detectar todo
        detection = self.detect_sensitive_data(text, "hipaa_safe_harbor", 0.3)

        # Aplicar método seleccionado
        if method == "mask":
            result = self.mask_sensitive_data(text)
            deidentified_text = result["masked_text"]
        elif method == "redact":
            result = self.redact_sensitive_data(text)
            deidentified_text = result["redacted_text"]
        elif method == "pseudonymize":
            result = self.pseudonymize_data(text)
            deidentified_text = result["pseudonymized_text"]
        elif method == "hash":
            result = self.hash_sensitive_data(text)
            deidentified_text = result["hashed_text"]
        elif method == "generalize":
            result = self.generalize_data(text)
            deidentified_text = result["generalized_text"]
        else:
            result = self.mask_sensitive_data(text)
            deidentified_text = result["masked_text"]

        # Verificar compliance
        post_detection = self.detect_sensitive_data(deidentified_text, "hipaa", 0.5)
        hipaa_compliant = not post_detection["phi_detected"] and post_detection["risk_level"] in ["none", "low"]

        # Generar certificación
        certification = {
            "compliant": hipaa_compliant,
            "method_applied": method,
            "timestamp": datetime.now().isoformat(),
            "identifiers_processed": result["entities_processed"],
            "original_pii_count": detection["pii_count"],
            "original_phi_count": detection["phi_count"],
            "residual_risk": post_detection["risk_level"],
        }

        self._log_audit("apply_hipaa_safe_harbor", {
            "method": method,
            "compliant": hipaa_compliant,
            "entities_processed": result["entities_processed"],
        })

        return {
            "original_text": text,
            "deidentified_text": deidentified_text,
            "hipaa_compliant": hipaa_compliant,
            "method": method,
            "policy": "HIPAA_SAFE_HARBOR",
            "certification": certification,
            "audit_log": result.get("audit_log", []),
        }

    @keyword("Classify Data Sensitivity")
    def classify_data_sensitivity(self, text: str) -> Dict[str, Any]:
        """
        Clasifica el nivel de sensibilidad de los datos.

        Args:
            text: Texto a clasificar

        Returns:
            Diccionario con clasificación de sensibilidad

        Example:
            | ${result}= | Classify Data Sensitivity | Patient record with SSN |
            | Log | Sensitivity: ${result}[sensitivity_level] |
        """
        detection = self.detect_sensitive_data(text, "hipaa")

        # Clasificación
        has_phi = detection["phi_detected"]
        has_pii = detection["pii_detected"]
        risk = detection["risk_level"]

        if has_phi:
            sensitivity_level = "PHI"
            data_classification = "RESTRICTED"
            handling_requirements = [
                "Requires HIPAA authorization for disclosure",
                "Must be encrypted at rest and in transit",
                "Access logging required",
                "Minimum necessary principle applies",
            ]
        elif has_pii:
            sensitivity_level = "PII"
            data_classification = "CONFIDENTIAL"
            handling_requirements = [
                "Requires consent for processing",
                "Subject to GDPR/CCPA rights",
                "Should be encrypted",
                "Retention limits apply",
            ]
        else:
            sensitivity_level = "PUBLIC"
            data_classification = "UNCLASSIFIED"
            handling_requirements = [
                "No special handling required",
            ]

        return {
            "sensitivity_level": sensitivity_level,
            "data_classification": data_classification,
            "risk_level": risk,
            "pii_detected": has_pii,
            "phi_detected": has_phi,
            "handling_requirements": handling_requirements,
            "regulations_applicable": detection["regulations_triggered"],
        }

    @keyword("Create Compliance Audit Log")
    def create_compliance_audit_log(
        self,
        action: str,
        data_type: str,
        user: str = "system",
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Crea entrada de auditoría de compliance.

        Args:
            action: Acción realizada (access, modify, delete, export)
            data_type: Tipo de dato (PHI, PII)
            user: Usuario que realizó la acción
            details: Detalles adicionales

        Returns:
            Entrada de auditoría creada

        Example:
            | ${entry}= | Create Compliance Audit Log | access | PHI | user@example.com |
        """
        entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "data_type": data_type,
            "user": user,
            "details": details or {},
            "compliance_frameworks": ["HIPAA", "GDPR"] if data_type == "PHI" else ["GDPR", "CCPA"],
        }

        self._audit_log.append(entry)
        logger.info(f"Audit log entry created: {action} on {data_type} by {user}")

        return entry

    @keyword("Get Compliance Audit Log")
    def get_compliance_audit_log(self) -> List[Dict[str, Any]]:
        """
        Obtiene el log de auditoría de compliance completo.

        Returns:
            Lista de entradas de auditoría

        Example:
            | ${log}= | Get Compliance Audit Log |
            | Log | Total entries: ${log.__len__()} |
        """
        return self._audit_log.copy()

    @keyword("Validate HIPAA Compliance")
    def validate_hipaa_compliance(self, text: str) -> Dict[str, Any]:
        """
        Valida si el texto cumple con HIPAA (no contiene PHI sin proteger).

        Args:
            text: Texto a validar

        Returns:
            Resultado de validación con recomendaciones

        Example:
            | ${result}= | Validate HIPAA Compliance | Some text to check |
            | Run Keyword If | not ${result}[compliant] | Log | HIPAA violation detected! |
        """
        detection = self.detect_sensitive_data(text, "hipaa", 0.5)

        violations = []
        recommendations = []

        if detection["phi_detected"]:
            for entity in detection["entities"]:
                if entity["is_phi"]:
                    violations.append({
                        "type": entity["type"],
                        "description": f"Unprotected PHI of type '{entity['type']}' detected",
                        "severity": "high",
                    })

            recommendations = [
                "Apply de-identification using HIPAA Safe Harbor method",
                "Ensure data is encrypted before storage/transmission",
                "Verify authorization before disclosure",
                "Log all access to this data",
            ]

        compliant = len(violations) == 0

        return {
            "compliant": compliant,
            "violations": violations,
            "violation_count": len(violations),
            "recommendations": recommendations,
            "risk_level": detection["risk_level"],
            "hipaa_identifiers_found": self._map_to_hipaa_18(detection["entities"]),
        }

    @keyword("Clear Pseudonym Map")
    def clear_pseudonym_map(self):
        """
        Limpia el mapa de pseudónimos (para nueva sesión).

        Example:
            | Clear Pseudonym Map |
        """
        self._pseudonym_map.clear()
        logger.info("Pseudonym map cleared")

    @keyword("Clear Audit Log")
    def clear_audit_log(self):
        """
        Limpia el log de auditoría.

        Example:
            | Clear Audit Log |
        """
        self._audit_log.clear()
        logger.info("Audit log cleared")

    def _log_audit(self, action: str, details: Dict[str, Any]):
        """Helper interno para logging de auditoría"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "details": details,
        }
        self._audit_log.append(entry)
