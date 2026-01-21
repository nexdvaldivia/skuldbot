# Skuld Design System
## Basado en principios de Refactoring UI

> **REGLA DE ORO**: Todo el diseño DEBE seguir los principios de **Refactoring UI**

---

## Productos

| Producto | Primario | Uso |
|----------|----------|-----|
| **Studio** | Brand Emerald `#35D399` | Editor de bots (desktop) |
| **Control Plane** | Indigo `#4f46e5` | Gestión de clientes/licencias (web) |
| **Orchestrator** | Indigo `#4f46e5` | Dashboard de operaciones (web) |

---

## Paleta de Colores

### Indigo - Primary UI Color
**Uso**: Botones, links, estados activos, focus rings

```css
--indigo-50:  #eef2ff   /* Backgrounds muy sutiles */
--indigo-100: #e0e7ff   /* Backgrounds seleccionados */
--indigo-200: #c7d2fe   /* Borders activos */
--indigo-300: #a5b4fc   /* Iconos deshabilitados */
--indigo-400: #818cf8   /* Hover light mode */
--indigo-500: #6366f1   /* Primary dark mode */
--indigo-600: #4f46e5   /* PRIMARY LIGHT MODE */
--indigo-700: #4338ca   /* Hover/pressed */
--indigo-800: #3730a3   /* Texto sobre fondo claro */
--indigo-900: #312e81   /* Headings emphasis */
--indigo-950: #1e1b4b   /* Backgrounds oscuros */
```

### Brand Emerald - Logo & Identity
**Uso**: Logo, éxito, acentos de marca, Studio primary

```css
--brand-50:  #ecfdf5   /* Success backgrounds */
--brand-100: #d1fae5   /* Success hover */
--brand-200: #a7f3d0   /* Success light borders */
--brand-300: #6ee7b7   /* Icons success */
--brand-400: #35d399   /* PRIMARY BRAND COLOR */
--brand-500: #10b981   /* Hover */
--brand-600: #059669   /* Pressed */
--brand-700: #047857   /* Dark backgrounds */
--brand-800: #065f46   /* Very dark */
--brand-900: #064e3b   /* Near black */
--brand-950: #022c22   /* Darkest */
```

### Zinc - Neutral Colors
**Uso**: Backgrounds, texto, borders, cards

```css
--zinc-50:  #fafafa    /* Page background light */
--zinc-100: #f4f4f5    /* Card backgrounds */
--zinc-200: #e4e4e7    /* Borders, dividers */
--zinc-300: #d4d4d8    /* Disabled borders */
--zinc-400: #a1a1aa    /* Placeholder text */
--zinc-500: #71717a    /* Secondary text */
--zinc-600: #52525b    /* Labels, captions */
--zinc-700: #3f3f46    /* Body text dark mode */
--zinc-800: #27272a    /* Card dark mode */
--zinc-900: #18181b    /* Primary text, sidebar */
--zinc-950: #09090b    /* Page background dark */
```

### Status Colors

#### Success (Uses Brand Emerald)
```css
--success-50:  #ecfdf5
--success-100: #d1fae5
--success-500: #35d399   /* Default */
--success-600: #10b981   /* Hover */
--success-700: #059669   /* Pressed */
```

#### Warning (Amber)
```css
--warning-50:  #fffbeb
--warning-100: #fef3c7
--warning-400: #fbbf24
--warning-500: #f59e0b   /* Default */
--warning-600: #d97706   /* Hover */
```

#### Error (Red)
```css
--error-50:  #fef2f2
--error-100: #fee2e2
--error-400: #f87171
--error-500: #ef4444   /* Default */
--error-600: #dc2626   /* Hover */
```

#### Info (Sky)
```css
--info-50:  #f0f9ff
--info-100: #e0f2fe
--info-400: #38bdf8
--info-500: #0ea5e9   /* Default */
--info-600: #0284c7   /* Hover */
```

---

## Principios de Refactoring UI

### 1. Jerarquía Visual > Todo lo demás
- **No todo merece la misma atención**
- Usa peso (font-weight), color y tamaño para crear jerarquía
- De-enfatizar es tan importante como enfatizar

```
Nivel 1 (Más importante):
- font-semibold (600)
- text-zinc-900
- Puede ser más grande

Nivel 2:
- font-medium (500)
- text-zinc-900
- Tamaño normal

Nivel 3:
- font-normal (400)
- text-zinc-600
- Puede ser más pequeño

Nivel 4 (Meta):
- font-normal (400)
- text-zinc-500
- text-xs o text-sm
```

### 2. Sistema de Espaciado Consistente

**SOLO usar estos valores:**

