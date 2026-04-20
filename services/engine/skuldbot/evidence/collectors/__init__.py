"""
Evidence Collectors

Specialized collectors for different types of evidence.
All collectors automatically redact PII/PHI.
"""

from skuldbot.evidence.collectors.screenshot import ScreenshotCollector
from skuldbot.evidence.collectors.lineage import LineageCollector
from skuldbot.evidence.collectors.decision import DecisionCollector

__all__ = [
    "ScreenshotCollector",
    "LineageCollector",
    "DecisionCollector",
]
