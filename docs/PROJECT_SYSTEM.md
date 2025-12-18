# SkuldBot Studio - Sistema de Proyectos

> Documentación para el website de Skuld, LLC

## Introducción

SkuldBot Studio introduce un sistema de proyectos multi-bot tipo IDE que permite organizar, versionar y gestionar automatizaciones RPA + IA de manera profesional.

**SkuldBot** es una plataforma de automatización inteligente que combina:
- **RPA (Robotic Process Automation)**: Automatización de tareas repetitivas
- **IA (Inteligencia Artificial)**: Toma de decisiones inteligente, procesamiento de lenguaje natural, y más

---

## Características Principales

### 1. Estructura de Proyectos Multi-Bot

Cada proyecto puede contener múltiples bots organizados en una estructura de carpetas clara:

```
mi-proyecto/
├── proyecto.skuld              # Manifest del proyecto
├── bots/
│   ├── extractor-facturas/
│   │   ├── bot.json           # DSL del bot
│   │   ├── .history/          # Historial de versiones
│   │   └── assets/            # Assets específicos del bot
│   ├── procesador-datos/
│   │   └── ...
│   └── notificador/
│       └── ...
├── shared/
│   ├── assets/                # Imágenes, archivos compartidos
│   ├── scripts/               # Scripts Python reutilizables
│   └── node-templates/        # Templates de nodos custom
├── .skuldbot/
│   ├── config.json            # Configuración local
│   ├── env.local              # Variables de entorno (gitignored)
│   └── cache/                 # Cache de compilación
└── .gitignore
```

### 2. Welcome Screen

La pantalla de bienvenida ofrece:

- **Proyectos Recientes**: Acceso rápido a los últimos proyectos abiertos
- **Crear Proyecto**: Wizard para crear nuevos proyectos
- **Abrir Proyecto**: Explorador de archivos nativo
- **Branding**: Información de Skuld, LLC

### 3. Project Explorer

Panel lateral estilo VS Code con:

- **Árbol de Bots**: Vista jerárquica de todos los bots
- **Acciones Rápidas**: Crear, renombrar, duplicar, eliminar
- **Menú Contextual**: Click derecho para opciones avanzadas
- **Shared Resources**: Acceso a assets y scripts compartidos
- **Settings**: Configuración del proyecto y variables de entorno

### 4. Sistema de Tabs

Múltiples bots abiertos simultáneamente:

- **Tabs Reordenables**: Drag & drop para reorganizar
- **Indicador de Cambios**: Punto de "dirty state" cuando hay cambios sin guardar
- **Menú Contextual**: Cerrar, cerrar otros, cerrar todos
- **Persistencia**: Los tabs abiertos se recuerdan entre sesiones

### 5. Auto-Save Inteligente

Guardado automático con:

- **Debounce**: Espera configurable antes de guardar (default: 5s)
- **Detección de Cambios**: Solo guarda cuando hay cambios reales
- **Sin Interrupciones**: Guarda en background sin afectar el flujo de trabajo
- **Configurable**: Habilitar/deshabilitar por proyecto

### 6. Historial de Versiones

Undo/Redo persistente por bot:

- **Snapshots Automáticos**: Captura versiones al guardar
- **Recuperación**: Volver a cualquier versión anterior
- **Límite Configurable**: Máximo de versiones a mantener (default: 50)
- **Metadata**: Timestamp y descripción opcional por versión

---

## Manifest del Proyecto (proyecto.skuld)

```json
{
  "version": "1.0",
  "project": {
    "id": "uuid-del-proyecto",
    "name": "Mi Proyecto RPA",
    "description": "Automatizaciones para procesamiento de facturas",
    "created": "2025-12-17T10:00:00Z",
    "updated": "2025-12-17T15:30:00Z",
    "author": "Juan Pérez"
  },
  "settings": {
    "defaultBrowser": "chromium",
    "defaultHeadless": false,
    "logLevel": "INFO",
    "autoSave": {
      "enabled": true,
      "intervalMs": 5000
    },
    "versionHistory": {
      "enabled": true,
      "maxVersions": 50
    }
  },
  "bots": [
    {
      "id": "bot-uuid-1",
      "name": "Extractor de Facturas",
      "path": "bots/extractor-facturas",
      "description": "Extrae datos de facturas PDF",
      "tags": ["facturas", "pdf", "extracción"],
      "created": "2025-12-17T10:05:00Z",
      "updated": "2025-12-17T14:20:00Z"
    }
  ]
}
```

---

## Flujo de Trabajo

### Crear un Nuevo Proyecto

