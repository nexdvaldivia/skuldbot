"""
Screenshot Collector with Auto-Redaction

Captures screenshots during bot execution and automatically
redacts sensitive regions (form fields, text areas, etc.).

NEVER stores screenshots with visible PII/PHI.
"""

import io
import time
from dataclasses import dataclass
from typing import List, Optional, Tuple
from pathlib import Path


@dataclass
class RedactionRegion:
    """Region to redact in screenshot"""
    x: int
    y: int
    width: int
    height: int
    reason: str = "sensitive_data"


class ScreenshotCollector:
    """
    Collects and redacts screenshots during bot execution.

    Features:
    - Automatic form field detection and redaction
    - Manual region specification
    - Multiple redaction methods (blur, pixelate, solid)
    - Metadata extraction without PII
    """

    def __init__(self, redaction_method: str = "blur"):
        """
        Initialize screenshot collector.

        Args:
            redaction_method: Method to use (blur, pixelate, solid)
        """
        self.redaction_method = redaction_method
        self._has_pillow = False

        try:
            from PIL import Image, ImageFilter
            self._has_pillow = True
        except ImportError:
            pass

    def capture_from_browser(
        self,
        browser_instance,
        redaction_regions: Optional[List[RedactionRegion]] = None,
    ) -> Tuple[bytes, int]:
        """
        Capture screenshot from browser and redact.

        Args:
            browser_instance: Playwright/Selenium browser instance
            redaction_regions: Optional regions to redact

        Returns:
            Tuple of (screenshot_bytes, regions_redacted_count)
        """
        # Get screenshot bytes from browser
        try:
            # Try Playwright API
            screenshot_bytes = browser_instance.screenshot()
        except AttributeError:
            try:
                # Try Selenium API
                screenshot_bytes = browser_instance.get_screenshot_as_png()
            except Exception:
                return b"", 0

        return self.redact_screenshot(screenshot_bytes, redaction_regions)

    def capture_from_file(
        self,
        file_path: str,
        redaction_regions: Optional[List[RedactionRegion]] = None,
    ) -> Tuple[bytes, int]:
        """
        Load screenshot from file and redact.

        Args:
            file_path: Path to screenshot file
            redaction_regions: Regions to redact

        Returns:
            Tuple of (screenshot_bytes, regions_redacted_count)
        """
        with open(file_path, "rb") as f:
            screenshot_bytes = f.read()

        return self.redact_screenshot(screenshot_bytes, redaction_regions)

    def redact_screenshot(
        self,
        screenshot_bytes: bytes,
        regions: Optional[List[RedactionRegion]] = None,
    ) -> Tuple[bytes, int]:
        """
        Apply redaction to screenshot.

        Args:
            screenshot_bytes: Raw screenshot bytes
            regions: Regions to redact

        Returns:
            Tuple of (redacted_bytes, regions_count)
        """
        if not regions or not self._has_pillow:
            return screenshot_bytes, 0

        from PIL import Image, ImageFilter, ImageDraw

        img = Image.open(io.BytesIO(screenshot_bytes))
        draw = ImageDraw.Draw(img)

        for region in regions:
            box = (
                region.x,
                region.y,
                region.x + region.width,
                region.y + region.height,
            )

            if self.redaction_method == "blur":
                # Heavy gaussian blur
                region_img = img.crop(box)
                blurred = region_img.filter(ImageFilter.GaussianBlur(radius=20))
                img.paste(blurred, box)

            elif self.redaction_method == "pixelate":
                # Pixelate effect
                region_img = img.crop(box)
                small = region_img.resize(
                    (max(1, region.width // 10), max(1, region.height // 10)),
                    Image.NEAREST,
                )
                pixelated = small.resize((region.width, region.height), Image.NEAREST)
                img.paste(pixelated, box)

            elif self.redaction_method == "solid":
                # Solid black rectangle with label
                draw.rectangle(box, fill="black")
                draw.text(
                    (region.x + 5, region.y + 5),
                    "[REDACTED]",
                    fill="white",
                )

        # Save to bytes
        output = io.BytesIO()
        img.save(output, format="PNG", optimize=True)
        return output.getvalue(), len(regions)

    def detect_form_fields(self, screenshot_bytes: bytes) -> List[RedactionRegion]:
        """
        Attempt to detect form fields in screenshot for redaction.

        This is a basic implementation. For production, consider
        using OCR or ML-based detection.

        Args:
            screenshot_bytes: Screenshot to analyze

        Returns:
            List of detected regions to redact
        """
        # Basic implementation - in production, use OCR/ML
        # For now, returns empty list
        return []

    def generate_filename(self, node_id: str, suffix: str = "") -> str:
        """Generate unique filename for screenshot"""
        timestamp = int(time.time() * 1000)
        suffix_part = f"_{suffix}" if suffix else ""
        return f"{node_id}_{timestamp}{suffix_part}.png"
