# Skuldbot Studio - Guia de Usuario

## Introduccion

Skuldbot Studio es un editor visual para crear bots de automatizacion (RPA).
Permite disenar flujos de trabajo arrastrando y conectando nodos, sin necesidad de programar.

---

## Interfaz del Studio

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo]  Skuldbot  │  Untitled Bot  │     Build  Run  │ ⬆ ⬇ 🗑 ⚙ ? │  ← Toolbar
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│  NODES   │                                                          │
│          │                                                          │
│ Triggers │                       CANVAS                             │
│ ○ Manual │                    (React Flow)                          │
│ ○ Schedule│                                                         │
│          │                                                          │
│ Browser  │                                                          │
│ ○ Open   │                                                          │
│ ○ Click  │                                                          │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  Console │ All │                                              [_][X]│  ← Logs Panel
│  No logs yet                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Componentes principales

| Area | Descripcion |
|------|-------------|
| **Toolbar** | Nombre del bot, botones de Build/Run, import/export |
| **Sidebar** | Catalogo de nodos organizados por categoria |
| **Canvas** | Area de trabajo donde se diseña el flujo |
| **Logs Panel** | Consola para ver mensajes de compilacion y ejecucion |
| **Node Config** | Panel flotante para configurar el nodo seleccionado |

---

## Crear tu Primer Bot

### Paso 1: Agregar un nodo de inicio

1. En el **Sidebar**, busca la categoria "Triggers"
2. Click en **Manual Trigger**
3. Click en el canvas donde quieras colocar el nodo

### Paso 2: Agregar acciones

1. Busca "Browser" en el Sidebar
2. Click en **Open Browser**
3. Click en el canvas para colocarlo

### Paso 3: Conectar nodos

1. Arrastra desde el punto verde (success) del primer nodo
2. Suelta sobre el segundo nodo
3. Se crea una conexion (edge)

### Paso 4: Configurar nodos

1. Click en un nodo para seleccionarlo
2. Aparece el panel de **Node Config** a la derecha
3. Llena los campos requeridos:
   - **Node Name**: Nombre descriptivo
   - **URL**: La pagina web a abrir
   - **Browser**: chromium, firefox, o webkit

### Paso 5: Compilar y ejecutar

1. Click en **Build** para compilar
2. Verifica los logs en la consola
3. Click en **Run** para ejecutar

---

## Toolbar - Acciones

| Boton | Accion | Atajo |
|-------|--------|-------|
| **Build** | Compila el flujo a Robot Framework | - |
| **Run** | Ejecuta el bot compilado | - |
| ⬆ Import | Importa un archivo DSL (.json) | - |
| ⬇ Export | Exporta el flujo como DSL (.json) | - |
| 🗑 Delete | Elimina el nodo seleccionado | `Delete` / `Backspace` |
| ⚙ Settings | Configuracion (proximamente) | - |
| ? Help | Ayuda (proximamente) | - |

---

## Catalogo de Nodos

### Triggers (Disparadores)

Los triggers son nodos especiales que **inician** el flujo de trabajo. Se identifican por:
- Badge verde "START" en la esquina superior
- Borde verde esmeralda
- Sin punto de entrada (solo pueden iniciar, no recibir conexiones)

| Nodo | Descripcion | Configuracion |
|------|-------------|---------------|
| **Manual** | Inicio manual | Ninguna |
| **Schedule** | Programado por tiempo | Expresion cron |
| **Webhook** | Disparado por HTTP | Endpoint URL |
| **Form** | Formulario web | Campos del formulario (ver seccion especial) |
| **File Watch** | Cambio de archivos | Ruta a monitorear |
| **Email Received** | Email entrante | Filtros de email |
| **Queue** | Cola de mensajes | Nombre de cola |
| **API Polling** | Polling periodico | URL, intervalo |
| **Database Change** | Cambio en BD | Query, conexion |
| **Storage Event** | Evento S3/MinIO | Bucket, eventos |
| **Message Bus** | Kafka/RabbitMQ | Topic, broker |
| **Chat** | Chatbot | Plataforma (Slack/Teams/Telegram) |

