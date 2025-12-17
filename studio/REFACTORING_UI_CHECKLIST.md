# Refactoring UI - Checklist Real

## ❌ Problemas Actuales (siendo honesto)

1. **Spacing inconsistente**
   - ❌ Uso px-3, px-4 sin razón clara
   - ❌ No hay ritmo vertical consistente

2. **Demasiados colores**
   - ❌ Borders en todos lados
   - ❌ Múltiples grises sin sistema

3. **Sin jerarquía clara**
   - ❌ Todo tiene el mismo peso visual
   - ❌ No se sabe qué es importante

4. **Shadows inconsistentes**
   - ❌ Algunos elementos con shadow, otros no
   - ❌ No crean profundidad real

5. **Typography débil**
   - ❌ Font sizes sin escala clara
   - ❌ Weights no crean jerarquía

## ✅ LO QUE VOY A HACER AHORA

### 1. Definir Sistema de Spacing (en roca)
```
SOLO usar estos valores:
4px  = 0.5 (casi nunca)
8px  = 2
12px = 3
16px = 4 ⭐ BASE
24px = 6 ⭐ COMÚN
32px = 8
48px = 12
64px = 16
```

### 2. Paleta de Colores LIMITADA
```
PRIMARY (Verde Skuldbot):
- 600: #16a34a (principal)
- 700: #15803d (hover)
- 50: #f0fdf4 (backgrounds)

GRISES (solo 4 tonos):
- 900: #111827 (texto principal)
- 600: #4b5563 (texto secundario)
- 300: #d1d5db (borders sutiles)
- 100: #f3f4f6 (backgrounds)

SEMÁNTICOS:
- Success: #10b981
- Error: #ef4444
- Warning: #f59e0b
```

### 3. Typography Scale
```
text-xs:   12px (labels, meta)
text-sm:   14px ⭐ (body, botones)
text-base: 16px ⭐ (headings pequeños)
text-lg:   18px (headings)
text-xl:   20px (títulos grandes)

Weights:
- 400: texto normal
- 500: ⭐ botones, énfasis leve
- 600: ⭐ headings
- 700: títulos principales
```

### 4. Jerarquía Visual Real
```
Nivel 1 (más importante):
- font-semibold (600)
- text-gray-900
- Puede ser más grande

Nivel 2:
- font-medium (500)
- text-gray-900
- Tamaño normal

Nivel 3:
- font-normal (400)
- text-gray-600
- Puede ser más pequeño

Nivel 4 (meta):
- font-normal (400)
- text-gray-500 o text-gray-400
- text-xs o text-sm
```

### 5. Shadows para Profundidad
```
Elevation 1 (cards):
shadow-sm: subtle lift

Elevation 2 (dropdowns):
shadow-md: clear separation

Elevation 3 (modals):
shadow-lg: clear hierarchy

NO usar shadow en todo!
```

### 6. Menos Borders
```
❌ NO: border en cada elemento
✅ SÍ: usar shadows y spacing

Cuando usar border:
- Inputs (necesitan definición)
- Cards sobre fondo blanco (border-gray-200)
- Separadores sutiles

Border weight: 1px siempre
```

### 7. White Space Generoso
```
Entre secciones: 24px o 32px
Dentro de componentes: 16px o 24px
Padding de botones: 12px-16px horizontal, 8px-10px vertical
```

## 🎯 REDISEÑO ESPECÍFICO

### Toolbar
```
Height: 64px (no 16, da espacio)
Padding horizontal: 24px
Background: white
Border-bottom: 1px solid gray-200
Shadow: NINGUNO (border es suficiente)

Logo:
- Size: 32x32px o 40x40px
- Gap con texto: 12px

Botón Primary (Ejecutar):
- bg-primary-600
- text-white
- px-6 py-2.5 (generous)
- text-sm font-medium
- rounded-lg (8px)
- shadow-sm
- hover:bg-primary-700

Botón Secondary (Compilar):
- bg-white
- text-gray-700
- border border-gray-300
- px-6 py-2.5
- text-sm font-medium
- rounded-lg
- hover:bg-gray-50

Botones Icon-only:
- p-2.5 (10px)
- text-gray-600
- rounded-lg
- hover:bg-gray-100
```

### Sidebar
```
Width: 280px (generous)
Background: gray-50 (subtle)
Border-right: 1px solid gray-200
Padding: 24px

Section headers:
- text-xs font-semibold
- text-gray-500 (not gray-700!)
- uppercase tracking-wider
- mb-3

Node cards:
- bg-white
- border border-gray-200
- rounded-lg (8px)
- p-3
- hover:border-primary-500
- hover:shadow-sm (elevation)
- NO shadow por defecto

Node icon container:
- 32x32px
- bg-gray-100
- rounded-md (6px)
- Icono 16px
```

### Canvas Nodes
```
Min-width: 220px (generous)
Background: white
Border: 2px solid gray-300
rounded-lg (8px)
shadow-md (clara separación del canvas)
padding: 16px

Selected:
- border-primary-500
- shadow-lg

Header icon:
- 32x32px
- bg-{color}-50
- border border-{color}-200
- rounded-md
- Icono 16px

Title:
- text-sm font-semibold text-gray-900

Subtitle (node type):
- text-xs text-gray-500 font-mono

Config preview:
- mt-3 pt-3
- border-t border-gray-100
- text-xs text-gray-600
```

### Logs Panel
```
Height collapsed: 48px
Height open: 280px
Background: gray-900 (dark contrast)
Text: gray-100
Border-top: 1px solid gray-700

Header:
- p-3
- Border-bottom: 1px solid gray-700

Log entries:
- p-2 rounded-md
- bg-{color}-900/20 (transparente sobre dark)
- text-{color}-200
```

## 🚫 PROHIBIDO

- ❌ Spacing arbitrario (solo usar escala)
- ❌ Borders de más de 1px
- ❌ Shadows sin propósito
- ❌ Más de 3 colores (excepto semánticos)
- ❌ Font sizes fuera de escala
- ❌ Text-gray-700 sobre colores
- ❌ Labels cuando no son necesarios
- ❌ Iconos de diferentes tamaños sin razón

## ✅ OBLIGATORIO

- ✅ Spacing de la escala religiosamente
- ✅ Jerarquía con weight y color, no solo tamaño
- ✅ White space generoso (luego reduce)
- ✅ Shadows solo para elevar
- ✅ Borders sutiles (gray-200 o gray-300)
- ✅ Color palette limitada
- ✅ Typography scale consistente
- ✅ Iconos del mismo set (Lucide), mismo size por contexto

---

**AHORA SÍ voy a seguir esto**


