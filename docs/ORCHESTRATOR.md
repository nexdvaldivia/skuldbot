# Orchestrator - Especificación Técnica

## Visión General

El Orchestrator es el componente backend centralizado que gestiona:
- Almacenamiento y versionado de bots
- Scheduling y dispatching de ejecuciones
- Gestión de usuarios y permisos
- Logs y métricas
- **Publicación y servicio de Form Triggers**

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator                              │
├──────────────────────────┬──────────────────────────────────┤
│         API              │              UI                   │
│       (NestJS)           │           (Next.js)               │
├──────────────────────────┴──────────────────────────────────┤
│                        Services                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   Bots   │ │   Jobs   │ │  Users   │ │ Form Service │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                       Storage                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  PostgreSQL  │  │   S3/MinIO   │  │  Redis (Cache)   │  │
│  │  (metadata)  │  │  (packages)  │  │  (sessions)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Tecnologías

| Componente | Tecnología |
|------------|------------|
| API | NestJS (TypeScript) |
| UI | Next.js |
| Base de datos | PostgreSQL |
| Storage | S3-compatible (MinIO, AWS S3) |
| Cache | Redis |
| Autenticación | JWT + Refresh tokens |

---

## Form Trigger Service

### Descripción

El **Form Trigger** permite iniciar workflows mediante formularios web públicos (estilo n8n). Cuando un usuario diseña un bot con un nodo `trigger.form` en el Studio, el Orchestrator debe:

1. Almacenar la definición del formulario
2. Generar una URL pública para el formulario
3. Servir el HTML del formulario
4. Procesar submissions y ejecutar el bot

### Flujo de Publicación

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Studio    │────▶│   Orchestrator   │────▶│  Form Service   │
│  (Upload)   │     │    (Compile)     │     │  (Publish URL)  │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │  Public URL     │
                                             │  /forms/:id     │
                                             └─────────────────┘
```

### Endpoints Requeridos

#### 1. Obtener Formulario

```
GET /api/forms/:formId
```

**Response:**
```json
{
  "formId": "form-abc123",
  "botId": "bot-xyz",
  "title": "Solicitud de Reembolso",
  "description": "Complete este formulario para iniciar su solicitud",
  "fields": [
    {
      "id": "field-1",
      "type": "text",
      "label": "Nombre completo",
      "required": true,
      "placeholder": "Juan Pérez"
    },
    {
      "id": "field-2",
      "type": "email",
      "label": "Email",
      "required": true
    },
    {
      "id": "field-3",
      "type": "number",
      "label": "Monto",
      "required": true,
      "validation": {
        "min": 1,
        "max": 10000
      }
    },
    {
      "id": "field-4",
      "type": "file",
      "label": "Comprobante",
      "required": false
    }
  ],
  "submitButtonLabel": "Enviar Solicitud",
  "successMessage": "Su solicitud ha sido recibida",
  "requireAuth": false
}
```

#### 2. Servir Formulario HTML

```
GET /forms/:formId
```

Retorna HTML renderizado del formulario, usando:
- El engine `SkuldForms.Generate Form HTML` para generar el HTML
- CSS framework configurable (Tailwind, Bootstrap, etc.)
- Validación client-side
- CSRF protection

**Ejemplo de HTML generado:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Solicitud de Reembolso</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
  <form action="/api/forms/form-abc123/submit" method="POST"
        class="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
    <h1 class="text-2xl font-bold mb-4">Solicitud de Reembolso</h1>
    <p class="text-gray-600 mb-6">Complete este formulario...</p>

    <div class="mb-4">
      <label class="block text-sm font-medium mb-1">
        Nombre completo <span class="text-red-500">*</span>
      </label>
      <input type="text" name="field-1" required
             class="w-full border rounded px-3 py-2">
    </div>

    <!-- Más campos... -->

    <button type="submit"
            class="w-full bg-emerald-500 text-white py-2 rounded hover:bg-emerald-600">
      Enviar Solicitud
    </button>
  </form>
</body>
</html>
```

#### 3. Procesar Submission

```
POST /api/forms/:formId/submit
Content-Type: application/json (o multipart/form-data para archivos)
```

**Request Body:**
```json
{
  "field-1": "Juan Pérez",
  "field-2": "juan@example.com",
  "field-3": 500,
  "field-4": null
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Su solicitud ha sido recibida",
  "jobId": "job-123456",
  "trackingUrl": "/jobs/job-123456/status"
}
```