> **Nota**: Si no agregas un trigger, se añade automaticamente un "Manual Trigger" al compilar.

### Browser (Navegador)

| Nodo | Descripcion | Configuracion |
|------|-------------|---------------|
| **Open Browser** | Abre un navegador | URL, tipo de browser |
| **Navigate** | Navega a URL | URL destino |
| **Click** | Click en elemento | Selector CSS/XPath |
| **Fill** | Escribe en input | Selector, valor |
| **Get Text** | Extrae texto | Selector |
| **Screenshot** | Captura pantalla | Ruta de archivo |
| **Close Browser** | Cierra navegador | - |

### Data (Datos)

| Nodo | Descripcion | Configuracion |
|------|-------------|---------------|
| **Read Excel** | Lee archivo Excel | Ruta, hoja |
| **Write Excel** | Escribe a Excel | Ruta, datos |
| **Parse JSON** | Parsea JSON | String JSON |
| **HTTP Request** | Llamada a API | URL, metodo, body |

### Flow (Control de flujo)

| Nodo | Descripcion | Configuracion |
|------|-------------|---------------|
| **Condition** | If/else | Expresion booleana |
| **Loop** | Bucle for/while | Iteraciones, condicion |
| **Delay** | Pausa | Segundos |
| **Variable** | Define variable | Nombre, valor |

### Notifications

| Nodo | Descripcion | Configuracion |
|------|-------------|---------------|
| **Email** | Envia correo | To, subject, body |
| **Slack** | Mensaje a Slack | Channel, message |
| **Log** | Escribe a log | Nivel, mensaje |

---

## Panel de Configuracion de Nodos

Cuando seleccionas un nodo, aparece un panel flotante:

```
┌─────────────────────────┐
│ [icon] Open Browser     │
│ browser.open            │
│                    [X]  │
├─────────────────────────┤
│ Node Name               │
│ [________________]      │
│                         │
│ ──────── Config ─────── │
│                         │
│ URL *                   │
│ [________________]      │
│                         │
│ Browser                 │
│ [chromium        ▼]     │
│                         │
│ Headless                │
│ [○] Enable              │
├─────────────────────────┤
│ ℹ Opens a browser and   │
│   navigates to the URL  │
└─────────────────────────┘
```

### Tipos de campos

| Tipo | Ejemplo | Descripcion |
|------|---------|-------------|
| **Text** | URL, selector | Campo de texto libre |
| **Number** | Timeout | Solo numeros |
| **Select** | Browser type | Lista desplegable |
| **Boolean** | Headless | Switch on/off |
| **Textarea** | Script | Texto multilinea |

---

## Consola de Logs

La consola muestra mensajes durante Build y Run:

### Niveles de log

| Nivel | Color | Icono | Uso |
|-------|-------|-------|-----|
| **Debug** | Gris | DBG | Informacion tecnica detallada |
| **Info** | Azul | INF | Informacion general |
| **Warning** | Amarillo | WRN | Advertencias no criticas |
| **Error** | Rojo | ERR | Errores que detienen ejecucion |
| **Success** | Verde | OK | Operaciones exitosas |

### Filtros rapidos

- **All**: Muestra todos los logs
- **Errors (N)**: Solo errores (si hay)
- **Warnings (N)**: Solo advertencias (si hay)

### Acciones

| Boton | Accion |
|-------|--------|
| 📋 Copy | Copia todos los logs al clipboard |
| ⬇ Download | Descarga logs como .txt |
| 🗑 Clear | Limpia la consola |
| ▼/▲ | Minimiza/expande la consola |

---

## Atajos de Teclado

| Atajo | Accion |
|-------|--------|
| `Cmd/Ctrl + K` | Buscar nodos |
| `Delete` / `Backspace` | Eliminar nodo seleccionado |
| `Cmd/Ctrl + Z` | Deshacer (proximamente) |
| `Cmd/Ctrl + S` | Guardar (proximamente) |

