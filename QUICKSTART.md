# 🚀 Skuldbot - Quick Start

**¿Quieres ver el Studio funcionando en 5 minutos?**

---

## 📋 Pre-requisitos Mínimos

```bash
# Node.js 18+
node --version

# Python 3.10+
python3 --version

# Rust (para Tauri)
rustc --version
```

Si falta algo:
- Node.js: https://nodejs.org/
- Python: https://python.org/
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

---

## ⚡ 3 Pasos Rápidos

### 1️⃣ Setup Engine

```bash
cd engine/
pip3 install --user -e .
```

### 2️⃣ Setup Studio

```bash
cd ../studio/

# Verificar requisitos
./check-setup.sh

# Instalar dependencias
npm install
```

### 3️⃣ Ejecutar

```bash
# Modo Tauri (CON integración Engine) ⭐
npm run tauri:dev

# Primera vez: ~5-10 min (compila Rust)
# Siguientes veces: ~10-20 seg
```

---

## 🎯 ¡Listo! Ahora prueba esto:

### Crear un Bot Simple

1. **Arrastra nodos** desde el sidebar
   - Usa "Log" para empezar

2. **Configura** el nodo
   - Click en el nodo
   - Mensaje: "¡Hola Skuldbot!"

3. **Compila**
   - Click en botón "Compilar"
   - Verás el path del bot generado ✅

4. **Ejecuta**
   - Click en "▶️ Ejecutar"
   - Verás logs reales de ejecución ✅

---

## 🎉 ¡Felicidades!

Acabas de:
- ✅ Crear un bot RPA visualmente
- ✅ Compilarlo a Robot Framework
- ✅ Ejecutarlo con el Engine
- ✅ Ver resultados reales

---

## 🐛 Si algo falla

### Problema: Indicator rojo (Engine no conectado)

```bash
# Verifica Engine
cd engine/
python3 -c "from skuldbot import Compiler; print('✅ OK')"

# Si falla:
pip3 install --user -e .
```

### Problema: Tauri no compila

```bash
# macOS
xcode-select --install

# Verifica Rust
rustc --version
```

### Más ayuda

Ver `studio/TEST_INTEGRATION.md` para troubleshooting completo.

---

## 📚 Siguiente Nivel

Una vez que funciona:

1. **Explora nodos RPA**
   - Browser: open, click, fill, close
   - Excel: open, read, close
   - Control: log, wait, set_variable

2. **Crea flujos complejos**
   - Conecta múltiples nodos
   - Success/error paths

3. **Lee la documentación**
   - `studio/INTEGRATION_GUIDE.md` - Detalles técnicos
   - `studio/README.md` - Features completas
   - `engine/ARCHITECTURE.md` - Cómo funciona

---

## 🎓 Arquitectura Rápida

```
Tu bot visual
    ↓
DSL JSON
    ↓
Engine (Compiler)
    ↓
Robot Framework
    ↓
Ejecución
    ↓
Resultados en UI
```

---

## ⏱️ Tiempos Esperados

| Acción | Primera vez | Siguientes veces |
|--------|-------------|------------------|
| Engine install | ~1 min | - |
| npm install | ~2-3 min | - |
| Tauri first compile | ~5-10 min | ~20 seg |
| Compilar bot | ~2-3 seg | ~2-3 seg |
| Ejecutar bot | ~3-5 seg | ~3-5 seg |

---

## 🆘 Ayuda

1. Ejecuta: `./studio/check-setup.sh`
2. Lee: `studio/TEST_INTEGRATION.md`
3. Revisa logs en la terminal

---

**Total time: ~15-20 minutos (incluyendo instalación)**

¡Disfruta tu editor RPA! 🎉


