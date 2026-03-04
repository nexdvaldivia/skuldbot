# Enterprise UI + Branding Non-Negotiables (Skuld)

Fecha: 2026-02-23  
Estado: obligatorio (sin excepcion por defecto)

## 1) Scope
Aplica a todo frontend y diseño de experiencia en:
- `studio`
- `control-plane/ui`
- `orchestrator/ui`
- `skuldbotweb/frontend`
- `docs-components`

## 2) Stack UI obligatorio
No negociable:
- Componentes: `shadcn/ui`
- Estilos: `Tailwind CSS`
- Utilidades de composición de clases: `clsx` + `tailwind-merge` (cuando aplique)

No permitido por defecto:
- introducir librerías de UI paralelas que rompan consistencia visual,
- CSS ad-hoc fuera del sistema de tokens cuando no sea estrictamente necesario.

## 3) Método de diseño obligatorio
No negociable:
- Seguir principios del libro **Refactoring UI** (Tailwind Labs) paso a paso.
- Priorizar jerarquía visual, espaciado consistente, contraste correcto y densidad enterprise.

Regla de implementación:
- primero estructura y jerarquía,
- luego spacing/typography,
- luego color/accent,
- luego estados y microinteracciones,
- luego accesibilidad y responsive.

## 4) Branding de Skuld (obligatorio)
No negociable:
- Color de marca principal: verde esmeralda de SkuldBot Studio.
- Usar tokens/paleta ya definida en el proyecto; no inventar una paleta paralela.
- Logo: usar exclusivamente logo oficial de SkuldBot.

Prohibido:
- crear o proponer logos alternativos,
- cambiar color de marca por otro “tema” sin aprobación explícita,
- mezclar branding de otras plataformas.

## 5) Estándar enterprise + go-to-market
Toda entrega de UI debe salir en calidad comercial.

Checklist mínimo obligatorio:
- responsive real (`mobile`, `tablet`, `desktop`),
- accesibilidad base (`focus`, `keyboard`, `labels`, contraste),
- estados completos (`loading`, `empty`, `error`, `success`),
- consistencia visual entre pantallas del mismo dominio,
- textos y CTAs listos para uso comercial,
- sin links/placeholders rotos en rutas críticas,
- sin “mock behavior” cuando la ruta ya debe operar con backend real.

## 6) Componentización y reuso obligatorio
No negociable:
- todo bloque UI reutilizable debe convertirse en componente compartido,
- no se permite implementar el mismo patrón visual/funcional dos veces en archivos distintos,
- antes de crear componente nuevo se debe revisar y reutilizar componentes existentes del dominio.

Regla práctica:
- si un patrón aparece en 2 pantallas o más, se extrae a componente reusable,
- variantes se resuelven por `props` (no por duplicación de markup),
- estilos comunes viven en tokens/utilidades compartidas.

## 7) Definition of Done para cambios UI
Un cambio UI no cierra si falta cualquiera de estos puntos:
- cumple stack obligatorio (`shadcn/ui` + Tailwind),
- cumple branding Skuld (emerald + logo oficial),
- cumple método Refactoring UI,
- cumple componentización/reuso (sin duplicación innecesaria),
- cumple calidad enterprise/go-to-market,
- documentación actualizada cuando el cambio modifica comportamiento visual o patrón reusable.

## 8) Excepciones
Solo se aceptan con aprobación explícita y documentada.

Si existe excepción:
- debe tener motivo técnico/comercial,
- mitigación concreta,
- fecha de expiración,
- ticket de seguimiento.
