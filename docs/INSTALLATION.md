# Skuldbot - Guia de Instalacion

## Requisitos del Sistema

### macOS

| Componente | Version Minima | Notas |
|------------|----------------|-------|
| macOS | 11.0 (Big Sur) | Apple Silicon o Intel |
| Node.js | 18.x | LTS recomendado |
| Python | 3.10+ | 3.11 o 3.12 recomendado |
| Rust | 1.70+ | Para compilar Tauri |
| Xcode | 14+ | **Completo** (no solo Command Line Tools) |

### Windows

| Componente | Version Minima | Notas |
|------------|----------------|-------|
| Windows | 10/11 | 64-bit |
| Node.js | 18.x | LTS recomendado |
| Python | 3.10+ | Agregar a PATH |
| Rust | 1.70+ | Con MSVC toolchain |
| WebView2 | Latest | Incluido en Windows 11 |

---

## Instalacion Paso a Paso

### 1. Clonar el Repositorio

```bash
git clone https://github.com/khipus/skuldbot.git
cd skuldbot
```

### 2. Instalar Xcode (macOS)

**Importante**: El Engine requiere Xcode completo para compilar dependencias nativas.

1. Abrir **App Store**
2. Buscar "Xcode"
3. Click en "Obtener" (descarga ~12GB)
4. Esperar la instalacion

Despues de instalar:

```bash
# Aceptar licencia
sudo xcodebuild -license accept

# Configurar Xcode como developer directory
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Verificar
xcode-select -p
# Debe mostrar: /Applications/Xcode.app/Contents/Developer
```

### 3. Configurar el Engine (Python)

```bash
cd engine

# Crear entorno virtual
python3 -m venv .venv

# Activar entorno
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

# Instalar dependencias base
pip install -e .

# Instalar RPA Framework (requiere Xcode en macOS)
pip install -e ".[rpa]"
```

#### Verificar instalacion del Engine

```bash
source .venv/bin/activate
python -c "from skuldbot import compiler, executor; print('Engine OK')"
```

### 4. Configurar el Studio (React + Tauri)

```bash
cd ../studio

# Instalar dependencias de Node
npm install

# Ejecutar en modo desarrollo
npm run tauri dev
```

#### Solo Frontend (sin Tauri)

```bash
npm run dev
# Abre http://localhost:1420
```

---

## Dependencias del Engine

### Dependencias Base (siempre instaladas)

| Paquete | Version | Proposito |
|---------|---------|-----------|
| robotframework | >=6.1.0 | Motor de ejecucion |
| pydantic | >=2.0.0 | Validacion de datos |
| pyyaml | >=6.0 | Configuracion YAML |
| jinja2 | >=3.1.0 | Templates para compilacion |

### Dependencias RPA (opcionales)

| Paquete | Version | Proposito |
|---------|---------|-----------|
| rpaframework | >=27.0.0 | Framework RPA completo |

El paquete `rpaframework` incluye:

- **Automatizacion Web**: Playwright, Selenium
- **Automatizacion Desktop**: Control de aplicaciones nativas
- **Archivos**: Excel, PDF, Word, CSV
- **Email**: IMAP, SMTP, Exchange
- **APIs**: HTTP requests, JSON, XML
- **Cloud**: AWS, Azure, Google Cloud

---

## Problemas Comunes

### Error: "xcodebuild requires Xcode"

**Causa**: Solo tienes Command Line Tools, no Xcode completo.

**Solucion**:
1. Instalar Xcode desde App Store
2. Ejecutar: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

### Error: "externally-managed-environment"

**Causa**: Python de Homebrew no permite pip install global.

**Solucion**: Usar entorno virtual (ya incluido en las instrucciones)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Error: "Port 1420 is already in use"

**Causa**: Ya hay una instancia del Studio corriendo.

**Solucion**:
```bash
# Encontrar y matar el proceso
lsof -i :1420
kill -9 <PID>
```

### Error: "ModuleNotFoundError: No module named 'skuldbot'"

**Causa**: Engine no esta instalado en modo editable.

**Solucion**:
```bash
cd engine
source .venv/bin/activate
pip install -e .
```

---

## Estructura del Proyecto

```
skuldbot/
├── engine/           # Motor Python (Robot Framework)
│   ├── skuldbot/     # Codigo fuente
│   ├── .venv/        # Entorno virtual (creado por ti)
│   └── pyproject.toml
│
├── studio/           # Editor visual (Tauri + React)
│   ├── src/          # Frontend React
│   ├── src-tauri/    # Backend Rust
│   └── package.json
│
├── docs/             # Documentacion
│
└── CLAUDE.md         # Especificacion del proyecto
```

---

## Verificacion Final

### 1. Engine funcionando

```bash
cd engine
source .venv/bin/activate
python -c "
from skuldbot import compiler, executor
print('Compiler:', compiler)
print('Executor:', executor)
print('Engine OK!')
"
```

### 2. Studio funcionando

```bash
cd studio
npm run tauri dev
```

Debe abrir una ventana de aplicacion con:
- Sidebar izquierdo con nodos
- Canvas central (React Flow)
- Toolbar superior
- Consola inferior

---

## Siguiente Paso

Ver [USER_GUIDE.md](./USER_GUIDE.md) para aprender a usar el Studio.
