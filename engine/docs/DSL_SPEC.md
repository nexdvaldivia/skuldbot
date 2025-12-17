# Especificación del DSL

## Versión 1.0

Este documento describe la especificación completa del DSL (Domain Specific Language) de Skuldbot.

## Estructura General

```json
{
  "version": "1.0",
  "bot": { ... },
  "nodes": [ ... ],
  "variables": { ... },
  "start_node": "node-id"
}
```

## Campo: `version`

**Tipo:** `string`  
**Requerido:** ✅  
**Descripción:** Versión del DSL usado

**Valores válidos:**
- `"1.0"` (actual)

## Campo: `bot`

**Tipo:** `object`  
**Requerido:** ✅  
**Descripción:** Metadata del bot

### Subcampos de `bot`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id` | string | ✅ | Identificador único del bot |
| `name` | string | ✅ | Nombre del bot |
| `description` | string | ❌ | Descripción del bot |
| `version` | string | ❌ | Versión del bot (default: "1.0.0") |
| `author` | string | ❌ | Autor del bot |
| `tags` | string[] | ❌ | Tags para categorización |

**Ejemplo:**

```json
{
  "bot": {
    "id": "invoice-processor",
    "name": "Procesador de Facturas",
    "description": "Descarga y procesa facturas automáticamente",
    "version": "2.1.0",
    "author": "Juan Pérez",
    "tags": ["finance", "invoices", "automation"]
  }
}
```

## Campo: `nodes`

**Tipo:** `array`  
**Requerido:** ✅  
**Descripción:** Lista de nodos que componen el flujo

### Estructura de un Nodo

```json
{
  "id": "unique-node-id",
  "type": "category.action",
  "config": { ... },
  "outputs": {
    "success": "next-node-id",
    "error": "error-node-id"
  },
  "label": "Mi Nodo",
  "description": "Descripción del nodo"
}
```

