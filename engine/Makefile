.PHONY: install test lint format clean help

help:
	@echo "Comandos disponibles:"
	@echo "  make install    - Instalar dependencias"
	@echo "  make test       - Ejecutar tests"
	@echo "  make lint       - Ejecutar linters"
	@echo "  make format     - Formatear código"
	@echo "  make clean      - Limpiar archivos generados"

install:
	pip install -e ".[dev]"

test:
	pytest

test-cov:
	pytest --cov=skuldbot --cov-report=html --cov-report=term

lint:
	ruff check skuldbot tests
	mypy skuldbot

format:
	black skuldbot tests examples
	ruff check skuldbot tests --fix

clean:
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info
	rm -rf .pytest_cache
	rm -rf .coverage
	rm -rf htmlcov/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf output/
	rm -f log.html output.xml report.html

