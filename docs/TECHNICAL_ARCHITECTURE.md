# Skuldbot - Arquitectura Tecnica

## Vision General

Skuldbot es una plataforma RPA (Robotic Process Automation) enterprise compuesta por:

```
┌─────────────────┐
│  Studio Desktop │  ← Editor visual (Tauri + React)
│  (Tauri + React)│
└────────┬────────┘
         │ Genera
         ▼
    ┌─────────┐
    │ DSL JSON│     ← Formato intermedio
    └────┬────┘
         │ Compila
         ▼
┌──────────────────────┐
│       Engine         │  ← Motor compartido (Python)
│  (Robot Framework)   │
└──────────────────────┘
         │ Genera
         ▼
    ┌─────────────┐
    │ Bot Package │   ← .robot + recursos
    └─────────────┘
```

---

## Componentes

### 1. Studio Desktop

**Stack tecnologico:**
- **Tauri** - Framework desktop (Rust backend)
- **React 18** - UI framework
- **Vite** - Build tool
- **React Flow** - Canvas de nodos
- **TailwindCSS** - Estilos
- **shadcn/ui** - Componentes UI
- **Zustand** - State management

**Estructura de archivos:**

```
studio/
├── src/
│   ├── components/
│   │   ├── FlowEditor.tsx      # Canvas principal
│   │   ├── Sidebar.tsx         # Panel de nodos
│   │   ├── Toolbar.tsx         # Barra superior
│   │   ├── NodeConfig.tsx      # Panel de configuracion
│   │   ├── LogsPanel.tsx       # Consola de logs
│   │   ├── EmptyState.tsx      # Estado vacio
│   │   └── ui/                 # Componentes base
│   │
│   ├── store/
│   │   ├── flowStore.ts        # Estado del canvas
│   │   ├── logsStore.ts        # Estado de logs
│   │   └── toastStore.ts       # Notificaciones
│   │
│   ├── data/
│   │   └── nodeTemplates.ts    # Definiciones de nodos
│   │
│   └── index.css               # Estilos globales + tema
│
└── src-tauri/
    └── src/
        └── main.rs             # Comandos Tauri (bridge a Python)
```

### 2. Engine (Python)

**Stack tecnologico:**
- **Robot Framework** - Motor de ejecucion
- **rpaframework** - Librerias RPA (opcional)
- **Pydantic** - Validacion de datos
- **Jinja2** - Templates
- **PyYAML** - Configuracion

**Estructura de archivos:**

```
engine/
├── skuldbot/
│   ├── __init__.py
│   ├── compiler/           # DSL → Robot Framework
│   │   ├── __init__.py
│   │   └── compiler.py
│   │
│   ├── executor/           # Ejecutor de bots
│   │   ├── __init__.py
│   │   └── executor.py
│   │
│   ├── dsl/                # Modelos DSL
│   │   ├── __init__.py
│   │   └── models.py
│   │
│   └── nodes/              # Definiciones de nodos
│       ├── __init__.py
│       └── registry.py
│
├── pyproject.toml          # Configuracion del paquete
└── requirements.txt        # Dependencias
```

---

## Integracion Studio ↔ Engine

### Comandos Tauri (main.rs)

El backend Rust expone 6 comandos que llaman al Engine Python:

| Comando | Descripcion | Input | Output |
|---------|-------------|-------|--------|
| `compile_dsl` | Compila DSL a Robot Framework | DSL JSON | Bot Package path |
| `run_bot` | Ejecuta un bot | Bot path | Resultado + logs |
| `validate_dsl` | Valida estructura DSL | DSL JSON | Errores o OK |
| `save_project` | Guarda proyecto | DSL + path | OK |
| `load_project` | Carga proyecto | Path | DSL JSON |
| `get_engine_info` | Info del engine | - | Version, capabilities |

### Flujo de datos

```
[React UI]
    │
    │ invoke("compile_dsl", { dsl })
    ▼
[Tauri/Rust]
    │
    │ Command::new("python").arg("compile.py")
    ▼
[Python Engine]
    │
    │ DSLCompiler.compile(dsl)
    ▼
[Robot Framework Files]
```

---

## Formato DSL

### Estructura basica

