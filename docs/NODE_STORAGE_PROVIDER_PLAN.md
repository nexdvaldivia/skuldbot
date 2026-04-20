# Node Storage Provider Integration Plan

**Fecha**: 2026-04-15
**Responsable**: Albert
**Objetivo**: Todos los nodos que manejan archivos deben conectarse al Storage Provider
**Referencia**: `docs/STORAGE_PROVIDER_GAP_ANALYSIS.md`

---

## El Problema

Hoy el nodo `storage.provider` solo se conecta a los nodos `files.*`. Los demas nodos que manejan archivos (Excel, PDF, Email attachments, screenshots, etc.) usan paths locales directos. Esto significa que:

- Un bot que usa `excel.open` con `path: "invoices/jan.xlsx"` solo funciona en local
- Si el cliente tiene sus archivos en S3, Azure Blob, o cualquier otro storage, el bot no puede acceder
- Cambiar de storage requiere reescribir el bot

## La Solucion

Todo nodo que lea o escriba archivos debe tener un **conector visual** al `storage.provider` y resolver paths a traves de el.

```
[Storage Provider (S3)]
        │
        │ storage handle
        ├──────────────────────┐
        ▼                      ▼
[Excel Open]              [PDF Read]
  path: "reports/q1.xlsx"   path: "claims/doc.pdf"
  (resuelto via S3)         (resuelto via S3)
```

Local es un provider mas — no un caso especial.

---

## Nodos Afectados: 28 nodos, 31 campos

### EXCEL (6 campos)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `excel.open` | `path` | READ |
| `excel.save` | `path` | WRITE |
| `excel.create` | `path` | WRITE |
| `excel.csv_read` | `path` | READ |
| `excel.csv_write` | `path` | WRITE |
| `excel.export_pdf` | `output_path` | WRITE |

### DOCUMENT (8 campos)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `document.pdf_read` | `path` | READ |
| `document.pdf_merge` | `files` (array) | READ |
| `document.pdf_split` | `path` | READ |
| `document.pdf_to_image` | `path` | READ |
| `document.pdf_fill_form` | `path` | READ+WRITE |
| `document.ocr` | `path` | READ |
| `document.word_read` | `path` | READ |
| `document.word_write` | `path` | WRITE |

### EMAIL (5 campos)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `email.download_attachment` | `save_path` | WRITE |
| `email.send_outlook` | `attachments` | READ |
| `ms365.email_send` | `attachments` | READ |
| `ms365.email_reply` | `attachments` | READ |
| `ms365.email_download_attachment` | `save_path` | WRITE |

### WEB (2 campos)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `web.screenshot` | `path` | WRITE |
| `web.download_file` | `path` | WRITE |

### DESKTOP (3 campos)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `desktop.screenshot` | `path` | WRITE |
| `desktop.image_click` | `image_path` | READ |
| `desktop.wait_image` | `image_path` | READ |

### VOICE (2 campos)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `voice.speak` | `output_path` | WRITE |
| `voice.listen` | `audio_path` | READ |

### AI (1 campo)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `ai.vision` | `image_path` | READ |

### LOGGING (1 campo)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `logging.export` | `path` | WRITE |

### VECTORDB (1 campo)

| Nodo | Campo | Operacion |
|------|-------|:---------:|
| `vectordb.load_documents` | `source` | READ |

### Nodos descartados (no necesitan storage)

| Nodo | Campo | Razon |
|------|-------|-------|
| `desktop.open_app` | `path` | Ejecutable del OS, no archivo de datos |
| `python.project` | `project_path` | Path del runtime Python |
| `python.virtualenv` | `path` | Entorno Python local |
| `trigger.file_watch` | `path` | Monitoreo de filesystem local |
| `trigger.webhook` | `path` | Ruta HTTP, no filesystem |
| `secrets.*` | `vault_path` | Path dentro del vault |
| `api.ftp_upload` | `local_path` | Tiene su propio protocolo FTP |
| `data.tap.sftp` | `path` | Tiene su propio handler SFTP |
| `ai.translate` | `source_language` | Es un idioma, no un path |
| `api.json_path` | `path` | JSONPath expression, no filesystem |
| `excel.pivot` | `source_range` | Rango de Excel (A1:D100) |

