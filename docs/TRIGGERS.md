# Sistema de Triggers - Documentacion Tecnica

## Vision General

Los **Triggers** son nodos especiales que inician la ejecucion de un bot. A diferencia de los nodos regulares, los triggers:

1. No tienen punto de entrada (solo salidas success/error)
2. Se identifican visualmente con badge "START" y borde verde
3. Pueden ser multiples por flujo (ej: schedule + webhook)
4. Si no hay trigger definido, se auto-agrega Manual Trigger

---

## Arquitectura

### Componentes Involucrados

```
┌─────────────────────────────────────────────────────────────────────┐
│                           STUDIO                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ nodeTemplates│    │  CustomNode  │    │    NodeConfig        │  │
│  │    .ts       │───▶│    .tsx      │    │       .tsx           │  │
│  │              │    │              │    │                      │  │
│  │ trigger.form │    │ isTrigger    │    │ FormBuilder          │  │
│  │ trigger.*    │    │ START badge  │    │ FormPreview          │  │
│  └──────────────┘    │ no input     │    └──────────────────────┘  │
│                      └──────────────┘                               │
│                              │                                       │
│                              ▼                                       │
│                      ┌──────────────┐                               │
│                      │  flowStore   │                               │
│                      │    .ts       │                               │
│                      │              │                               │
│                      │ generateDSL  │──────┐                        │
│                      │ triggers[]   │      │                        │
│                      └──────────────┘      │                        │
└────────────────────────────────────────────│────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           ENGINE                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   registry   │    │  SkuldForms  │    │     Compiler         │  │
│  │     .py      │    │    .py       │    │       .py            │  │
│  │              │    │              │    │                      │  │
│  │ 12 triggers  │    │ validate     │    │ Generate .robot      │  │
│  │ registered   │    │ generate HTML│    │ for triggers         │  │
│  └──────────────┘    │ process sub  │    └──────────────────────┘  │
│                      └──────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ Form Service │    │  Scheduler   │    │   Webhook Handler    │  │
│  │              │    │              │    │                      │  │
│  │ GET /forms/  │    │ Cron jobs    │    │ POST /webhooks/      │  │
│  │ POST submit  │    │ Queue jobs   │    │                      │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Triggers Disponibles (12 tipos)

### Basicos

| Tipo | DSL Type | Categoria | Descripcion |
|------|----------|-----------|-------------|
| Manual | `trigger.manual` | trigger | Ejecucion manual via UI/CLI |
| Schedule | `trigger.schedule` | trigger | Cron expression |
| Webhook | `trigger.webhook` | trigger | HTTP endpoint |

### Eventos de Sistema

| Tipo | DSL Type | Categoria | Descripcion |
|------|----------|-----------|-------------|
| File Watch | `trigger.file_watch` | trigger | Cambios en filesystem |
| Email Received | `trigger.email_received` | trigger | IMAP/POP3 polling |
| Queue | `trigger.queue` | trigger | Message queue consumer |

### Integraciones

| Tipo | DSL Type | Categoria | Descripcion |
|------|----------|-----------|-------------|
| **Form** | `trigger.form` | trigger | Formulario web |
| API Polling | `trigger.api_polling` | trigger | HTTP polling periodico |
| Database Change | `trigger.database_change` | trigger | CDC (Change Data Capture) |
| Storage Event | `trigger.storage_event` | trigger | S3/MinIO events |
| Message Bus | `trigger.message_bus` | trigger | Kafka/RabbitMQ/Redis |
| Chat | `trigger.chat` | trigger | Slack/Teams/Telegram |

---

## Implementacion en Studio

### 1. Node Templates (`nodeTemplates.ts`)

```typescript
// Categoria trigger
{
  type: "trigger.form",
  label: "Form Trigger",
  category: "trigger",
  icon: "FileText",
  description: "Start workflow when a web form is submitted",
  defaultConfig: {
    formTitle: "New Form",
    formDescription: "",
    fields: [],
    submitButtonLabel: "Submit",
    requireAuth: false,
  },
  configSchema: [
    { name: "formTitle", label: "Form Title", type: "text", required: true },
    { name: "formDescription", label: "Description", type: "textarea" },
    { name: "fields", label: "Form Fields", type: "form-builder" }, // Tipo especial
    { name: "submitButtonLabel", label: "Submit Button", type: "text" },
    { name: "requireAuth", label: "Require Auth", type: "boolean" },
  ],
}
```

### 2. CustomNode (`CustomNode.tsx`)

```typescript
function CustomNode({ data, selected }: NodeProps<FlowNodeData>) {
  const isTrigger = data.category === "trigger";

  return (
    <div className={`... ${isTrigger ? "ring-2 ring-emerald-300" : ""}`}>
      {/* Badge START solo para triggers */}
      {isTrigger && (
        <div className="absolute -top-2.5 left-3 bg-emerald-500 text-white ...">
          Start
        </div>
      )}

      {/* Handle de entrada NO mostrado para triggers */}
      {!isTrigger && (
        <Handle type="target" position={Position.Left} ... />
      )}

      {/* Handles de salida siempre visibles */}
      <Handle type="source" id="success" ... />
      <Handle type="source" id="error" ... />
    </div>
  );
}
```

### 3. Flow Store (`flowStore.ts`)

```typescript
generateDSL: () => {
  // Extraer IDs de todos los triggers
  const triggerNodes = state.nodes.filter(
    (node) => node.data.category === "trigger"
  );
  const triggerIds = triggerNodes.map((node) => node.id);

  const dsl: BotDSL = {
    version: "1.0",
    bot: state.botInfo,
    nodes: dslNodes,
    triggers: triggerIds.length > 0 ? triggerIds : undefined,
    start_node: state.nodes[0]?.id, // Deprecated
  };

  return dsl;
},