```json
{
  "version": "1.0",
  "bot": {
    "id": "bot-001",
    "name": "Mi Bot",
    "description": "Descripcion del bot"
  },
  "nodes": [
    {
      "id": "node-1",
      "type": "browser.open",
      "config": {
        "url": "https://example.com"
      },
      "position": { "x": 100, "y": 100 },
      "outputs": {
        "success": "node-2",
        "error": "node-error"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "sourceHandle": "success"
    }
  ],
  "variables": {}
}
```

### Tipos de nodos disponibles

| Categoria | Tipo | Descripcion |
|-----------|------|-------------|
| **Triggers** | `trigger.manual` | Inicio manual |
| | `trigger.schedule` | Programado (cron) |
| | `trigger.webhook` | Disparado por HTTP |
| **Browser** | `browser.open` | Abrir navegador |
| | `browser.navigate` | Navegar a URL |
| | `browser.click` | Click en elemento |
| | `browser.fill` | Llenar input |
| | `browser.screenshot` | Captura de pantalla |
| **Data** | `data.read_excel` | Leer Excel |
| | `data.write_excel` | Escribir Excel |
| | `data.json_parse` | Parsear JSON |
| **Flow** | `flow.condition` | Condicional if/else |
| | `flow.loop` | Bucle for/while |
| | `flow.delay` | Esperar N segundos |
| **Notification** | `notification.email` | Enviar email |
| | `notification.slack` | Mensaje a Slack |

---

## Sistema de UI

### Tema de colores (CSS Variables)

```css
:root {
  /* Background - Slate Blue tinted */
  --background: 210 20% 98%;
  --foreground: 215 25% 17%;

  /* Primary - Jade Green (#00A36C) */
  --primary: 156 100% 32%;
  --primary-foreground: 0 0% 100%;

  /* Muted - Soft slate */
  --muted: 210 18% 95%;
  --muted-foreground: 215 15% 50%;

  /* Destructive - Red */
  --destructive: 0 84.2% 60.2%;

  /* Border */
  --border: 214 20% 88%;
}
```

### Componentes UI clave

| Componente | Ubicacion | Proposito |
|------------|-----------|-----------|
| `Button` | `ui/Button.tsx` | Botones con variantes |
| `Input` | `ui/Input.tsx` | Campos de texto |
| `Select` | `ui/select.tsx` | Dropdowns (Radix UI) |
| `Switch` | `ui/switch.tsx` | Toggle boolean |
| `Label` | `ui/label.tsx` | Labels de formulario |

### Z-Index Stack

```
z-[10000]  SelectContent (dropdowns)
z-[9999]   NodeConfig panel
z-50       Popovers, tooltips
z-10       React Flow controls
z-0        Canvas base
```

---

## Estado de la Aplicacion (Zustand)

### flowStore

```typescript
interface FlowStore {
  // Datos
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  botInfo: { name: string; description: string };

  // Acciones
  addNode: (type: string, position: Position) => void;
  updateNode: (id: string, data: Partial<NodeData>) => void;
  deleteNode: (id: string) => void;
  setSelectedNode: (node: Node | null) => void;

  // Compilacion
  generateDSL: () => DSL;
  loadFromDSL: (dsl: DSL) => void;
  compileBot: () => Promise<void>;
  runBot: () => Promise<void>;
}
```

### logsStore

```typescript
interface LogsStore {
  logs: LogEntry[];
  isOpen: boolean;

  addLog: (level: LogLevel, message: string, details?: any) => void;
  clearLogs: () => void;
  togglePanel: () => void;
}

type LogLevel = "debug" | "info" | "warning" | "error" | "success";
```

---

## Seguridad

### Principios

1. **Secrets fuera del DSL**: Las credenciales nunca se guardan en el DSL
2. **Variables de entorno**: Se usan referencias `${vault.api_key}`
3. **Sandbox**: El BotRunner ejecuta en entorno aislado
4. **Validacion**: Todo input se valida con Pydantic

### Archivos sensibles (NO commitear)

```
.env
.env.local
credentials.json
*.pem
*.key
```

---

## Proximos pasos

1. **Orchestrator API** (NestJS) - Gestion centralizada
2. **Orchestrator UI** (Next.js) - Dashboard web
3. **BotRunner** (Python) - Agente de ejecucion remoto
4. **Marketplace** - Nodos custom compartidos