---

## Implementacion

### Capa 1: Studio — Handle de conexion visual

**Archivo**: `apps/studio/src/components/CustomNode.tsx`

Agregar un handle tipo "storage" a los 28 nodos afectados, similar a como el AI Agent tiene handles para Model/Tools/Memory:

```tsx
{/* Storage Handle - para nodos que manejan archivos */}
{needsStorageConnection && (
  <Handle
    type="target"
    position={Position.Bottom}
    id="storage"
    className="!w-4 !h-4 !-bottom-[10px] !bg-orange-400 !border-[3px] !border-white"
    title="Connect Storage Provider"
  />
)}
```

**Archivo**: `apps/studio/src/data/nodeTemplates.ts`

Cada nodo afectado necesita flag `needsStorageConnection: true` y descripcion actualizada en los campos path:

```typescript
{
  type: "excel.open",
  category: "excel",
  label: "Open Excel",
  description: "Open Excel workbook from connected Storage Provider",
  needsStorageConnection: true,
  configSchema: [
    {
      name: "path",
      label: "File Path",
      type: "text",
      required: true,
      supportsExpressions: true,
      description: "Relative path in connected Storage Provider"
    },
  ],
}
```

### Capa 2: Compiler — Inyeccion de storage context

**Archivo**: `engine/skuldbot/compiler/compiler.py`

El compiler debe detectar cuando un nodo tiene un `storage.provider` conectado y generar el codigo de resolucion:

```python
# Si el nodo excel.open tiene storage.provider conectado:
# 1. Antes del keyword: descargar archivo a path temporal
# 2. Ejecutar keyword con path temporal
# 3. Despues del keyword (si es WRITE): subir resultado al storage

# Generado por el compiler:
${local_path}=    Storage Resolve To Local    ${path}    mode=read
Open Workbook    ${local_path}
# ... operaciones de excel ...
Save Workbook    ${local_path}
Storage Sync Back    ${local_path}    ${path}
```

### Capa 3: Engine — Storage resolver en la libreria

**Archivo**: `engine/skuldbot/libs/storage.py`

Agregar keywords de resolucion:

```python
@keyword("Storage Resolve To Local")
def resolve_to_local(self, remote_path: str, mode: str = "read") -> str:
    """
    Resuelve un path del storage provider a un path local temporal.
    
    Si el provider es 'local': retorna el path tal cual
    Si el provider es 's3': descarga a /tmp/{uuid}/{filename}, retorna el path temporal
    Si el provider es 'azure_blob': descarga a /tmp/{uuid}/{filename}, retorna el path temporal
    """
    provider = self._get_current_provider()
    
    if provider.type == "local":
        # Local provider: el path ya es local
        full_path = os.path.join(provider.config.local_path, remote_path)
        return full_path
    
    # Cloud provider: descargar a temporal
    temp_dir = os.path.join(tempfile.gettempdir(), str(uuid.uuid4()))
    os.makedirs(temp_dir, exist_ok=True)
    local_path = os.path.join(temp_dir, os.path.basename(remote_path))
    
    if mode == "read":
        provider.download(remote_path, local_path)
    
    return local_path

@keyword("Storage Sync Back")
def sync_back(self, local_path: str, remote_path: str) -> None:
    """
    Sube un archivo local de vuelta al storage provider.
    Si el provider es 'local': no hace nada (ya esta en su lugar)
    Si es cloud: sube y limpia el temporal
    """
    provider = self._get_current_provider()
    
    if provider.type == "local":
        return  # nada que sincronizar
    
    provider.upload(local_path, remote_path)
    
    # Limpiar temporal
    temp_dir = os.path.dirname(local_path)
    if temp_dir.startswith(tempfile.gettempdir()):
        shutil.rmtree(temp_dir, ignore_errors=True)
```

### Capa 4: FlowEditor — Validacion visual

**Archivo**: `apps/studio/src/components/FlowEditor.tsx` (o validation store)