---

## Importar y Exportar

### Exportar DSL

1. Click en el boton ⬇ (Export)
2. Se descarga un archivo `nombre-del-bot.json`
3. Este archivo contiene todo el flujo

### Importar DSL

1. Click en el boton ⬆ (Import)
2. Selecciona un archivo `.json`
3. El flujo se carga en el canvas

### Formato del archivo

```json
{
  "version": "1.0",
  "bot": {
    "id": "bot-123",
    "name": "Mi Bot",
    "description": ""
  },
  "nodes": [...],
  "edges": [...],
  "variables": {}
}
```

---

## Manejo de Errores

### Errores comunes

| Error | Causa | Solucion |
|-------|-------|----------|
| "No hay nodos" | Canvas vacio | Agrega al menos un nodo |
| "Engine not found" | Python no configurado | Ver guia de instalacion |
| "Compilation failed" | DSL invalido | Revisa la configuracion de nodos |

### Flujo de errores

Cada nodo tiene dos salidas:
- **Success** (verde): Continua al siguiente nodo
- **Error** (rojo): Salta al nodo de manejo de errores

Recomendacion: Siempre conecta un nodo de error para notificaciones.

---

## Buenas Practicas

1. **Nombra tus nodos**: Usa nombres descriptivos en vez de "Node 1"
2. **Maneja errores**: Conecta la salida error a un nodo de notificacion
3. **Modulariza**: Divide flujos complejos en sub-flujos
4. **Exporta frecuentemente**: Guarda backups de tus bots
5. **Documenta**: Usa la descripcion del bot para explicar su proposito

---

---

## Form Trigger - Formularios Web

El **Form Trigger** permite iniciar bots mediante formularios web, similar a n8n. Los usuarios llenan un formulario y al enviar, se ejecuta automaticamente el bot con los datos ingresados.

### Crear un Form Trigger

1. En el Sidebar, busca "Triggers"
2. Click en **Form Trigger**
3. Click en el canvas para colocar el nodo
4. Selecciona el nodo para configurarlo

### Configurar el formulario

En el panel de configuracion veras:

```
┌─────────────────────────────────┐
│ [icon] Form Trigger        [👁][X] │  ← El ojo abre vista previa
├─────────────────────────────────┤
│ Form Title *                    │
│ [Solicitud de Reembolso    ]    │
│                                 │
│ Form Description                │
│ [Complete para iniciar...  ]    │
│                                 │
│ ──────── Form Fields ────────   │
│ Form Fields (2)     [+ Add Field]│
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ≡ 1 [📝] Nombre Completo    │ │
│ │       text *           [🗑] │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ≡ 2 [📧] Email              │ │
│ │       email *          [🗑] │ │
│ └─────────────────────────────┘ │
│                                 │
│ Submit Button Label             │
│ [Enviar Solicitud          ]    │
└─────────────────────────────────┘
```

### Form Builder - Agregar campos

Click en **"+ Add Field"** para agregar campos:

| Tipo | Icono | Descripcion | Opciones |
|------|-------|-------------|----------|
| **Text** | 📝 | Texto libre | Placeholder |
| **Email** | 📧 | Correo electronico | Validacion automatica |
| **Number** | # | Solo numeros | Min, Max |
| **Date** | 📅 | Selector de fecha | - |
| **Dropdown** | ▼ | Lista desplegable | Opciones (una por linea) |
| **Checkbox** | ☑ | Casilla de verificacion | - |
| **File** | 📎 | Subir archivo | - |
| **Textarea** | ¶ | Texto largo | Placeholder |

### Configurar cada campo

Click en un campo para expandir su configuracion:

1. **Field Label**: Nombre visible del campo
2. **Placeholder**: Texto de ayuda dentro del campo
3. **Required**: Marcar si es obligatorio
4. **Options** (solo dropdown): Una opcion por linea

