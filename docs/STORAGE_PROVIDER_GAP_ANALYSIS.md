# Storage Provider Integration Gap Analysis

**Fecha**: 2026-04-15
**Autor**: Albert
**Problema**: 30+ nodos usan file paths directos sin pasar por el Storage Provider
**Impacto**: Bots no pueden correr en cloud ni cambiar de storage sin reescribir configs

---

## El patron correcto (ya implementado en files.*)

```
[Storage Provider] ──conectado──> [Files Read]
   config:                           config:
   provider: "s3"                    source: "invoices/2025/jan.pdf"
   bucket: "my-bucket"              (path relativo, resuelto por el provider)
   region: "us-east-1"
```

- `storage.provider` se configura UNA vez en el canvas
- `files.read/write/copy/move/delete` se conectan al provider
- Paths son relativos al provider
- Output incluye `provider` usado
- Local es un provider mas, no un caso especial

---

## El problema: nodos que ignoran el Storage Provider

Estos nodos aceptan `path` como string directo y lo pasan a la libreria RPA sin resolver por el storage provider:

### EXCEL (6 nodos)

| Nodo | Campo | Problema |
|------|-------|----------|
| `excel.open` | `path` | Pasa directo a `Open Workbook path=...` |
| `excel.save` | `path` | Pasa directo a `Save Workbook path=...` |
| `excel.create` | `path` | Pasa directo a `Create Workbook path=...` |
| `excel.csv_read` | `path` | Lee CSV de path local |
| `excel.csv_write` | `path` | Escribe CSV a path local |
| `excel.export_pdf` | `output_path` | Exporta PDF a path local |

### DOCUMENT (7 nodos)

| Nodo | Campo | Problema |
|------|-------|----------|
| `document.pdf_read` | `path` | Lee PDF de path local |
| `document.pdf_split` | `path` | Lee PDF de path local |
| `document.pdf_to_image` | `path` | Lee PDF de path local |
| `document.pdf_fill_form` | `path` | Lee/escribe PDF de path local |
| `document.ocr` | `path` | Lee imagen de path local |
| `document.word_read` | `path` | Lee Word de path local |
| `document.word_write` | `path` | Escribe Word a path local |

### WEB (2 nodos)

| Nodo | Campo | Problema |
|------|-------|----------|
| `web.screenshot` | `path` | Guarda screenshot a path local |
| `web.download_file` | `path` | Guarda descarga a path local |

### EMAIL (2 nodos)

| Nodo | Campo | Problema |
|------|-------|----------|
| `email.download_attachment` | `save_path` | Guarda adjunto a path local |
| `ms365.email_download_attachment` | `save_path` | Guarda adjunto a path local |

### VOICE (2 nodos)

| Nodo | Campo | Problema |
|------|-------|----------|
| `voice.speak` | `output_path` | Guarda audio TTS a path local |
| `voice.listen` | `audio_path` | Lee audio de path local |

### AI (1 nodo)

| Nodo | Campo | Problema |
|------|-------|----------|
| `ai.vision` | `image_path` | Lee imagen de path local |

### DESKTOP (1 nodo)

| Nodo | Campo | Problema |
|------|-------|----------|
| `desktop.screenshot` | `path` | Guarda screenshot a path local |

### LOGGING (1 nodo)

| Nodo | Campo | Problema |
|------|-------|----------|
| `logging.export` | `path` | Exporta logs a path local |

### VECTORDB (1 nodo)

| Nodo | Campo | Problema |
|------|-------|----------|
| `vectordb.load_documents` | `source` | Lee documentos de path local |

---

## Total: 28 nodos afectados, 31 campos

### Nodos ya verificados como NO afectados (falsos positivos descartados):
- `ai.translate.source_language` — es un idioma, no un file path
- `api.json_path.path` — es JSONPath expression, no filesystem
- `dataquality.generate_report.data_source` — es un nombre, no un path
- `excel.pivot.source_range` — es un rango Excel (A1:D100), no un path
- `ms365.email_download_attachment.attachment_id` — es un ID, no un path
- `data.tap.sftp` / `data.target.sftp` — SFTP tiene su propio handler/protocolo
- `desktop.open_app.path` — path de ejecutable del OS
- `python.project/virtualenv` — paths del runtime
- `trigger.file_watch/webhook` — paths de monitoreo/HTTP
- `secrets.*` — paths dentro del vault

