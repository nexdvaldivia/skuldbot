#!/usr/bin/env python3
"""
Build script for compiling SkuldBot Runner to native binary using Nuitka.

This creates a standalone executable that:
- Does not require Python to be installed
- Has all dependencies bundled
- Is protected from reverse engineering
- Works on Windows, macOS, and Linux

Usage:
    python build.py [--debug] [--onefile]

Requirements:
    pip install nuitka ordered-set zstandard

On Windows, also need:
    - Visual Studio Build Tools or MinGW
On macOS:
    - Xcode Command Line Tools
On Linux:
    - gcc, patchelf
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def get_platform_options():
    """Get platform-specific Nuitka options."""
    system = platform.system().lower()
    options = []

    if system == "windows":
        options.extend([
            "--windows-console-mode=disable",  # No console window
            "--windows-icon-from-ico=assets/icon.ico",
            "--windows-company-name=Khipus",
            "--windows-product-name=SkuldBot Runner",
            "--windows-file-version=0.1.0.0",
            "--windows-product-version=0.1.0.0",
            "--windows-file-description=RPA Bot Execution Agent",
        ])
    elif system == "darwin":
        options.extend([
            "--macos-create-app-bundle",
            "--macos-app-icon=assets/icon.icns",
            "--macos-app-name=SkuldBot Runner",
            "--macos-signed-app-name=com.khipus.skuldbot-runner",
            "--macos-app-version=0.1.0",
        ])
    elif system == "linux":
        options.extend([
            "--linux-icon=assets/icon.png",
        ])

    return options


def build(debug: bool = False, onefile: bool = True):
    """Build the runner with Nuitka."""
    print("=" * 60)
    print("Building SkuldBot Runner with Nuitka")
    print("=" * 60)

    # Base directory
    base_dir = Path(__file__).parent
    src_dir = base_dir / "src"
    output_dir = base_dir / "dist"
    assets_dir = base_dir / "assets"

    # Create assets directory if it doesn't exist
    assets_dir.mkdir(exist_ok=True)

    # Clean previous build
    if output_dir.exists():
        print(f"Cleaning {output_dir}...")
        shutil.rmtree(output_dir)

    # Nuitka command
    cmd = [
        sys.executable, "-m", "nuitka",

        # Output settings
        "--output-dir=" + str(output_dir),
        "--output-filename=skuldbot-runner",

        # Standalone mode (includes Python runtime)
        "--standalone",

        # Module inclusion
        "--follow-imports",
        "--include-package=skuldbot_runner",
        "--include-package=robot",
        "--include-package=RPA",
        "--include-package-data=robot",
        "--include-package-data=RPA",

        # Plugin support
        "--enable-plugin=pylint-warnings",

        # Optimization
        "--lto=yes",  # Link-time optimization

        # Protection settings
        "--python-flag=no_site",  # Don't include site-packages pollution
        "--python-flag=no_warnings",  # Suppress warnings
        "--python-flag=no_asserts",  # Remove assert statements

        # Remove debug info for smaller binary
        "--remove-output",

        # Entry point
        str(src_dir / "skuldbot_runner" / "__main__.py"),
    ]

    # Onefile mode (single executable)
    if onefile:
        cmd.append("--onefile")
        cmd.append("--onefile-tempdir-spec=%TEMP%/skuldbot_runner")

    # Debug mode
    if debug:
        cmd.append("--debug")
    else:
        # Production optimizations
        cmd.extend([
            "--disable-console",  # No console output (for GUI app)
        ])

    # Platform-specific options
    cmd.extend(get_platform_options())

    print(f"\nRunning: {' '.join(cmd)}\n")

    # Run Nuitka
    try:
        subprocess.run(cmd, check=True, cwd=base_dir)
        print("\n" + "=" * 60)
        print("BUILD SUCCESSFUL")
        print("=" * 60)
        print(f"\nOutput: {output_dir}")

        # List output files
        if output_dir.exists():
            print("\nGenerated files:")
            for f in output_dir.rglob("*"):
                if f.is_file():
                    size_mb = f.stat().st_size / (1024 * 1024)
                    print(f"  {f.relative_to(output_dir)} ({size_mb:.1f} MB)")

    except subprocess.CalledProcessError as e:
        print(f"\nBuild failed with error code {e.returncode}")
        sys.exit(1)
    except FileNotFoundError:
        print("\nError: Nuitka not found. Install with: pip install nuitka")
        sys.exit(1)


def create_entry_point():
    """Create __main__.py entry point for Nuitka."""
    main_file = Path(__file__).parent / "src" / "skuldbot_runner" / "__main__.py"

    if not main_file.exists():
        main_file.write_text('''"""Entry point for SkuldBot Runner."""

from skuldbot_runner.cli import main

if __name__ == "__main__":
    main()
''')
        print(f"Created {main_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build SkuldBot Runner")
    parser.add_argument("--debug", action="store_true", help="Build with debug info")
    parser.add_argument("--no-onefile", action="store_true", help="Don't create single executable")
    args = parser.parse_args()

    create_entry_point()
    build(debug=args.debug, onefile=not args.no_onefile)