### Subcampos de un Nodo

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id` | string | ✅ | ID único del nodo |
| `type` | string | ✅ | Tipo de nodo (formato: `category.action`) |
| `config` | object | ✅ | Configuración específica del nodo |
| `outputs` | object | ✅ | Salidas del nodo |
| `label` | string | ❌ | Etiqueta visual |
| `description` | string | ❌ | Descripción del nodo |

### Outputs de un Nodo

Todos los nodos **DEBEN** tener salidas `success` y `error`:

```json
{
  "outputs": {
    "success": "node-id-on-success",
    "error": "node-id-on-error"
  }
}
```

## Tipos de Nodos

### 1. Browser Nodes (`browser.*`)

#### `browser.open`

Abre un navegador.

**Config:**
```json
{
  "url": "https://example.com",
  "browser": "chromium",  // chromium | firefox | webkit
  "headless": false
}
```

#### `browser.click`

Hace click en un elemento.

**Config:**
```json
{
  "selector": "css:#button-id",
  "wait": true,
  "timeout": "10s"
}
```

#### `browser.fill`

Llena un campo.

**Config:**
```json
{
  "selector": "css:#username",
  "value": "admin",
  "clear": true
}
```

#### `browser.close`

Cierra el navegador.

**Config:**
```json
{}
```

### 2. Excel Nodes (`excel.*`)

#### `excel.open`

Abre archivo Excel.

**Config:**
```json
{
  "path": "/path/to/file.xlsx"
}
```

#### `excel.read`

Lee datos de Excel.

**Config:**
```json
{
  "sheet": "Sheet1",
  "header": true,
  "output_variable": "excel_data"
}
```

#### `excel.write`

Escribe datos a Excel.

**Config:**
```json
{
  "sheet": "Results",
  "data_variable": "processed_data"
}
```

#### `excel.close`

Cierra Excel.

**Config:**
```json
{
  "save": true
}
```

### 3. Control Nodes (`control.*`)

#### `control.log`

Registra un mensaje.

**Config:**
```json
{
  "message": "Processing started",
  "level": "INFO"  // INFO | WARN | ERROR | DEBUG
}
```

#### `control.wait`

Espera un tiempo.

**Config:**
```json
{
  "seconds": 5
}
```

#### `control.set_variable`

Define una variable.

**Config:**
```json
{
  "name": "counter",
  "value": 42
}
```

#### `control.if`

Condición if/else.

**Config:**
```json
{
  "condition": "counter > 10",
  "true_node": "node-a",
  "false_node": "node-b"
}
```

## Campo: `variables`

**Tipo:** `object`  
**Requerido:** ❌  
**Descripción:** Variables del bot

### Estructura de una Variable

```json
{
  "variable_name": {
    "type": "string",
    "value": "default_value",
    "description": "Descripción"
  }
}
```

### Tipos de Variables

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| `string` | Texto | `"Hello World"` |
| `number` | Número | `42` o `3.14` |
| `boolean` | Booleano | `true` o `false` |
| `credential` | Credencial (en vault) | `{"vault": "orchestrator"}` |
| `file` | Archivo | `"/path/to/file"` |
| `json` | Objeto JSON | `{"key": "value"}` |

### Ejemplo de Variables

```json
{
  "variables": {
    "api_url": {
      "type": "string",
      "value": "https://api.example.com",
      "description": "URL base de la API"
    },
    "max_retries": {
      "type": "number",
      "value": 3
    },
    "api_key": {
      "type": "credential",
      "vault": "orchestrator",
      "description": "API key desde vault"
    }
  }
}
```

## Campo: `start_node`

**Tipo:** `string`  
**Requerido:** ❌  
**Descripción:** ID del nodo inicial

Si no se especifica, el primer nodo de la lista será el inicial.

## Referencias a Variables

En cualquier campo `config`, puedes referenciar variables:

```json
{
  "config": {
    "url": "${variables.api_url}/endpoint",
    "api_key": "${variables.api_key}"
  }
}
```

## Validaciones

El DSL será validado automáticamente:

1. ✅ Todos los IDs de nodos son únicos
2. ✅ Todas las referencias a nodos existen
3. ✅ No hay ciclos infinitos
4. ✅ Todos los nodos son alcanzables
5. ✅ El formato de `type` es `category.action`
6. ✅ Todos los nodos tienen outputs `success` y `error`

## Ejemplo Completo

```json
{
  "version": "1.0",
  "bot": {
    "id": "web-to-excel",
    "name": "Web to Excel Bot",
    "description": "Extrae datos de web y los guarda en Excel"
  },
  "nodes": [
    {
      "id": "open-browser",
      "type": "browser.open",
      "config": {
        "url": "${variables.target_url}",
        "browser": "chromium",
        "headless": true
      },
      "outputs": {
        "success": "extract-data",
        "error": "log-error"
      }
    },
    {
      "id": "extract-data",
      "type": "browser.click",
      "config": {
        "selector": "css:.data-table"
      },
      "outputs": {
        "success": "close-browser",
        "error": "log-error"
      }
    },
    {
      "id": "close-browser",
      "type": "browser.close",
      "config": {},
      "outputs": {
        "success": "open-excel",
        "error": "log-error"
      }
    },
    {
      "id": "open-excel",
      "type": "excel.open",
      "config": {
        "path": "${variables.output_file}"
      },
      "outputs": {
        "success": "write-data",
        "error": "log-error"
      }
    },
    {
      "id": "write-data",
      "type": "excel.write",
      "config": {
        "sheet": "Data",
        "data_variable": "extracted_data"
      },
      "outputs": {
        "success": "close-excel",
        "error": "log-error"
      }
    },
    {
      "id": "close-excel",
      "type": "excel.close",
      "config": {
        "save": true
      },
      "outputs": {
        "success": "log-success",
        "error": "log-error"
      }
    },
    {
      "id": "log-success",
      "type": "control.log",
      "config": {
        "message": "Bot completed successfully!"
      },
      "outputs": {
        "success": "log-success",
        "error": "log-success"
      }
    },
    {
      "id": "log-error",
      "type": "control.log",
      "config": {
        "message": "Error occurred: ${error.message}",
        "level": "ERROR"
      },
      "outputs": {
        "success": "log-error",
        "error": "log-error"
      }
    }
  ],
  "variables": {
    "target_url": {
      "type": "string",
      "value": "https://example.com/data"
    },
    "output_file": {
      "type": "file",
      "value": "./output/data.xlsx"
    }
  },
  "start_node": "open-browser"
}
```

## Versiones Futuras

### v1.1 (Planeado)
- Loops (`control.for`, `control.while`)
- Subflows (`flow.call`)
- Error handling avanzado

### v1.2 (Planeado)
- Parallel execution
- Conditional outputs (más de 2)
- Dynamic node generation