```css
4px  = 1   (casi nunca)
8px  = 2
12px = 3
16px = 4   ★ BASE
24px = 6   ★ COMÚN
32px = 8
48px = 12
64px = 16
96px = 24
```

**Aplicación:**
- Entre secciones: 24px o 32px
- Dentro de componentes: 16px o 24px
- Padding de botones: 12px-16px horizontal, 8px-10px vertical

### 3. Typography Scale

**Font Family:**
```css
--font-sans: 'Montserrat', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

**Sizes:**
```css
text-xs:   12px / line-height: 16px   (labels, meta)
text-sm:   14px / line-height: 20px   ★ (body, botones)
text-base: 16px / line-height: 24px   ★ (headings pequeños)
text-lg:   18px / line-height: 28px   (headings)
text-xl:   20px / line-height: 28px   (títulos)
text-2xl:  24px / line-height: 32px   (títulos grandes)
text-3xl:  30px / line-height: 36px   (hero)
```

**Weights:**
```css
font-normal:   400   (texto normal)
font-medium:   500   ★ (botones, énfasis leve)
font-semibold: 600   ★ (headings)
font-bold:     700   (títulos principales)
```

### 4. Shadows para Profundidad

```css
/* Elevation 1 - Cards */
shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);

/* Elevation 2 - Dropdowns, popovers */
shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05);

/* Elevation 3 - Modals */
shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);

