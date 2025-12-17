#!/bin/bash
# Script para verificar que todo está listo para ejecutar el Studio

echo "=========================================="
echo "  Skuldbot Studio - Verificación Setup"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo -n "Verificando Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} $NODE_VERSION"
else
    echo -e "${RED}✗ No encontrado${NC}"
    echo "  Instala Node.js desde: https://nodejs.org/"
fi

# Check npm
echo -n "Verificando npm... "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} v$NPM_VERSION"
else
    echo -e "${RED}✗ No encontrado${NC}"
fi

# Check Rust
echo -n "Verificando Rust... "
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version)
    echo -e "${GREEN}✓${NC} $RUST_VERSION"
else
    echo -e "${YELLOW}⚠${NC} No encontrado (necesario para Tauri)"
    echo "  Instala con: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi

# Check Python
echo -n "Verificando Python... "
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓${NC} $PYTHON_VERSION"
else
    echo -e "${RED}✗ No encontrado${NC}"
    echo "  Instala Python 3.10+ desde: https://python.org/"
fi

# Check Engine
echo -n "Verificando Skuldbot Engine... "
if python3 -c "import sys; sys.path.insert(0, '../engine'); from skuldbot import Compiler" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Engine disponible"
else
    echo -e "${YELLOW}⚠${NC} Engine no encontrado o sin dependencias"
    echo "  Instala dependencias:"
    echo "    cd ../engine"
    echo "    pip3 install --user -e ."
fi

# Check node_modules
echo -n "Verificando node_modules... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} Instalado"
else
    echo -e "${YELLOW}⚠${NC} No instalado"
    echo "  Ejecuta: npm install"
fi

# Check Tauri CLI
echo -n "Verificando Tauri CLI... "
if [ -d "node_modules/@tauri-apps/cli" ]; then
    echo -e "${GREEN}✓${NC} Instalado"
else
    echo -e "${YELLOW}⚠${NC} No instalado"
    echo "  Se instalará con: npm install"
fi

echo ""
echo "=========================================="
echo "  Resumen"
echo "=========================================="

# Recommendation
if command -v node &> /dev/null && command -v python3 &> /dev/null; then
    echo -e "${GREEN}✓${NC} Requisitos básicos cumplidos"
    echo ""
    echo "Próximos pasos:"
    echo "  1. npm install (si no está instalado)"
    echo "  2. npm run dev (para web mode)"
    echo "  3. npm run tauri:dev (para Tauri mode con Engine)"
else
    echo -e "${RED}✗${NC} Faltan requisitos básicos"
    echo ""
    echo "Instala primero:"
    echo "  - Node.js 18+"
    echo "  - Python 3.10+"
    echo "  - Rust (para Tauri)"
fi

echo ""


