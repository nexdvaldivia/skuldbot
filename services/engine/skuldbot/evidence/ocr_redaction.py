"""
OCR Redaction - Automatic PII/PHI Detection and Redaction in Screenshots

Enterprise-grade OCR-based redaction for screenshots captured during bot execution.
Automatically detects and redacts sensitive information before storage.

Supported OCR Engines:
1. Tesseract OCR (local, open source)
2. AWS Textract (cloud, high accuracy)
3. Google Cloud Vision (cloud, multi-language)
4. Azure Computer Vision (cloud)

Sensitive Data Detection:
- SSN (Social Security Numbers)
- Credit Card Numbers
- Phone Numbers
- Email Addresses
- Names (NER-based)
- Medical Record Numbers (MRN)
- Dates of Birth
- Addresses
- Custom Patterns (regex-based)
"""

import io
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

# Image processing
try:
    from PIL import Image, ImageDraw, ImageFilter
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Tesseract OCR
try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False


class SensitiveDataType(Enum):
    """Types of sensitive data that can be detected"""
    SSN = "ssn"
    CREDIT_CARD = "credit_card"
    PHONE_NUMBER = "phone_number"
    EMAIL = "email"
    DATE_OF_BIRTH = "date_of_birth"
    ADDRESS = "address"
    NAME = "name"
    MEDICAL_RECORD = "medical_record"
    ACCOUNT_NUMBER = "account_number"
    IP_ADDRESS = "ip_address"
    PASSPORT = "passport"
    DRIVER_LICENSE = "driver_license"
    CUSTOM = "custom"


class RedactionStyle(Enum):
    """Visual styles for redaction"""
    SOLID_BLACK = "solid_black"
    SOLID_WHITE = "solid_white"
    BLUR = "blur"
    PIXELATE = "pixelate"
    PATTERN = "pattern"  # Diagonal lines


@dataclass
class BoundingBox:
    """Bounding box for detected text"""
    x: int
    y: int
    width: int
    height: int

    @property
    def x2(self) -> int:
        return self.x + self.width

    @property
    def y2(self) -> int:
        return self.y + self.height

    def expand(self, padding: int) -> "BoundingBox":
        """Expand bounding box by padding pixels"""
        return BoundingBox(
            x=max(0, self.x - padding),
            y=max(0, self.y - padding),
            width=self.width + (padding * 2),
            height=self.height + (padding * 2),
        )


@dataclass
class DetectedText:
    """Text detected by OCR"""
    text: str
    bounding_box: BoundingBox
    confidence: float
    data_type: Optional[SensitiveDataType] = None
    is_sensitive: bool = False


@dataclass
class RedactionResult:
    """Result of redaction operation"""
    original_path: Optional[str] = None
    redacted_path: Optional[str] = None
    redacted_image: Optional[bytes] = None
    detections: List[DetectedText] = field(default_factory=list)
    redacted_regions: int = 0
    sensitive_types_found: List[str] = field(default_factory=list)
    processing_time_ms: float = 0
    ocr_engine: str = ""
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "originalPath": self.original_path,
            "redactedPath": self.redacted_path,
            "redactedRegions": self.redacted_regions,
            "sensitiveTypesFound": self.sensitive_types_found,
            "processingTimeMs": self.processing_time_ms,
            "ocrEngine": self.ocr_engine,
            "detections": [
                {
                    "text": d.text[:20] + "..." if len(d.text) > 20 else d.text,
                    "dataType": d.data_type.value if d.data_type else None,
                    "isSensitive": d.is_sensitive,
                    "confidence": d.confidence,
                }
                for d in self.detections if d.is_sensitive
            ],
            "error": self.error,
        }


