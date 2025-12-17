# Análisis de Diseño - Nexion (Referencia de buen gusto)

## 🎯 Principios que aplican

### 1. WHITE SPACE ES REY
- Padding generoso: 24px, 32px, 48px
- Gaps entre elementos: 16px, 24px
- Margins entre secciones: 32px, 48px
- NO llenar cada pixel

### 2. JERARQUÍA CON PESO, NO TAMAÑO
- Títulos: font-semibold (600)
- Labels: font-medium (500)
- Body: font-normal (400)
- Meta: font-normal (400) + text-gray-500

### 3. COLORES MUY LIMITADOS
```
Primary: Un solo azul
  - Botón principal
  - Links activos
  - Iconos importantes

Grises: Solo 3 tonos
  - gray-900: Texto principal
  - gray-500: Texto secundario
  - gray-300: Borders

Semánticos: Solo cuando necesario
  - Red: Destructivo
  - Green: Success
```

### 4. BOTONES LIMPIOS
```css
Primary:
  bg-primary-600
  text-white
  px-6 py-2.5
  rounded-lg
  shadow-sm
  font-medium text-sm

Secondary:
  bg-white
  border border-primary-600
  text-primary-600
  px-6 py-2.5
  rounded-lg
  font-medium text-sm

Ghost:
  bg-transparent
  text-gray-700
  px-3 py-2
  rounded-lg
  hover:bg-gray-100
```

### 5. SIDEBAR CORRECTO
- Fondo BLANCO (no gris)
- Border sutil gray-200
- Collapsed: Tab delgada (40px wide max)
- Expanded: 280-320px
- Items: No borders, solo hover:bg-gray-50

### 6. ICONOGRAFÍA
- Mismo set (Lucide, Heroicons, etc)
- Tamaño consistente: 16px o 18px
- strokeWidth: 2
- Color: Heredan del texto

### 7. EMPTY STATES
- Icono grande centrado (64px+)
- Texto explicativo claro
- Sin borders
- Mucho padding (80px+)

---

## 🚫 Errores que estaba cometiendo

❌ Borders en todo  
❌ Grises muy saturados  
❌ Spacing inconsistente  
❌ Sidebar gris feo  
❌ Botones muy densos  
❌ Sin suficiente white space  
❌ Demasiados colores  

---

## ✅ Reglas para Skuldbot Studio

### Toolbar
```
Height: 64px
Padding: 0 24px
Background: white
Border-bottom: 1px solid gray-200
Shadow: NINGUNO

Logo: 32x32px + text-base font-semibold
Gap entre secciones: 24px
Botones: px-6 py-2.5
```

### Sidebar
```
Collapsed: 40px tab flotante
Expanded: 280px
Background: WHITE
Border: 1px solid gray-200
Padding: 24px

Header: 64px alto, px-24px
Items: NO borders, hover:bg-gray-50
```

### Canvas
```
Background: gray-50 o white
Padding: 48px
```

### Nodes
```
Background: white
Border: 2px solid gray-300
Shadow: md (clara separación)
Padding: 16px
Min-width: 220px
Rounded: 8px

Selected:
  border-primary-600
  shadow-lg
```

### Logs Panel
```
Background: gray-900 (contraste)
Text: gray-100
Height collapsed: 48px
Height open: 280px
```

---

**APLICAR RELIGIOSAMENTE**