compileBot: async () => {
  // Auto-agregar Manual si no hay triggers
  if (!hasTrigger) {
    const manualTriggerNode = {
      id: `trigger-manual-${Date.now()}`,
      type: "trigger.manual",
      config: {},
      outputs: { success: firstNodeId, error: firstNodeId },
      label: "Manual Trigger",
    };
    dsl.nodes.unshift(manualTriggerNode);
    dsl.triggers = [manualTriggerNode.id];
  }
}
```

---

## Form Trigger - Detalle

### Tipo de Campo Especial: `form-builder`

En `flow.ts`:

```typescript
export interface ConfigField {
  type: "text" | "number" | "boolean" | "select" | "textarea" | "password" | "form-builder";
  // ...
}

export interface FormFieldDefinition {
  id: string;
  type: "text" | "email" | "number" | "date" | "dropdown" | "checkbox" | "file" | "textarea";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[]; // Para dropdown
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}
```

### FormBuilder Component

Ubicacion: `studio/src/components/FormBuilder.tsx`

Funcionalidades:
- Agregar campos con boton "+ Add Field"
- Expandir/colapsar configuracion de cada campo
- Reordenar con botones ↑↓
- Eliminar campos
- 8 tipos de campo soportados

### FormPreview Component

Ubicacion: `studio/src/components/FormPreview.tsx`

Funcionalidades:
- Ventana flotante modal
- Renderizado en tiempo real del formulario
- Interaccion funcional (llenar y enviar)
- Maximizar/minimizar
- Los datos se loguean en consola

### Integracion en NodeConfig

```typescript
// NodeConfig.tsx
const isFormTrigger = node.data.nodeType === "trigger.form";

// Boton de preview en header
{isFormTrigger && (
  <Button onClick={() => setShowFormPreview(true)}>
    <Eye />
  </Button>
)}

// Componente FormPreview
{isFormTrigger && (
  <FormPreview
    isOpen={showFormPreview}
    onClose={() => setShowFormPreview(false)}
    formConfig={{
      title: node.data.config.formTitle,
      description: node.data.config.formDescription,
      fields: node.data.config.fields,
      submitButtonLabel: node.data.config.submitButtonLabel,
    }}
  />
)}
```

---

## Implementacion en Engine

### Registry (`registry.py`)

```python
# 12 triggers registrados
NODE_REGISTRY = {
    # ... otros nodos ...

    # TRIGGERS (12)
    "trigger.manual": {
        "library": "BuiltIn",
        "keyword": "Log",
        "args": ["message"]
    },
    "trigger.form": {
        "library": "SkuldForms",
        "keyword": "Process Form Submission",
        "args": ["form_definition", "submitted_data"]
    },
    # ... mas triggers ...
}
```

### SkuldForms Library (`libs/forms.py`)

```python
@library(scope="GLOBAL", version="1.0.0")
class SkuldForms:
    """Robot Framework library for Form Trigger functionality."""

    @keyword("Create Form Definition")
    def create_form_definition(self, title: str, ...) -> Dict[str, Any]:
        """Crea definicion de formulario."""

    @keyword("Add Form Field")
    def add_form_field(self, form_def: Dict, field_type: str, ...) -> Dict:
        """Agrega campo al formulario."""

    @keyword("Validate Form Data")
    def validate_form_data(self, form_def: Dict, data: Dict) -> Dict:
        """Valida datos contra definicion."""

    @keyword("Process Form Submission")
    def process_form_submission(self, form_def: Dict, data: Dict) -> Dict:
        """Procesa envio del formulario."""

    @keyword("Generate Form HTML")
    def generate_form_html(self, form_def: Dict, ...) -> str:
        """Genera HTML del formulario."""