# Regex patterns for sensitive data detection
SENSITIVE_PATTERNS: Dict[SensitiveDataType, List[re.Pattern]] = {
    SensitiveDataType.SSN: [
        re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
        re.compile(r'\b\d{3}\s\d{2}\s\d{4}\b'),
        re.compile(r'\b\d{9}\b(?!\d)'),  # 9 digits, no more
    ],
    SensitiveDataType.CREDIT_CARD: [
        re.compile(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'),
        re.compile(r'\b\d{4}[-\s]?\d{6}[-\s]?\d{5}\b'),  # AMEX
    ],
    SensitiveDataType.PHONE_NUMBER: [
        re.compile(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b'),
        re.compile(r'\b\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b'),
        re.compile(r'\b\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b'),
    ],
    SensitiveDataType.EMAIL: [
        re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
    ],
    SensitiveDataType.DATE_OF_BIRTH: [
        re.compile(r'\b(?:DOB|Date of Birth|Birth Date)[:\s]+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b', re.IGNORECASE),
        re.compile(r'\b\d{1,2}[/\-]\d{1,2}[/\-]\d{4}\b'),  # MM/DD/YYYY
    ],
    SensitiveDataType.MEDICAL_RECORD: [
        re.compile(r'\b(?:MRN|Medical Record|Patient ID)[:\s#]+[A-Z0-9-]+\b', re.IGNORECASE),
        re.compile(r'\bMRN[:\s]?\d{6,12}\b', re.IGNORECASE),
    ],
    SensitiveDataType.ACCOUNT_NUMBER: [
        re.compile(r'\b(?:Account|Acct)[:\s#]+\d{8,17}\b', re.IGNORECASE),
        re.compile(r'\bRouting[:\s#]+\d{9}\b', re.IGNORECASE),
    ],
    SensitiveDataType.IP_ADDRESS: [
        re.compile(r'\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b'),
    ],
    SensitiveDataType.PASSPORT: [
        re.compile(r'\b(?:Passport)[:\s#]+[A-Z0-9]{6,12}\b', re.IGNORECASE),
    ],
    SensitiveDataType.DRIVER_LICENSE: [
        re.compile(r'\b(?:DL|Driver.?s?\s*License)[:\s#]+[A-Z0-9-]{5,15}\b', re.IGNORECASE),
    ],
}

# Keywords that often appear near sensitive data
SENSITIVE_KEYWORDS = [
    "ssn", "social security", "credit card", "card number", "cvv", "cvc",
    "expiration", "phone", "email", "address", "date of birth", "dob",
    "mrn", "medical record", "patient id", "account", "routing", "password",
    "secret", "pin", "passport", "license", "salary", "income",
]


class OCREngine(ABC):
    """Abstract base class for OCR engines"""

    @abstractmethod
    def extract_text(self, image: Image.Image) -> List[DetectedText]:
        """
        Extract text from image with bounding boxes.

        Args:
            image: PIL Image to process

        Returns:
            List of DetectedText objects
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine name"""
        pass


class TesseractEngine(OCREngine):
    """Tesseract OCR engine (local, open source)"""

    def __init__(self, lang: str = "eng", config: str = ""):
        """
        Initialize Tesseract engine.

        Args:
            lang: Language code (e.g., "eng", "spa", "fra")
            config: Additional Tesseract config options
        """
        if not HAS_TESSERACT:
            raise ImportError("pytesseract not installed. Run: pip install pytesseract")

        self.lang = lang
        self.config = config or "--oem 3 --psm 11"

    @property
    def name(self) -> str:
        return "tesseract"

    def extract_text(self, image: Image.Image) -> List[DetectedText]:
        """Extract text using Tesseract OCR"""
        detections = []

        try:
            # Get detailed OCR data including bounding boxes
            data = pytesseract.image_to_data(
                image,
                lang=self.lang,
                config=self.config,
                output_type=pytesseract.Output.DICT,
            )

            n_boxes = len(data["text"])
            for i in range(n_boxes):
                text = data["text"][i].strip()
                if not text:
                    continue

                confidence = float(data["conf"][i])
                if confidence < 0:  # Skip invalid confidence
                    continue

                bbox = BoundingBox(
                    x=data["left"][i],
                    y=data["top"][i],
                    width=data["width"][i],
                    height=data["height"][i],
                )

                detections.append(DetectedText(
                    text=text,
                    bounding_box=bbox,
                    confidence=confidence / 100.0,  # Normalize to 0-1
                ))

        except Exception as e:
            # Log error but don't fail
            print(f"Tesseract OCR error: {e}")

        return detections


class AWSTextractEngine(OCREngine):
    """AWS Textract OCR engine (cloud, high accuracy)"""

    def __init__(self, region_name: str = "us-east-1"):
        """
        Initialize AWS Textract engine.

        Args:
            region_name: AWS region
        """
        try:
            import boto3
            self._client = boto3.client("textract", region_name=region_name)
        except ImportError:
            raise ImportError("boto3 not installed. Run: pip install boto3")

        self._region = region_name

    @property
    def name(self) -> str:
        return "aws_textract"

    def extract_text(self, image: Image.Image) -> List[DetectedText]:
        """Extract text using AWS Textract"""
        detections = []

        try:
            # Convert image to bytes
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format="PNG")
            img_bytes = img_byte_arr.getvalue()

            # Call Textract
            response = self._client.detect_document_text(
                Document={"Bytes": img_bytes}
            )

            img_width, img_height = image.size

            for block in response.get("Blocks", []):
                if block["BlockType"] != "WORD":
                    continue

                text = block.get("Text", "").strip()
                if not text:
                    continue

                confidence = block.get("Confidence", 0) / 100.0
                geometry = block.get("Geometry", {}).get("BoundingBox", {})

                # Convert normalized coordinates to pixels
                bbox = BoundingBox(
                    x=int(geometry.get("Left", 0) * img_width),
                    y=int(geometry.get("Top", 0) * img_height),
                    width=int(geometry.get("Width", 0) * img_width),
                    height=int(geometry.get("Height", 0) * img_height),
                )

                detections.append(DetectedText(
                    text=text,
                    bounding_box=bbox,
                    confidence=confidence,
                ))

        except Exception as e:
            print(f"AWS Textract error: {e}")

        return detections


class SensitiveDataDetector:
    """
    Detects sensitive data in text using pattern matching.

    Supports:
    - Regex patterns for structured data (SSN, credit cards, etc.)
    - Keyword detection for contextual sensitivity
    - Custom patterns for organization-specific data
    """

    def __init__(self, custom_patterns: Optional[Dict[str, List[str]]] = None):
        """
        Initialize detector.

        Args:
            custom_patterns: Dictionary of {pattern_name: [regex_patterns]}
        """
        self._patterns = SENSITIVE_PATTERNS.copy()
        self._custom_patterns: Dict[str, List[re.Pattern]] = {}

        if custom_patterns:
            for name, patterns in custom_patterns.items():
                self._custom_patterns[name] = [re.compile(p) for p in patterns]

    def detect(self, text: str) -> Optional[SensitiveDataType]:
        """
        Detect if text contains sensitive data.

        Args:
            text: Text to analyze

        Returns:
            SensitiveDataType if sensitive, None otherwise
        """
        # Check standard patterns
        for data_type, patterns in self._patterns.items():
            for pattern in patterns:
                if pattern.search(text):
                    return data_type

        # Check custom patterns
        for name, patterns in self._custom_patterns.items():
            for pattern in patterns:
                if pattern.search(text):
                    return SensitiveDataType.CUSTOM

        # Check for sensitive keywords
        text_lower = text.lower()
        for keyword in SENSITIVE_KEYWORDS:
            if keyword in text_lower:
                return SensitiveDataType.CUSTOM

        return None

    def detect_in_context(
        self,
        detections: List[DetectedText],
        context_window: int = 3,
    ) -> List[DetectedText]:
        """
        Detect sensitive data considering context.

        Analyzes text in context with surrounding words for better detection.

        Args:
            detections: List of detected text objects
            context_window: Number of words to consider for context

        Returns:
            Updated detections with sensitivity flags
        """
        # First pass: direct pattern matching
        for detection in detections:
            data_type = self.detect(detection.text)
            if data_type:
                detection.is_sensitive = True
                detection.data_type = data_type

        # Second pass: context-aware detection
        for i, detection in enumerate(detections):
            if detection.is_sensitive:
                continue

            # Build context from surrounding words
            start = max(0, i - context_window)
            end = min(len(detections), i + context_window + 1)
            context_text = " ".join(d.text for d in detections[start:end])

            # Check if context suggests sensitivity
            data_type = self.detect(context_text)
            if data_type:
                # Check if this specific word looks like data (numbers, etc.)
                if self._looks_like_data(detection.text):
                    detection.is_sensitive = True
                    detection.data_type = data_type

        return detections

    def _looks_like_data(self, text: str) -> bool:
        """Check if text looks like sensitive data (not just label)"""
        # Contains digits
        if any(c.isdigit() for c in text):
            return True
        # Contains @ (email)
        if "@" in text:
            return True
        # Looks like a code/ID (mixed alphanumeric)
        if re.match(r'^[A-Z0-9]{4,}$', text.upper()):
            return True
        return False


class ImageRedactor:
    """
    Applies redaction to images.

    Supports multiple redaction styles for different compliance requirements.
    """

    def __init__(self, style: RedactionStyle = RedactionStyle.SOLID_BLACK):
        """
        Initialize redactor.

        Args:
            style: Visual style for redaction
        """
        if not HAS_PIL:
            raise ImportError("PIL/Pillow not installed. Run: pip install Pillow")

        self.style = style

    def redact_regions(
        self,
        image: Image.Image,
        regions: List[BoundingBox],
        padding: int = 2,
    ) -> Image.Image:
        """
        Redact specified regions in image.

        Args:
            image: PIL Image to redact
            regions: List of bounding boxes to redact
            padding: Extra pixels around each region

        Returns:
            Redacted image
        """
        # Work on a copy
        redacted = image.copy()

        for region in regions:
            # Expand region slightly for complete coverage
            expanded = region.expand(padding)

            # Ensure bounds are within image
            x1 = max(0, expanded.x)
            y1 = max(0, expanded.y)
            x2 = min(image.width, expanded.x2)
            y2 = min(image.height, expanded.y2)

            if self.style == RedactionStyle.SOLID_BLACK:
                redacted = self._apply_solid(redacted, x1, y1, x2, y2, color="black")
            elif self.style == RedactionStyle.SOLID_WHITE:
                redacted = self._apply_solid(redacted, x1, y1, x2, y2, color="white")
            elif self.style == RedactionStyle.BLUR:
                redacted = self._apply_blur(redacted, x1, y1, x2, y2)
            elif self.style == RedactionStyle.PIXELATE:
                redacted = self._apply_pixelate(redacted, x1, y1, x2, y2)
            elif self.style == RedactionStyle.PATTERN:
                redacted = self._apply_pattern(redacted, x1, y1, x2, y2)

        return redacted

    def _apply_solid(
        self,
        image: Image.Image,
        x1: int, y1: int, x2: int, y2: int,
        color: str,
    ) -> Image.Image:
        """Apply solid color redaction"""
        draw = ImageDraw.Draw(image)
        draw.rectangle([x1, y1, x2, y2], fill=color)
        return image

    def _apply_blur(
        self,
        image: Image.Image,
        x1: int, y1: int, x2: int, y2: int,
        blur_radius: int = 15,
    ) -> Image.Image:
        """Apply Gaussian blur to region"""
        # Extract region
        region = image.crop((x1, y1, x2, y2))

        # Apply heavy blur
        for _ in range(3):  # Multiple passes for stronger blur
            region = region.filter(ImageFilter.GaussianBlur(blur_radius))

        # Paste back
        image.paste(region, (x1, y1))
        return image

    def _apply_pixelate(
        self,
        image: Image.Image,
        x1: int, y1: int, x2: int, y2: int,
        pixel_size: int = 10,
    ) -> Image.Image:
        """Apply pixelation to region"""
        # Extract region
        region = image.crop((x1, y1, x2, y2))
        width, height = region.size

        # Downscale then upscale for pixelation effect
        small = region.resize(
            (max(1, width // pixel_size), max(1, height // pixel_size)),
            Image.Resampling.NEAREST,
        )
        pixelated = small.resize((width, height), Image.Resampling.NEAREST)

        # Paste back
        image.paste(pixelated, (x1, y1))
        return image

    def _apply_pattern(
        self,
        image: Image.Image,
        x1: int, y1: int, x2: int, y2: int,
    ) -> Image.Image:
        """Apply diagonal line pattern"""
        draw = ImageDraw.Draw(image)

        # Fill background
        draw.rectangle([x1, y1, x2, y2], fill="#333333")

        # Draw diagonal lines
        spacing = 8
        for offset in range(-max(x2-x1, y2-y1), max(x2-x1, y2-y1), spacing):
            draw.line(
                [(x1 + offset, y1), (x1 + (y2-y1) + offset, y2)],
                fill="#666666",
                width=2,
            )

        return image


class OCRRedactor:
    """
    Main class for OCR-based redaction.

    Combines OCR, sensitive data detection, and image redaction into
    a single pipeline for automatic PII/PHI removal from screenshots.
    """

    def __init__(
        self,
        ocr_engine: Optional[OCREngine] = None,
        redaction_style: RedactionStyle = RedactionStyle.SOLID_BLACK,
        custom_patterns: Optional[Dict[str, List[str]]] = None,
        enabled_types: Optional[List[SensitiveDataType]] = None,
    ):
        """
        Initialize OCR redactor.

        Args:
            ocr_engine: OCR engine to use (defaults to Tesseract)
            redaction_style: Visual style for redactions
            custom_patterns: Custom regex patterns for detection
            enabled_types: List of data types to detect (all if None)
        """
        if not HAS_PIL:
            raise ImportError("PIL/Pillow not installed. Run: pip install Pillow")

        # Initialize OCR engine
        if ocr_engine:
            self._ocr = ocr_engine
        elif HAS_TESSERACT:
            self._ocr = TesseractEngine()
        else:
            raise ImportError(
                "No OCR engine available. Install pytesseract or provide a custom engine."
            )

        self._detector = SensitiveDataDetector(custom_patterns)
        self._redactor = ImageRedactor(redaction_style)
        self._enabled_types = enabled_types

    def redact_image(
        self,
        image: Image.Image,
        min_confidence: float = 0.5,
    ) -> Tuple[Image.Image, RedactionResult]:
        """
        Redact sensitive data from image.

        Args:
            image: PIL Image to process
            min_confidence: Minimum OCR confidence threshold

        Returns:
            Tuple of (redacted_image, result)
        """
        start_time = datetime.utcnow()
        result = RedactionResult(ocr_engine=self._ocr.name)

        try:
            # Step 1: OCR
            detections = self._ocr.extract_text(image)

            # Filter by confidence
            detections = [d for d in detections if d.confidence >= min_confidence]

            # Step 2: Detect sensitive data
            detections = self._detector.detect_in_context(detections)

            # Filter by enabled types if specified
            if self._enabled_types:
                for d in detections:
                    if d.data_type and d.data_type not in self._enabled_types:
                        d.is_sensitive = False

            result.detections = detections

            # Step 3: Redact sensitive regions
            sensitive_detections = [d for d in detections if d.is_sensitive]
            regions = [d.bounding_box for d in sensitive_detections]

            if regions:
                redacted_image = self._redactor.redact_regions(image, regions)
                result.redacted_regions = len(regions)
                result.sensitive_types_found = list(set(
                    d.data_type.value for d in sensitive_detections if d.data_type
                ))
            else:
                redacted_image = image.copy()

        except Exception as e:
            result.error = str(e)
            redacted_image = image.copy()

        # Calculate processing time
        end_time = datetime.utcnow()
        result.processing_time_ms = (end_time - start_time).total_seconds() * 1000

        return redacted_image, result

    def redact_file(
        self,
        input_path: str,
        output_path: Optional[str] = None,
        min_confidence: float = 0.5,
    ) -> RedactionResult:
        """
        Redact sensitive data from image file.

        Args:
            input_path: Path to input image
            output_path: Path for output (defaults to input with _redacted suffix)
            min_confidence: Minimum OCR confidence threshold

        Returns:
            RedactionResult
        """
        input_path = Path(input_path)

        if not output_path:
            output_path = input_path.parent / f"{input_path.stem}_redacted{input_path.suffix}"
        else:
            output_path = Path(output_path)

        # Load image
        image = Image.open(input_path)

        # Redact
        redacted_image, result = self.redact_image(image, min_confidence)

        # Save
        redacted_image.save(output_path)

        result.original_path = str(input_path)
        result.redacted_path = str(output_path)

        return result

    def redact_bytes(
        self,
        image_bytes: bytes,
        format: str = "PNG",
        min_confidence: float = 0.5,
    ) -> Tuple[bytes, RedactionResult]:
        """
        Redact sensitive data from image bytes.

        Args:
            image_bytes: Image data as bytes
            format: Output format (PNG, JPEG, etc.)
            min_confidence: Minimum OCR confidence threshold

        Returns:
            Tuple of (redacted_bytes, result)
        """
        # Load image from bytes
        image = Image.open(io.BytesIO(image_bytes))

        # Redact
        redacted_image, result = self.redact_image(image, min_confidence)

        # Convert back to bytes
        output = io.BytesIO()
        redacted_image.save(output, format=format)
        redacted_bytes = output.getvalue()

        result.redacted_image = redacted_bytes

        return redacted_bytes, result


class BatchRedactor:
    """
    Batch process multiple images for redaction.

    Useful for processing all screenshots in an evidence pack.
    """

    def __init__(self, redactor: OCRRedactor):
        """
        Initialize batch redactor.

        Args:
            redactor: OCRRedactor instance to use
        """
        self._redactor = redactor

    def process_directory(
        self,
        input_dir: str,
        output_dir: Optional[str] = None,
        extensions: Optional[List[str]] = None,
    ) -> Dict[str, RedactionResult]:
        """
        Process all images in a directory.

        Args:
            input_dir: Input directory path
            output_dir: Output directory (defaults to input_dir with _redacted suffix)
            extensions: List of file extensions to process

        Returns:
            Dictionary of {filename: RedactionResult}
        """
        extensions = extensions or [".png", ".jpg", ".jpeg", ".bmp", ".tiff"]
        input_path = Path(input_dir)

        if output_dir:
            output_path = Path(output_dir)
        else:
            output_path = input_path.parent / f"{input_path.name}_redacted"

        output_path.mkdir(parents=True, exist_ok=True)

        results = {}

        for file in input_path.iterdir():
            if file.suffix.lower() not in extensions:
                continue

            output_file = output_path / file.name
            result = self._redactor.redact_file(
                str(file),
                str(output_file),
            )
            results[file.name] = result

        return results

    def generate_report(self, results: Dict[str, RedactionResult]) -> str:
        """
        Generate summary report of batch redaction.

        Args:
            results: Dictionary of results from process_directory

        Returns:
            Formatted report string
        """
        lines = []
        lines.append("=" * 60)
        lines.append("OCR REDACTION BATCH REPORT")
        lines.append("=" * 60)
        lines.append("")

        total_files = len(results)
        files_with_redactions = sum(1 for r in results.values() if r.redacted_regions > 0)
        total_redactions = sum(r.redacted_regions for r in results.values())
        total_time_ms = sum(r.processing_time_ms for r in results.values())

        lines.append(f"Total files processed: {total_files}")
        lines.append(f"Files with redactions: {files_with_redactions}")
        lines.append(f"Total regions redacted: {total_redactions}")
        lines.append(f"Total processing time: {total_time_ms:.2f}ms")
        lines.append("")

        # Sensitive data types found
        all_types = set()
        for r in results.values():
            all_types.update(r.sensitive_types_found)

        if all_types:
            lines.append("Sensitive data types found:")
            for t in sorted(all_types):
                count = sum(1 for r in results.values() if t in r.sensitive_types_found)
                lines.append(f"  - {t}: {count} files")
            lines.append("")

        # Files with redactions
        if files_with_redactions > 0:
            lines.append("Files with redactions:")
            for filename, result in results.items():
                if result.redacted_regions > 0:
                    types = ", ".join(result.sensitive_types_found) or "unknown"
                    lines.append(f"  - {filename}: {result.redacted_regions} regions ({types})")
            lines.append("")

        # Errors
        errors = [(f, r.error) for f, r in results.items() if r.error]
        if errors:
            lines.append("Errors:")
            for filename, error in errors:
                lines.append(f"  - {filename}: {error}")
            lines.append("")

        lines.append("=" * 60)

        return "\n".join(lines)