1. Abrir SkuldBot Studio
2. En Welcome Screen, click "New Project"
3. Seleccionar ubicación y nombre
4. El proyecto se crea con estructura completa

### Agregar Bots al Proyecto

1. En Project Explorer, click "+" junto a "Bots"
2. Ingresar nombre y descripción
3. El bot se crea y abre automáticamente

### Trabajar con Múltiples Bots

1. Hacer click en cualquier bot del explorer
2. Se abre en un nuevo tab
3. Cambiar entre tabs para editar diferentes bots
4. Los cambios se guardan automáticamente

### Compartir Assets Entre Bots

1. Colocar archivos en `shared/assets/`
2. Acceder desde cualquier bot usando rutas relativas
3. Útil para: logos, plantillas, configuraciones comunes

---

## Configuración del Proyecto

### Settings Generales

| Setting | Descripción | Default |
|---------|-------------|---------|
| `defaultBrowser` | Browser para automatización web | chromium |
| `defaultHeadless` | Ejecutar sin UI visible | false |
| `logLevel` | Nivel de detalle de logs | INFO |

### Auto-Save

| Setting | Descripción | Default |
|---------|-------------|---------|
| `enabled` | Activar auto-guardado | true |
| `intervalMs` | Intervalo mínimo entre guardados | 5000 |

### Historial de Versiones

| Setting | Descripción | Default |
|---------|-------------|---------|
| `enabled` | Activar historial | true |
| `maxVersions` | Máximo de versiones a mantener | 50 |

---

## Variables de Entorno

### Ambientes Soportados

- **Development**: Para desarrollo local
- **Staging**: Para pruebas pre-producción
- **Production**: Para ejecución en producción

### Definir Variables

```yaml
# .skuldbot/env.local (gitignored)
API_KEY: "sk-xxxxx"
DATABASE_URL: "postgres://..."

# O en UI de Settings > Environment
```

### Usar Variables en Bots

```
${env.API_KEY}
${env.DATABASE_URL}
```

### Secrets

Las variables marcadas como "secret" se encriptan en disco y nunca se muestran en logs.

---

## Keyboard Shortcuts

| Shortcut | Acción |
|----------|--------|
| `Ctrl/Cmd + S` | Guardar bot actual |
| `Ctrl/Cmd + W` | Cerrar tab actual |
| `Ctrl/Cmd + Tab` | Siguiente tab |
| `Ctrl/Cmd + Shift + Tab` | Tab anterior |
| `Ctrl/Cmd + N` | Nuevo bot |
| `Delete/Backspace` | Eliminar nodo seleccionado |
| `Ctrl/Cmd + Z` | Deshacer |
| `Ctrl/Cmd + Y` | Rehacer |

---

## API de Tauri (Backend)

### Comandos de Proyecto

```typescript
// Crear proyecto
invoke('create_project', { path, name, description })

// Abrir proyecto
invoke('open_project', { path })

// Guardar manifest
invoke('save_project_manifest', { path, manifest })
```

### Comandos de Bot

```typescript
// Crear bot
invoke('create_bot', { projectPath, name, description })

// Cargar bot
invoke('load_bot', { botPath })

// Guardar bot
invoke('save_bot', { botPath, dsl })

// Eliminar bot
invoke('delete_bot', { botPath })
```

### Comandos de Historial

```typescript
// Guardar versión
invoke('save_bot_version', { botPath, dsl, description })

// Listar versiones
invoke('list_bot_versions', { botPath })

// Cargar versión específica
invoke('load_bot_version', { botPath, versionId })

// Limpiar versiones antiguas
invoke('cleanup_old_versions', { botPath, maxVersions })
```

### Comandos de Assets

```typescript
// Listar assets
invoke('list_assets', { assetsPath })

// Copiar asset
invoke('copy_asset', { source, destination })

// Eliminar asset
invoke('delete_asset', { path })
```

### Proyectos Recientes

```typescript
// Obtener recientes
invoke('get_recent_projects')

// Agregar a recientes
invoke('add_recent_project', { path, name })

// Remover de recientes
invoke('remove_recent_project', { path })
```

---

## Stores (Estado de Aplicación)

### projectStore

Estado principal del proyecto:

```typescript
interface ProjectStoreState {
  project: ProjectManifest | null;
  projectPath: string | null;
  bots: Map<string, BotState>;
  activeBotId: string | null;
  recentProjects: RecentProject[];

  // Actions
  createProject(path, name, description): Promise<void>;
  openProject(path): Promise<void>;
  closeProject(): void;
  saveProject(): Promise<void>;
  createBot(name, description): Promise<string | null>;
  openBot(botId): Promise<void>;
  saveBot(botId): Promise<void>;
  deleteBot(botId): Promise<void>;
}
```