### Vista Previa del Formulario

Click en el icono del **ojo** (👁) en el header del panel para abrir la vista previa:

- Ventana flotante con el formulario renderizado
- Puedes probar llenando los campos
- Los datos se muestran en la consola del navegador
- Boton para maximizar/minimizar

### Reordenar campos

Usa los botones ↑ ↓ en cada campo para cambiar el orden.

### Flujo de datos

Cuando el usuario envia el formulario:

```
Usuario llena form → Envia → Orchestrator recibe datos → Ejecuta bot
                                    ↓
                           Los datos estan disponibles
                           como variables: ${form.campo}
```

### Ejemplo de uso

**Caso**: Solicitud de vacaciones

1. Form Trigger con campos: Nombre, Fecha Inicio, Fecha Fin, Motivo
2. Nodo de validacion (verificar fechas)
3. Nodo de email (notificar a RRHH)
4. Nodo de registro (guardar en Excel/DB)

```
[Form Trigger] → [Validate Dates] → [Send Email] → [Save Record]
     ↓                  ↓
  (error)           (error)
     ↓                  ↓
[Notify Error] ←───────┘
```

### Publicacion del formulario

Al compilar el bot, el Orchestrator genera una URL publica:

```
https://forms.tudominio.com/forms/bot-123-form-abc
```

Esta URL puede compartirse con los usuarios que deban llenar el formulario.

> **Nota**: La publicacion requiere el Orchestrator desplegado. En modo local (Studio), usa la vista previa para probar.

---

## Multiples Triggers

Un flujo puede tener **varios triggers**. Por ejemplo:

```
[Schedule Trigger] ────┐
(todos los lunes)      │
                       ↓
[Form Trigger] ───────→ [Procesar Datos] → [Enviar Reporte]
(solicitud manual)
```

Ambos triggers pueden iniciar el mismo flujo:
- El Schedule lo ejecuta automaticamente cada lunes
- El Form permite ejecucion manual via formulario

### Configurar multiples triggers

1. Arrastra varios triggers al canvas
2. Conecta cada uno al primer nodo de accion
3. Al compilar, el DSL incluye todos los triggers

```json
{
  "triggers": ["trigger-schedule-001", "trigger-form-002"],
  "nodes": [...]
}
```

---

## Flujo de Datos entre Nodos

Skuldbot permite pasar datos de un nodo a otro usando **expresiones**. Similar a n8n, puedes referenciar el output de nodos anteriores en los campos de configuracion.

### Panel de Configuracion con Input/Output

Cuando seleccionas un nodo, el panel de configuracion tiene **tres secciones**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  INPUT (azul)      │     CONFIG (centro)      │   OUTPUT (verde)    │
│                    │                          │                      │
│  Variables de      │   Configuracion del      │   Campos que este   │
│  nodos anteriores  │   nodo actual            │   nodo produce      │
│                    │                          │                      │
│  Click para copiar │                          │   Click para copiar │
│                    │                          │                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Panel INPUT - Variables Disponibles

El panel izquierdo (azul) muestra todas las variables que puedes usar, provenientes de nodos anteriores en el flujo:

```
┌─────────────────────┐
│ ● INPUT      3 vars │
├─────────────────────┤
│ Form Trigger        │
│ ┌─────────────────┐ │
│ │ object formData │ │
│ │ Datos del form  │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ string nombre   │ │
│ │ Campo: Nombre   │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ string email    │ │
│ │ Campo: Email    │ │
│ └─────────────────┘ │
└─────────────────────┘
```

**Para usar una variable:**
1. Click en la variable deseada
2. Se copia automaticamente al clipboard
3. Pega en el campo de configuracion

### Panel OUTPUT - Campos que Produce

El panel derecho (verde) muestra los campos que este nodo produce y que estaran disponibles para nodos siguientes:

```
┌─────────────────────┐
│ ● OUTPUT   2 campos │
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ string response │ │
│ │ Respuesta LLM   │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ number tokens   │ │
│ │ Tokens usados   │ │
│ └─────────────────┘ │
└─────────────────────┘
```

