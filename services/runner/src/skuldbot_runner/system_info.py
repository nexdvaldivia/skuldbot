"""Collect system information about the runner machine."""

import platform
import sys

import psutil

from .models import SystemInfo


def get_system_info() -> SystemInfo:
    """Collect current system information."""
    memory = psutil.virtual_memory()

    return SystemInfo(
        hostname=platform.node(),
        os=platform.system(),
        os_version=platform.release(),
        python_version=sys.version.split()[0],
        cpu_count=psutil.cpu_count() or 1,
        memory_total_mb=int(memory.total / (1024 * 1024)),
        memory_available_mb=int(memory.available / (1024 * 1024)),
    )