/* Elevation 4 - Floating elements */
shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1), 0 8px 10px rgba(0, 0, 0, 0.04);
```

**NO usar shadow en todo!** Solo para elevar elementos.

### 5. Border Radius Consistente

```css
--radius-sm:   4px    (badges, chips)
--radius-md:   6px    (inputs)
--radius-lg:   8px    ★ (cards, botones)
--radius-xl:   12px   (modals)
--radius-full: 9999px (avatars, pills)
```

### 6. Menos Borders

```
❌ NO: border en cada elemento
✅ SÍ: usar shadows y spacing
```

**Cuando usar border:**
- Inputs (necesitan definición)
- Cards sobre fondo blanco (border-zinc-200)
- Separadores sutiles

**Border weight:** 1px siempre

### 7. White Space Generoso
- Es más fácil reducir que agregar
- El espacio es gratis, úsalo

### 8. Labels son el ÚLTIMO recurso
- Usa placeholders
- Usa iconos
- Usa contexto visual

### 9. Colores con Significado
- **NO uses texto gris sobre fondos de color**
- Usa transparencia cuando sea necesario
- Contraste mínimo: 4.5:1 para texto

---

## Component Guidelines

### Buttons

**Primary (CTA)**
```css
bg: indigo-600
text: white
padding: py-2.5 px-6 (10px 24px)
font: font-medium text-sm
shadow: shadow-sm
hover: indigo-700
border-radius: rounded-lg (8px)
```

**Secondary**
```css
bg: white
text: zinc-700
border: 1px solid zinc-300
padding: py-2.5 px-6
font: font-medium text-sm
hover: bg-zinc-50
border-radius: rounded-lg
```

**Ghost**
```css
bg: transparent
text: zinc-700
padding: py-2 px-4
font: font-medium text-sm
hover: bg-zinc-100
border-radius: rounded-lg
```

**Destructive**
```css
bg: error-500 (#ef4444)
text: white
padding: py-2.5 px-6
font: font-medium text-sm
hover: error-600
border-radius: rounded-lg
```

**Success**
```css
bg: brand-400 (#35d399)
text: white
padding: py-2.5 px-6
font: font-medium text-sm
hover: brand-500
border-radius: rounded-lg
```

### Cards

```css
bg: white
border: 1px solid zinc-200
border-radius: rounded-lg (8px)
padding: p-6 (24px)
shadow: shadow-sm (hover: shadow-md)
```

### Inputs

```css
bg: white
border: 1px solid zinc-300
border-radius: rounded-md (6px)
padding: py-2.5 px-3 (10px 12px)
font: text-sm
height: h-10 (40px)
focus: border-indigo-500, ring-2 ring-indigo-100
placeholder: text-zinc-400
```

### Sidebar (Dark)

```css
width: 256px (w-64)
bg: zinc-900
border-right: none (usar separación visual)

/* Logo section */
height: 64px
padding: px-6
border-bottom: 1px solid zinc-800

/* Navigation items */
padding: px-3 py-2
border-radius: rounded-lg
text: zinc-400
hover: bg-zinc-800, text-white
active: bg-indigo-500/10, text-indigo-400

/* User section */
border-top: 1px solid zinc-800
padding: p-4
```

### Toolbar

```css
height: 64px
padding: px-6
bg: white
border-bottom: 1px solid zinc-200
shadow: none (border es suficiente)
```

### Tables

```css
/* Header */
bg: zinc-50
text: zinc-600 font-medium text-xs uppercase tracking-wider
padding: px-6 py-3

/* Rows */
bg: white
border-bottom: 1px solid zinc-200
padding: px-6 py-4
hover: bg-zinc-50

/* Cells */
text: zinc-900 text-sm
```

### Modals

```css
bg: white
border-radius: rounded-xl (12px)
shadow: shadow-xl
max-width: max-w-md (448px) o max-w-lg (512px)
padding: p-6

/* Backdrop */
bg: rgba(0, 0, 0, 0.5)
backdrop-filter: blur(4px)
```

### Badges

```css
/* Default */
bg: zinc-100
text: zinc-700
padding: px-2.5 py-0.5
font: text-xs font-medium
border-radius: rounded-full

/* Success */
bg: brand-50
text: brand-700

/* Warning */
bg: warning-50
text: warning-700

/* Error */
bg: error-50
text: error-700

/* Primary */
bg: indigo-50
text: indigo-700
```

### Alerts/Toasts

```css
width: 360px (toast) o 100% (alert)
padding: p-4
border-radius: rounded-lg
shadow: shadow-lg (toast)

/* Success */
bg: brand-50
border-left: 4px solid brand-400
text: brand-800

/* Error */
bg: error-50
border-left: 4px solid error-500
text: error-800

/* Warning */
bg: warning-50
border-left: 4px solid warning-500
text: warning-800

/* Info */
bg: info-50
border-left: 4px solid info-500
text: info-800
```

---

## Z-Index Scale

```css
z-base:           0
z-dropdown:       10
z-sticky:         20
z-fixed:          30
z-modal-backdrop: 40
z-modal:          50
z-popover:        60
z-tooltip:        70
```

---

## Layout Dimensions

### Control Plane / Orchestrator
```css
sidebar: 256px (w-64)
content: fluid
max-content: 1440px
header-height: 64px
```

### Breakpoints
```css
sm:  640px
md:  768px
lg:  1024px
xl:  1280px
2xl: 1536px
```

---

## Animaciones

```css
/* Transiciones suaves */
transition-all duration-150  (rápido: hover, focus)
transition-all duration-200  (normal: mostrar/ocultar)
transition-all duration-300  (lento: modales, sidebars)

/* Easing */
ease-out (entrada)
ease-in-out (transformaciones)
```

---

## Iconos

**Set:** Lucide React (https://lucide.dev)

**Tamaños por contexto:**
```css
/* En texto */
h-4 w-4  (16px)

/* En botones */
h-4 w-4  (16px) con mr-2

/* Standalone pequeño */
h-5 w-5  (20px)

/* Standalone grande */
h-6 w-6  (24px)

/* Feature icons */
h-8 w-8  (32px)
```

---

## Prohibido

- ❌ Spacing arbitrario (solo usar escala)
- ❌ Borders de más de 1px
- ❌ Shadows sin propósito
- ❌ Más de 3 colores (excepto semánticos)
- ❌ Font sizes fuera de escala
- ❌ Text gris sobre colores
- ❌ Labels cuando no son necesarios
- ❌ Iconos de diferentes tamaños sin razón
- ❌ Múltiples font families
- ❌ Corner radius inconsistente

---

## Obligatorio

- ✅ Spacing de la escala religiosamente
- ✅ Jerarquía con weight y color, no solo tamaño
- ✅ White space generoso
- ✅ Shadows solo para elevar
- ✅ Borders sutiles (zinc-200 o zinc-300)
- ✅ Color palette limitada
- ✅ Typography scale consistente
- ✅ Iconos del mismo set (Lucide)
- ✅ Transiciones suaves (150-200ms)
- ✅ Mobile-first thinking

---

## Implementación por Producto

### Control Plane
- Primary: Indigo
- Sidebar: Dark (zinc-900)
- Usarlo para gestión interna

### Orchestrator
- Primary: Indigo
- Sidebar: Dark (zinc-900)
- Dashboard del cliente

### Studio (Desktop)
- Primary: Brand Emerald (#35d399)
- Light theme por defecto
- Canvas con grid dots

### Marketing Web
- Primary: Brand Emerald (#35d399)
- Gradientes sutiles
- Hero sections con glass morphism

---

**ESTE DOCUMENTO ES LEY**

Cualquier cambio visual DEBE consultarse contra estos principios.

NO improvisemos. NO seamos inconsistentes.

**Refactoring UI o nada.**
