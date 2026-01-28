# SkuldBot Studio - Fix: Nodos no se cargan

## 🔍 Diagnóstico

El problema "nodos no se cargan" puede tener 2 causas:

### 1. **Los nodos no aparecen en el Sidebar** (panel izquierdo)
   - **Síntoma**: El panel de nodos está vacío o no muestra las categorías
   - **Causa probable**: Error de compilación o import

### 2. **Los nodos de un bot existente no se cargan en el canvas**
   - **Síntoma**: Al abrir un bot, el canvas está vacío
   - **Causa probable**: localStorage corrupto o problema con la serialización

## ✅ Solución

### Opción 1: Limpiar localStorage (Recomendado)

Abre DevTools en la app (Cmd+Option+I en Mac) y ejecuta en la consola:

\`\`\`javascript
// Limpiar datos de Studio
localStorage.removeItem('skuldbot_discovered_schemas');
localStorage.removeItem('llm-connections');
localStorage.clear();

// Recargar
location.reload();
\`\`\`

### Opción 2: Limpiar y reiniciar

\`\`\`bash
cd studio

# Limpiar cache de Vite y Tauri
rm -rf node_modules/.vite
rm -rf src-tauri/target/debug

# Reiniciar
npm run tauri dev
\`\`\`

### Opción 3: Verificar si es problema de compilación

\`\`\`bash
# Verificar errores de TypeScript
npx tsc --noEmit

# Verificar errores de Rust
cd src-tauri && cargo check
\`\`\`

## 🔍 Verificación de Integridad

Mis cambios NO afectaron:
- ❌ `nodeTemplates.ts` - No lo toqué
- ❌ `UnifiedSidebar.tsx` - No lo modifiqué  
- ❌ `BotEditor.tsx` - No lo modifiqué
- ❌ `FlowEditor.tsx` - No lo modifiqué
- ❌ `projectStore.ts` - No lo modifiqué
- ❌ `flowStore.ts` - No lo modifiqué

✅ Solo modifiqué:
- AI Planner components (`v2/ConnectionsPanel.tsx`, `ConnectionDialog.tsx`)
- Stores de conexiones (`connectionsStore.ts`)
- Tipos de AI Planner (`ai-planner.ts`)
- Backend Rust para AI Planner (`ai_planner/` módulo)

## 🎯 Siguiente Paso

Por favor dime exactamente qué ves:
1. ¿El sidebar de nodos (izquierda) está vacío? O
2. ¿Al abrir un bot existente, el canvas no muestra los nodos que había antes?

Esto me ayudará a darte la solución exacta.