```

---

## DSL Schema

### BotDSL con Triggers

```typescript
interface BotDSL {
  version: string;
  bot: {
    id: string;
    name: string;
    description?: string;
  };
  nodes: DSLNode[];
  variables?: Record<string, VariableDefinition>;
  triggers?: string[];    // IDs de nodos trigger
  start_node?: string;    // Deprecated, usar triggers[]
}
```

### Ejemplo DSL con Form Trigger

```json
{
  "version": "1.0",
  "bot": {
    "id": "bot-vacaciones",
    "name": "Solicitud de Vacaciones",
    "description": "Procesa solicitudes de vacaciones"
  },
  "triggers": ["trigger-form-001"],
  "nodes": [
    {
      "id": "trigger-form-001",
      "type": "trigger.form",
      "config": {
        "formTitle": "Solicitud de Vacaciones",
        "formDescription": "Complete el formulario para solicitar vacaciones",
        "fields": [
          {
            "id": "nombre",
            "type": "text",
            "label": "Nombre Completo",
            "required": true
          },
          {
            "id": "fecha_inicio",
            "type": "date",
            "label": "Fecha de Inicio",
            "required": true
          },
          {
            "id": "fecha_fin",
            "type": "date",
            "label": "Fecha de Fin",
            "required": true
          },
          {
            "id": "motivo",
            "type": "textarea",
            "label": "Motivo",
            "required": false
          }
        ],
        "submitButtonLabel": "Enviar Solicitud"
      },
      "outputs": {
        "success": "node-validate",
        "error": "node-error"
      },
      "label": "Form: Vacaciones"
    },
    {
      "id": "node-validate",
      "type": "control.condition",
      "config": {
        "expression": "${fecha_fin} > ${fecha_inicio}"
      },
      "outputs": {
        "success": "node-email",
        "error": "node-error"
      }
    }
  ]
}
```

---

## Testing

### Form Server (Mock)

Ubicacion: `engine/tools/form_server.py`

```bash
# Iniciar servidor de pruebas
cd engine
python tools/form_server.py --port 8080

# Endpoints disponibles:
# GET  /                  - Lista de formularios
# GET  /forms/:id         - Formulario HTML
# POST /forms/:id/submit  - Procesar envio
# GET  /api/forms/:id     - Definicion JSON
# GET  /submissions       - Ver envios
```

### Uso

```bash
# Con configuracion por defecto
python tools/form_server.py

# Con puerto personalizado
python tools/form_server.py --port 3000

# Con configuracion de formulario custom
python tools/form_server.py --form-config mi_form.json
```

---

## Estilos y Colores

### Design Tokens para Triggers

```typescript
// design-tokens.ts
trigger: {
  bg: "bg-emerald-50",
  border: "border-emerald-200",
  icon: "text-emerald-600",
  accent: "bg-emerald-500",
}
```

### CSS Classes

| Elemento | Clase |
|----------|-------|
| Badge START | `bg-emerald-500 text-white text-[10px] font-bold` |
| Borde trigger | `ring-2 ring-emerald-300` |
| Icono container | `bg-emerald-50 text-emerald-500` |
| Handle success | `bg-emerald-500` |
| Handle error | `bg-orange-500` |

---

## Roadmap

### Implementado

- [x] 12 tipos de trigger en nodeTemplates
- [x] Visual distintivo (badge START, sin input handle)
- [x] FormBuilder component
- [x] FormPreview component
- [x] SkuldForms library
- [x] Auto-add Manual Trigger
- [x] Multiple triggers support
- [x] Form Server mock para testing
- [x] Documentacion usuario y tecnica

### Pendiente (Orchestrator)

- [ ] Form Service endpoints
- [ ] URL generation on publish
- [ ] Form submission storage
- [ ] Webhook handler
- [ ] Schedule cron service
- [ ] Queue consumer
- [ ] CDC listener

---

## Referencias

- [n8n Form Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/)
- [Documentacion Orchestrator](./ORCHESTRATOR.md)
- [User Guide](./USER_GUIDE.md)
