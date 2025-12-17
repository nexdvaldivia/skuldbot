# 🎨 Skuldbot Studio - Design System

**REGLA DE ORO**: Todo el diseño DEBE seguir los principios de **Refactoring UI**

---

## 📐 Principios de Refactoring UI (EN ROCA)

### 1. Jerarquía Visual > Todo lo demás
- **No todo merece la misma atención**
- Usa peso (font-weight), color y tamaño para crear jerarquía
- De-enfatizar es tan importante como enfatizar

### 2. Sistema de Espaciado Consistente
```css
/* Escala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 */
spacing: {
  xs: 4px,
  sm: 8px,
  md: 16px,
  lg: 24px,
  xl: 32px,
  2xl: 48px,
  3xl: 64px,
}
```

### 3. Paleta de Colores Limitada
- 1 color primario (5-10 shades)
- Grises (8-10 shades)
- Colores de acento (2-3 máximo)
- Colores semánticos (success, warning, error)

### 4. Tipografía con Propósito
```css
/* Scale: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72 */
text-xs: 12px
text-sm: 14px
text-base: 16px
text-lg: 18px
text-xl: 20px
text-2xl: 24px
```

**Font Weights**: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

### 5. Sombras para Profundidad
```css
shadow-sm: 0 1px 2px rgba(0,0,0,0.05)
shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)
shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)
shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)
```

### 6. Colores con Significado
- **NO uses texto gris sobre fondos de color**
- Usa transparencia: rgba(255,255,255,0.9)
- Contraste mínimo: 4.5:1 para texto

### 7. Elementos Superpuestos
- Usa z-index consistente
- Sombras para elevar elementos
- Overlap crea jerarquía

### 8. Empieza con MUCHO White Space
- Es más fácil reducir que agregar
- El espacio es gratis, úsalo

### 9. Los Labels son el ÚLTIMO recurso
- Usa placeholders
- Usa iconos
- Usa contexto visual

### 10. Tamaño No es Todo
- Color y contraste son igual de importantes
- Font weight cambia la jerarquía
- Spacing crea grupos

---

## 🎨 Sistema de Color (Skuldbot)

### Primario (Verde Skuldbot)
```css
primary-50: #f0fdf4
primary-100: #dcfce7
primary-200: #bbf7d0
primary-300: #86efac
primary-400: #4ade80
primary-500: #22c55e  /* Base */
primary-600: #16a34a
primary-700: #15803d
primary-800: #166534
primary-900: #14532d
```

### Grises (Neutrales)
```css
gray-50: #f9fafb
gray-100: #f3f4f6
gray-200: #e5e7eb
gray-300: #d1d5db
gray-400: #9ca3af
gray-500: #6b7280
gray-600: #4b5563
gray-700: #374151
gray-800: #1f2937
gray-900: #111827
```

### Semánticos
```css
success: #10b981
warning: #f59e0b
error: #ef4444
info: #3b82f6
```

---

## 📏 Spacing Scale

```css
0: 0px
1: 4px
2: 8px
3: 12px
4: 16px
5: 20px
6: 24px
8: 32px
10: 40px
12: 48px
16: 64px
20: 80px
24: 96px
32: 128px
```

---

## ✍️ Typography Scale

### Font Family
```css
sans: Inter, -apple-system, system-ui, sans-serif
mono: 'Fira Code', 'SF Mono', Consolas, monospace
```

### Sizes
```css
text-xs: 12px / line-height: 16px
text-sm: 14px / line-height: 20px
text-base: 16px / line-height: 24px
text-lg: 18px / line-height: 28px
text-xl: 20px / line-height: 28px
text-2xl: 24px / line-height: 32px
text-3xl: 30px / line-height: 36px
```

### Weights
```css
font-normal: 400
font-medium: 500
font-semibold: 600
font-bold: 700
```

---

## 🎭 Component Guidelines

### Buttons

**Primary (CTA)**
```css
bg: primary-600
text: white
padding: 12px 24px
font: semibold, 14px
shadow: shadow-sm
hover: primary-700
```

**Secondary**
```css
bg: gray-100
text: gray-900
padding: 12px 24px
font: medium, 14px
hover: gray-200
```

**Ghost**
```css
bg: transparent
text: gray-700
padding: 8px 16px
font: medium, 14px
hover: gray-100
```

### Cards
```css
bg: white
border: 1px solid gray-200
border-radius: 8px
padding: 24px
shadow: shadow-sm
```

### Inputs
```css
bg: white
border: 1px solid gray-300
border-radius: 6px
padding: 10px 12px
font: 14px
focus: border-primary-500, ring-2 ring-primary-100
```

### Panels
```css
bg: gray-50
border: 1px solid gray-200
padding: 16px
```

---

## 🚫 NO HACER

❌ Usar múltiples font families  
❌ Espaciado arbitrario (usa la escala)  
❌ Colores fuera del sistema  
❌ Grises sobre colores  
❌ Labels innecesarios  
❌ Borders gruesos (max 2px)  
❌ Corner radius inconsistente  
❌ Iconos de diferentes sets  
❌ Sombras sin propósito  
❌ Animaciones sin sentido  

---

## ✅ SÍ HACER

✅ Usa la escala de espaciado religiosamente  
✅ Limita tu paleta (max 3 colores + grises)  
✅ Crea jerarquía con peso, no tamaño  
✅ Usa sombras para elevar  
✅ Overlap elementos relacionados  
✅ White space generoso  
✅ Consistencia en corner radius  
✅ Iconos del mismo set (Lucide)  
✅ Transiciones suaves (150-200ms)  
✅ Mobile-first thinking  

---

## 📱 Layout Principles

### Grid
- Max width: 1440px
- Sidebar: 280px (fixed)
- Content: fluid
- Gutter: 24px

### Z-Index Scale
```css
z-base: 0
z-dropdown: 10
z-sticky: 20
z-fixed: 30
z-modal-backdrop: 40
z-modal: 50
z-popover: 60
z-tooltip: 70
```

### Border Radius
```css
rounded-sm: 4px
rounded: 6px
rounded-md: 8px
rounded-lg: 12px
rounded-full: 9999px
```

---

## 🎯 Aplicación en Skuldbot Studio

### Toolbar
- Height: 64px (no 16)
- Padding horizontal: 24px
- Logo: font-bold, text-xl
- Buttons: Usar escala definida
- Shadow: shadow-sm

### Sidebar
- Width: 280px
- Padding: 16px
- Background: gray-50
- Sections: mb-6
- Items: py-2 px-3

### Canvas
- Background: gray-50
- Grid: dots sutiles gray-300

### Logs Panel
- Height: 256px (collapsed: 40px)
- Background: gray-900
- Text: gray-100
- Font: mono, text-sm
- Padding: 16px

### Toasts
- Width: 360px
- Padding: 16px
- Shadow: shadow-lg
- Border radius: rounded-lg
- Icon size: 20px
- Font: text-sm

---

## 🔧 Tailwind Config

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { /* verde skuldbot */ },
        gray: { /* escala definida */ },
      },
      spacing: {
        /* escala 4, 8, 12, 16... */
      },
      fontSize: {
        /* escala definida */
      },
      fontWeight: {
        /* 400, 500, 600, 700 */
      },
      boxShadow: {
        /* sombras definidas */
      },
      borderRadius: {
        /* radios consistentes */
      },
    },
  },
}
```

---

**ESTE DOCUMENTO ES LEY**

Cualquier cambio visual DEBE consultarse contra estos principios.

NO improvisemos. NO seamos inconsistentes.

**Refactoring UI o nada.** 🎨