### Nodos adicionales encontrados en revision exhaustiva:
- `email.send_outlook.attachments` — paths de archivos adjuntos
- `ms365.email_send.attachments` — paths de archivos adjuntos
- `ms365.email_reply.attachments` — paths de archivos adjuntos
- `document.pdf_merge.files` — array de paths de PDFs
- `desktop.image_click.image_path` — imagen de referencia para click
- `desktop.wait_image.image_path` — imagen de referencia para esperar

---

## Solucion Propuesta

### En el Engine (Python)

Cada nodo que maneja archivos debe resolver paths via el storage provider activo:

```python
# ANTES (excel.open hoy):
def open_workbook(self, path):
    # Abre directamente del filesystem
    self.workbook = openpyxl.load_workbook(path)

# DESPUES:
def open_workbook(self, path):
    # Resuelve via storage provider
    local_path = self.storage.resolve_to_local(path)
    # Si provider es local: local_path = path (sin cambio)
    # Si provider es S3: descarga a /tmp/xxx.xlsx, retorna /tmp/xxx.xlsx
    # Si provider es Azure: descarga a /tmp/xxx.xlsx, retorna /tmp/xxx.xlsx
    self.workbook = openpyxl.load_workbook(local_path)
```

Para nodos que escriben:

```python
# DESPUES:
def save_workbook(self, path):
    local_path = self.storage.resolve_to_local(path, mode="write")
    self.workbook.save(local_path)
    # Si provider es S3: sube local_path a S3, limpia /tmp
    # Si provider es Azure: sube local_path a Azure, limpia /tmp
    # Si provider es local: no hace nada extra
    self.storage.sync_back(local_path, path)
```

### En el Compiler

El compiler debe inyectar la configuracion del storage provider al inicio de cada bot:

```robot
*** Keywords ***
# Generado por compiler cuando hay storage.provider en el canvas
Configure Storage Provider    ${STORAGE_PROVIDER}    ${STORAGE_CONFIG}
```

### En el Studio (nodeTemplates.ts)

Actualizar la descripcion de los campos path para indicar que soportan storage provider:

```typescript
{
  name: "path",
  label: "File Path",
  type: "text",
  required: true,
  supportsExpressions: true,
  description: "Relative path resolved by connected Storage Provider. Absolute path for local filesystem."
}
```

Y agregar a los nodos afectados la misma nota que tienen los `files.*`:

```
// Note: Connect a "Storage Provider" node to use cloud storage
```

### En el Runtime (BotRunner)

El Runner debe tener un storage provider configurado por defecto (del Orchestrator):
- En produccion: el storage provider del tenant
- En Studio debug: local filesystem

---

## Nodos que NO necesitan cambio

| Nodo | Campo | Razon |
|------|-------|-------|
| `desktop.open_app` | `path` | Es un path de ejecutable del OS, no un archivo de datos |
| `python.project` | `project_path` | Es un path de proyecto en el runtime |
| `python.virtualenv` | `path` | Es un path de entorno Python |
| `trigger.file_watch` | `path` | Es un path de monitoreo del filesystem local |
| `trigger.webhook` | `path` | Es una ruta HTTP, no filesystem |
| `secrets.*` | `vault_path` | Es un path dentro del vault, no filesystem |
| `api.ftp_upload` | `local_path/remote_path` | Tiene su propio protocolo FTP |
| `data.tap.*.data_path` | `data_path` | Son JSONPath expressions, no filesystem |

---

## Prioridad de Implementacion

### P0 — Critico (sin esto no funcionan bots en cloud)

1. `excel.open` / `excel.save` / `excel.create` — El caso de uso mas comun
2. `document.pdf_read` — Segundo mas comun (invoice processing)
3. `email.download_attachment` / `ms365.download_attachment` — Adjuntos

### P1 — Importante

4. `document.*` restantes (ocr, word, pdf_split, pdf_fill_form)
5. `excel.csv_read` / `excel.csv_write`
6. `web.screenshot` / `web.download_file`

### P2 — Completa

7. `voice.speak` / `voice.listen`
8. `ai.vision`
9. `logging.export`
10. `desktop.screenshot`
11. `vectordb.load_documents`

---

*(c) 2026 Skuld, LLC*
