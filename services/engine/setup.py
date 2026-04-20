"""
Setup configuration for skuldbot-engine
"""

from setuptools import setup, find_packages

setup(
    name="skuldbot-engine",
    packages=find_packages(exclude=["tests", "tests.*", "examples", "examples.*"]),
    package_data={
        "skuldbot.compiler": ["templates/*.j2"],
    },
    include_package_data=True,
)