### tabsStore

Sistema de tabs:

```typescript
interface TabsStoreState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  openTab(tab): void;
  closeTab(tabId): void;
  closeOtherTabs(tabId): void;
  closeAllTabs(): void;
  setActiveTab(tabId): void;
  setTabDirty(tabId, isDirty): void;
}
```

### navigationStore

Estado de navegación y layout:

```typescript
interface NavigationStoreState {
  currentView: 'welcome' | 'project' | 'loading';
  sidebarCollapsed: boolean;
  projectExplorerWidth: number;
  rightPanelWidth: number;
  logsHeight: number;

  // Actions
  setView(view): void;
  toggleSidebar(): void;
  setProjectExplorerWidth(width): void;
}
```

---

## Componentes UI

### WelcomeScreen

Pantalla inicial con:
- Logo y branding
- Botones de crear/abrir proyecto
- Lista de proyectos recientes
- Links a documentación

### ProjectExplorer

Panel lateral con:
- Árbol de navegación
- Secciones: Bots, Shared, Settings
- Acciones contextuales
- Indicadores de dirty state

### TabBar

Barra de tabs:
- Tabs con iconos por tipo
- Indicador de cambios sin guardar
- Botón de cerrar
- Menú contextual

### ProjectToolbar

Barra de herramientas:
- Logo y nombre de proyecto
- Nombre del bot activo
- Botones: Save, Build, Run
- Export DSL
- Undo/Redo (próximamente)

### BotEditor

Editor principal:
- Canvas de React Flow
- Drag & drop de nodos
- Conexiones entre nodos
- MiniMap y controles

### AutoSaveManager

Componente invisible que:
- Detecta cambios
- Aplica debounce
- Guarda automáticamente
- Muestra advertencia al cerrar con cambios

---

## Migración desde Versión Anterior

Si tienes bots creados con la versión anterior (sin sistema de proyectos):

1. Crear nuevo proyecto
2. Crear bot dentro del proyecto
3. Importar DSL del bot anterior (Export/Import)
4. Guardar

---

## Preguntas Frecuentes

### ¿Dónde se guardan los proyectos?
En la ubicación que elijas al crear el proyecto. Puedes usar cualquier carpeta.

### ¿Se puede usar con Git?
Sí. La estructura está diseñada para control de versiones:
- `.skuldbot/cache/` y `env.local` están en `.gitignore`
- Los archivos `.json` son legibles y mergeables

### ¿Cuántos bots puede tener un proyecto?
No hay límite técnico. El límite práctico depende de tu hardware.

### ¿Se sincronizan los proyectos en la nube?
Actualmente no. Usa tu propio sistema (Git, Dropbox, etc.) para sincronizar la carpeta del proyecto.

### ¿Puedo usar el mismo bot en múltiples proyectos?
No directamente. Puedes duplicar el bot o usar la carpeta `shared/` para código común.

---

## Soporte

Para soporte técnico:
- Email: support@skuld.io
- Documentación: https://docs.skuld.io

---

## RPA + IA: El Futuro de la Automatización

SkuldBot no es solo otra herramienta de RPA. Es una plataforma de **automatización inteligente** que combina lo mejor de dos mundos:

### Capacidades RPA
- Automatización web (navegación, scraping, formularios)
- Automatización de desktop (Windows, macOS)
- Procesamiento de archivos (Excel, PDF, CSV)
- Integración con APIs y bases de datos
- Email y notificaciones

### Capacidades de IA
- **Procesamiento de Lenguaje Natural (NLP)**: Extraer información de textos no estructurados
- **Visión por Computadora**: OCR inteligente, clasificación de imágenes
- **Toma de Decisiones**: Modelos de ML para routing inteligente
- **Generación de Contenido**: Crear respuestas, reportes, resúmenes
- **Integración con LLMs**: OpenAI, Claude, modelos locales

### Casos de Uso

| Escenario | RPA Solo | RPA + IA |
|-----------|----------|----------|
| Extraer datos de facturas | Campos fijos | Cualquier formato |
| Clasificar emails | Por reglas | Por intención |
| Responder consultas | Templates | Respuestas personalizadas |
| Procesar documentos | Estructurados | Cualquier documento |
| Validar información | Reglas estáticas | Validación semántica |

---

**SkuldBot Studio** - All Rights Reserved
**Skuld, LLC** - An Asgard Insight company

*Plataforma de Automatización Inteligente RPA + IA*

Versión: 0.1.0
Última actualización: Diciembre 2025
