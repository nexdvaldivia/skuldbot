# Studio Edge Behavior (Enterprise)

## Objetivo
Definir un comportamiento único, predecible y mantenible para conexiones (`edges`) en el Studio, evitando regresiones visuales y rutas caóticas.

## Principios
1. Legibilidad primero: el flujo debe entenderse en segundos.
2. Consistencia visual: mismo lenguaje de líneas, animación y color.
3. Edición controlada: el modo manual solo existe cuando el usuario lo activa.
4. Estabilidad al mover nodos: el auto-enrutado debe evitar superposición innecesaria.

## Reglas de Render
1. Todos los edges se dibujan con trazo redondeado y línea punteada animada.
2. El color depende del tipo semántico (`success`, `error`, etc.) o del color de origen.
3. El path por defecto usa enrutado ortogonal (`smoothstep`) con radio consistente.
4. El path manual usa enrutado ortogonal editable y persiste en DSL.

## Reglas de Auto-Enrutado
1. Solo los edges de flujo (`success`, `error`, `connection`) participan en `lane bundling`.
2. El bundling se calcula por grupo: `(target, targetHandle, edgeType)`.
3. Dentro del grupo, se ordena por posición Y del nodo origen.
4. Cada edge recibe un `lane offset` vertical centrado para reducir solape.
5. En edges `error`, el enrutado aplica sesgo horizontal hacia el target para evitar curvas largas “abiertas”.

## Reglas de Enrutado Manual
1. Un edge es manual solo si `route.manual === true`.
2. Rutas históricas sin `manual: true` no se consideran manuales.
3. El usuario puede:
   - habilitar routing manual,
   - mover eje X o Y con handles dedicados,
   - resetear a auto-enrutado.
4. La tolerancia de fusión por alineación es configurable desde Settings (`Edge Routing > Segment Merge Tolerance`).

## Criterios de Aceptación
1. No desaparecen las líneas punteadas animadas.
2. No aparecen handles de edición en edges no manuales.
3. Con múltiples edges al mismo target, el solape se reduce visualmente.
4. Build y pruebas del Studio pasan sin errores.

## Guardrails para cambios futuros
1. No cambiar estilo de edge sin actualizar este documento.
2. No mezclar en el mismo PR cambios de estilo + cambios de algoritmo sin pruebas.
3. Toda persistencia de routing debe mantener compatibilidad con DSL existente.

## Referencias de literatura/práctica aplicada
1. yEd/yFiles: edición de segmentos ortogonales y ajuste interactivo de rutas.
2. GoJS: `OrthogonalLinkReshapingTool` y principios de reshape por segmento.
3. JointJS: `routers.orthogonal` con padding/point hints para estabilidad visual.