### Sintaxis de Expresiones

Las expresiones usan la sintaxis `${NombreNodo.campo}`:

```
${Form Trigger.formData.nombre}    → "Juan Perez"
${Form Trigger.formData.email}     → "juan@email.com"
${HTTP Request.body.data}          → {...}
${AI Summarize.summary}            → "Resumen del texto..."
```

### Ejemplo Practico

**Flujo: Procesar solicitud de soporte**

```
[Form Trigger] → [AI Classify] → [Send Email] → [Save to Excel]
```

**1. Form Trigger** produce:
- `formData.nombre` = "Maria Garcia"
- `formData.problema` = "No puedo iniciar sesion..."
- `formData.urgencia` = "Alta"

**2. AI Classify** usa y produce:
- Input: `${Form Trigger.formData.problema}`
- Output: `category` = "Acceso", `confidence` = 0.95

**3. Send Email** usa:
- To: `soporte-${AI Classify.category}@empresa.com`
- Subject: `[${Form Trigger.formData.urgencia}] Ticket de ${Form Trigger.formData.nombre}`
- Body: `Problema: ${Form Trigger.formData.problema}\nCategoria: ${AI Classify.category}`

**4. Save to Excel** usa:
- Row: `[${Form Trigger.formData.nombre}, ${AI Classify.category}, ${AI Classify.confidence}]`

### Tipos de Datos

Los campos tienen tipos que ayudan a entender que datos contienen:

| Tipo | Color | Descripcion | Ejemplo |
|------|-------|-------------|---------|
| `string` | Verde | Texto | "Hola mundo" |
| `number` | Azul | Numero | 42, 3.14 |
| `boolean` | Morado | Verdadero/Falso | true, false |
| `object` | Naranja | Objeto JSON | {"key": "value"} |
| `array` | Rosa | Lista/Array | [1, 2, 3] |
| `any` | Gris | Cualquier tipo | - |

### Nodos con Output

No todos los nodos producen datos. Aqui estan los principales:

**Triggers:**
| Nodo | Outputs |
|------|---------|
| Form Trigger | `formData`, `submissionId`, `submittedAt` + campos dinamicos |
| Webhook | `body`, `headers`, `query` |

**Web:**
| Nodo | Outputs |
|------|---------|
| Get Text | `text` |
| Get Attribute | `value` |
| Execute JS | `result` |

**API:**
| Nodo | Outputs |
|------|---------|
| HTTP Request | `statusCode`, `body`, `headers` |

**Excel:**
| Nodo | Outputs |
|------|---------|
| Read Range | `data` (array), `rowCount` |
| Read Cell | `value` |

**AI:**
| Nodo | Outputs |
|------|---------|
| LLM Prompt | `response`, `tokens` |
| Extract Data | `extracted` (object) |
| Summarize | `summary` |
| Classify | `category`, `confidence` |
| Translate | `translated` |
| Sentiment | `sentiment`, `score` |

### Campos Dinamicos del Form Trigger

El Form Trigger es especial porque sus campos son dinamicos. Si defines campos en el formulario, aparecen automaticamente en el panel OUTPUT:

**Ejemplo: Formulario con 3 campos**

```
Form Fields:
- nombre (text)
- email (email)
- departamento (dropdown)

Outputs generados:
- formData.nombre
- formData.email
- formData.departamento
```

### Consejos

1. **Nombra bien tus nodos**: El nombre del nodo aparece en las expresiones, usa nombres descriptivos
2. **Verifica los tipos**: Un campo `number` no funcionara donde se espera `string`
3. **Usa el panel INPUT**: No necesitas memorizar las expresiones, el panel las muestra
4. **Click para copiar**: Un click copia la expresion completa lista para pegar

---

## Soporte

- **Documentacion**: `/docs` en el repositorio
- **Issues**: GitHub Issues
- **Email**: dev@khipus.io