**Response (Validation Error):**
```json
{
  "success": false,
  "errors": [
    {
      "field": "field-2",
      "message": "Email inválido"
    }
  ]
}
```

#### 4. Estado del Job

```
GET /api/jobs/:jobId/status
```

**Response:**
```json
{
  "jobId": "job-123456",
  "status": "running",
  "progress": 45,
  "startedAt": "2025-12-17T10:30:00Z",
  "logs": [
    {"level": "info", "message": "Procesando solicitud...", "timestamp": "..."}
  ]
}
```

### Base de Datos

#### Tabla: `forms`

```sql
CREATE TABLE forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id),
  node_id VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  fields JSONB NOT NULL,
  submit_button_label VARCHAR(100) DEFAULT 'Submit',
  success_message TEXT,
  require_auth BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_forms_bot_id ON forms(bot_id);
CREATE INDEX idx_forms_is_active ON forms(is_active);
```

#### Tabla: `form_submissions`

```sql
CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id),
  job_id UUID REFERENCES jobs(id),
  data JSONB NOT NULL,
  files JSONB,
  ip_address INET,
  user_agent TEXT,
  submitted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_submissions_form_id ON form_submissions(form_id);
CREATE INDEX idx_submissions_submitted_at ON form_submissions(submitted_at);
```

### Integración con SkuldForms

El Orchestrator debe usar la librería `SkuldForms` del engine para:

```python
from skuldbot.libs.forms import SkuldForms

forms = SkuldForms()

# Validar datos del formulario
result = forms.validate_form_data(form_definition, submitted_data)
if not result["valid"]:
    return {"success": False, "errors": result["errors"]}

# Generar HTML (para servir el formulario)
html = forms.generate_form_html(form_definition, css_framework="tailwind")

# Procesar submission (datos para el bot)
processed_data = forms.process_form_submission(form_definition, submitted_data)
```

### Consideraciones de Seguridad

1. **CSRF Protection**: Usar tokens CSRF en formularios
2. **Rate Limiting**: Limitar submissions por IP (ej: 10/min)
3. **File Upload**:
   - Validar tipos de archivo permitidos
   - Límite de tamaño (configurable, default 10MB)
   - Escaneo de malware (opcional)
4. **Sanitización**: Escapar inputs para prevenir XSS
5. **Autenticación opcional**: Si `requireAuth: true`, requerir login

### Configuración

Variables de entorno:

```env
# Form Service
FORMS_BASE_URL=https://forms.skuldbot.com
FORMS_MAX_FILE_SIZE=10485760
FORMS_ALLOWED_FILE_TYPES=pdf,jpg,png,docx,xlsx
FORMS_RATE_LIMIT_PER_MINUTE=10
FORMS_CSRF_SECRET=your-secret-key

# Storage para archivos
FORMS_STORAGE_BUCKET=skuldbot-forms
```

### URL Generation

Cuando se publica un bot con Form Trigger:

```typescript
// Al compilar/publicar bot
const formId = generateFormId(botId, nodeId);
const publicUrl = `${FORMS_BASE_URL}/forms/${formId}`;

// Guardar en base de datos
await this.formsService.create({
  id: formId,
  botId: botId,
  nodeId: formNodeId,
  ...formDefinition
});

// Retornar URL al Studio
return {
  formUrl: publicUrl,
  formId: formId
};
```

---

## Otros Triggers Manejados por Orchestrator

### Webhook Trigger

```
POST /api/webhooks/:webhookId
```

Genera URL única para cada bot con trigger webhook.

### Schedule Trigger

Usa cron scheduler interno (Bull/Agenda) para ejecutar bots programados.

### API Polling Trigger

Background job que hace polling a endpoints configurados.

---

## Estado de Implementación

| Feature | Estado |
|---------|--------|
| API Base (NestJS) | 🔜 Pendiente |
| Autenticación JWT | 🔜 Pendiente |
| CRUD de Bots | 🔜 Pendiente |
| Job Scheduler | 🔜 Pendiente |
| **Form Service** | 🔜 Pendiente |
| UI Dashboard | 🔜 Pendiente |

---

## Referencias

- [n8n Form Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/)
- [SkuldForms Library](../engine/skuldbot/libs/forms.py)
- [Form Builder Component](../studio/src/components/FormBuilder.tsx)
