#!/bin/bash
# Script de instalación para skuldbot-engine

set -e

echo "=========================================="
echo "  Skuldbot Engine - Instalación"
echo "=========================================="
echo ""

# Detectar Python
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "❌ Python no encontrado. Por favor instala Python 3.10+"
    exit 1
fi

echo "✅ Python encontrado: $($PYTHON --version)"

# Verificar versión de Python
PYTHON_VERSION=$($PYTHON -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
REQUIRED_VERSION="3.10"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then 
    echo "⚠️  Python $PYTHON_VERSION detectado. Se recomienda Python 3.10+"
fi

# Crear entorno virtual si no existe
if [ ! -d "venv" ]; then
    echo ""
    echo "📦 Creando entorno virtual..."
    $PYTHON -m venv venv
    echo "✅ Entorno virtual creado"
else
    echo "✅ Entorno virtual ya existe"
fi

# Activar entorno virtual
echo ""
echo "🔧 Activando entorno virtual..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "⬆️  Actualizando pip..."
pip install --upgrade pip

# Instalar dependencias
echo ""
echo "📥 Instalando dependencias..."
pip install -e .

echo ""
echo "✅ ¡Instalación completada!"
echo ""
echo "Para usar skuldbot-engine:"
echo "  1. Activa el entorno virtual:"
echo "     source venv/bin/activate"
echo ""
echo "  2. Prueba el engine:"
echo "     python test_engine_simple.py"
echo ""
echo "  3. Lee la documentación:"
echo "     cat README.md"
echo ""