Warning visual cuando un nodo que necesita storage no tiene uno conectado:

- En Studio debug (local): warning amarillo "No Storage Provider connected — using local filesystem"
- En produccion: error rojo "Storage Provider required for cloud execution"

---

## Ejecucion por Fases

### Fase 1: Foundation (Albert)

| Tarea | Archivos | Esfuerzo |
|-------|----------|:--------:|
| Agregar `needsStorageConnection` flag a los 28 nodos en nodeTemplates.ts | `nodeTemplates.ts` | M |
| Agregar storage handle en CustomNode.tsx | `CustomNode.tsx` | S |
| Actualizar descripciones de campos path | `nodeTemplates.ts` | S |
| Agregar validacion visual (warning/error) | `validationStore.ts` | S |

### Fase 2: Engine Integration (Albert + Luis)

| Tarea | Archivos | Esfuerzo |
|-------|----------|:--------:|
| Implementar `Storage Resolve To Local` keyword | `storage.py` | M |
| Implementar `Storage Sync Back` keyword | `storage.py` | M |
| Compiler: detectar storage connection e inyectar resolve/sync | `compiler.py`, `main_v2.robot.j2` | L |
| Tests: resolve local, resolve S3, resolve Azure, sync back | `test_storage.py` | M |

### Fase 3: Node por Node (Albert)

Actualizar cada nodo en el registry para usar storage resolver:

| Grupo | Nodos | Esfuerzo |
|-------|:-----:|:--------:|
| Excel | 6 | M |
| Document | 7 | M |
| Email + MS365 | 5 | M |
| Web + Desktop | 5 | S |
| Voice + AI + Logging + VectorDB | 5 | S |

### Fase 4: Testing (Albert)

| Tarea | Esfuerzo |
|-------|:--------:|
| Test E2E: Excel open/save via S3 | M |
| Test E2E: PDF read via Azure Blob | M |
| Test E2E: Screenshot save via storage provider | S |
| Test: local provider (sin cambio de comportamiento) | S |
| Test: sin storage provider (warning + fallback local) | S |

---

## Comportamiento Esperado

### Sin Storage Provider conectado

```
[Excel Open] — path: "data/report.xlsx"
  → Usa filesystem local
  → Warning en Studio: "No Storage Provider — using local filesystem"
  → En produccion: usa directorio de trabajo del Runner
```

### Con Storage Provider conectado (S3)

```
[Storage Provider] ──storage──> [Excel Open]
  provider: "s3"                   path: "reports/q1.xlsx"
  bucket: "client-data"
  
  → Runtime descarga s3://client-data/reports/q1.xlsx a /tmp/xxx/q1.xlsx
  → Excel abre /tmp/xxx/q1.xlsx
  → Al guardar: sube /tmp/xxx/q1.xlsx a s3://client-data/reports/q1.xlsx
  → Limpia /tmp/xxx/
```

### Con Storage Provider conectado (Local)

```
[Storage Provider] ──storage──> [Excel Open]
  provider: "local"                path: "reports/q1.xlsx"
  local_path: "/data/client"
  
  → Resuelve a /data/client/reports/q1.xlsx
  → Excel abre directamente (sin descarga/subida)
```

---

## Documentacion (5 Star Docu)

Cada nodo que se actualice con storage provider debe tener su documentacion actualizada en `docs-components`:

- Actualizar descripcion del nodo para mencionar storage provider
- Actualizar descripcion de campos path: "Relative path resolved by connected Storage Provider"
- Agregar ejemplo de uso con storage provider conectado
- Agregar nota de que sin storage provider usa filesystem local

**Regla**: No se cierra un nodo como "done" hasta que su pagina MDX este actualizada.

---

## Metricas de Exito

| Metrica | Target |
|---------|:------:|
| Nodos con storage handle | 28/28 |
| Tests por provider (local, S3, Azure) | 100% |
| Bots existentes sin storage (backward compatible) | Siguen funcionando |
| Warning visual en Studio | Implementado |
| Documentacion actualizada por nodo | 28/28 |

---

*(c) 2026 Skuld, LLC*
