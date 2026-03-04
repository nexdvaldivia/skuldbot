# Prompt Admin + Prompt Detail Page

## 1) Objetivo
Definir el diseño funcional enterprise de:
- `Prompt Admin Console` (operación interna: producto, compliance, monetización).
- `Prompt Detail Page` (cara comercial para conversión/ventas).

Este documento es la base para implementación en Fase 1 del roadmap.

---

## 2) Roles y permisos (RBAC)

Roles:
- `Skuld Super Admin`
- `Prompt Product Manager`
- `Prompt Engineer`
- `Compliance Officer`
- `Sales Ops`
- `Tenant Admin` (cliente)
- `Tenant Developer` (cliente)

Permisos clave:
- Crear/editar prompt draft: `Super Admin`, `Prompt Product Manager`, `Prompt Engineer`.
- Cambiar pricing/packaging: `Super Admin`, `Sales Ops`.
- Aprobar compliance/publicación: `Compliance Officer`, `Super Admin`.
- Publicar/despublicar: `Super Admin`, `Prompt Product Manager` (si compliance aprobado).
- Ver analytics comerciales: `Super Admin`, `Prompt Product Manager`, `Sales Ops`.
- Comprar/suscribir prompt: `Tenant Admin`.
- Usar prompt suscrito en Studio: `Tenant Admin`, `Tenant Developer`.

---

## 3) Prompt Admin Console (Backoffice)

## 3.1 Vista lista (inventory)
Objetivo: gestionar catálogo completo.

Columnas:
- `Prompt Name`
- `Prompt Key` (slug técnico)
- `Status` (`draft`, `in_review`, `approved`, `published`, `deprecated`, `blocked`)
- `Current Version`
- `Pricing Model` (`free`, `subscription`, `usage`, `hybrid`)
- `Category` / `Industry tags`
- `Last Updated By` + fecha
- `Adoption` (tenants activos 30d)
- `Revenue MTD`

Filtros:
- status, categoría, vertical, pricing, owner, fecha, compliance tier, riesgo.

Acciones masivas:
- cambiar categoría/tags,
- mover a revisión,
- deprecación programada,
- export CSV.

## 3.2 Vista detalle admin (editor)
Objetivo: gestionar un prompt de extremo a extremo.

Tabs:
1. `Overview`
- nombre comercial
- resumen corto
- propuesta de valor
- owner de producto

2. `Prompt Definition`
- `promptRef` base (`catalogId`, `version`)
- cuerpo del prompt (solo visible a roles internos autorizados)
- slots parametrizables permitidos (si `hybrid`)
- constraints de salida (`json_schema`, formato, idioma, max_tokens)

3. `Runtime & Guardrails`
- modelos permitidos
- temperatura/top_p defaults
- timeout/retries
- redaction policy
- bloqueo de campos sensibles en logs

4. `Pricing & Packaging`
- pricing model
- precio mensual y/o precio por uso
- trial days
- bundle/pack asociado
- plan recomendado

5. `Entitlements`
- licencias mínimas requeridas
- verticales habilitadas
- allowlist/denylist de tenants
- restricciones geográficas/regulatorias

6. `Compliance`
- clasificación (`low`, `moderate`, `high`)
- PHI/PII policy pack requerido
- controles obligatorios (masking, HITL, retention)
- checklist de aprobación

7. `Versions`
- historial de versiones
- changelog
- rollback
- estrategia de rollout (`manual`, `% progressive`)

8. `Analytics`
- adopción (tenants activos, attach rate)
- conversión trial -> pago
- calidad (success rate, correction rate)
- costo/ROI estimado

## 3.3 Flujo de estados
`draft -> in_review -> approved -> published -> deprecated`

Reglas:
- no se publica sin compliance aprobado.
- cambios de pricing en `published` generan nueva versión.
- deprecación exige plan de migración y fecha EOL.
- rollback solo a versión aprobada.

## 3.4 Auditoría obligatoria
Eventos auditables:
- create/update/delete prompt
- cambio de pricing
- cambio de entitlements
- publish/deprecate/rollback
- acceso a prompt body (interno)

Cada evento debe registrar:
- actor, rol, timestamp, diff, motivo, ticket/referencia.

---

## 4) Prompt Detail Page (Sales-facing)

## 4.1 Objetivo comercial
Maximizar conversión desde catálogo a suscripción/uso.

## 4.2 Secciones obligatorias
1. `Hero`
- nombre + tagline
- categoría
- CTA primario: `Start Trial` / `Subscribe`
- CTA secundario: `Use in Studio`

2. `Qué logra`
- resultados esperados con métricas (ej. reducción de tiempo, mejora de precisión)
- para qué casos sí/no aplica

3. `Cómo funciona`
- input esperado
- output JSON ejemplo
- pasos del flujo (nodo agente + conectores)

4. `Requisitos`
- licencias necesarias
- dependencias técnicas
- políticas requeridas (compliance/vault)

5. `Pricing`
- planes, consumo, mínimo mensual, trial
- estimador simple de costo

6. `Trust & Compliance`
- controles de seguridad
- trazabilidad/auditoría
- limitaciones y disclaimers

7. `Use Cases`
- ejemplos por industria (healthcare, insurance, finance, etc.)
- manteniendo posicionamiento universal

8. `FAQ`
- implementación, límites, soporte, facturación

9. `Versiones`
- versión actual, notas de release, compatibilidad

10. `Social Proof`
- testimonios/casos y métricas de impacto (si disponibles)

## 4.3 CTAs y embudo
Embudo mínimo:
- `view_prompt_detail`
- `click_start_trial`
- `click_subscribe`
- `subscription_created`
- `first_runtime_success`

KPIs:
- detail->trial conversion
- trial->paid conversion
- time-to-first-value
- churn 30/90 días

---

## 5) Modelo de datos mínimo

Entidades:
- `PromptCatalog`
- `PromptVersion`
- `PromptPricing`
- `PromptEntitlement`
- `PromptCompliancePolicy`
- `PromptSubscription`
- `PromptAnalyticsDaily`

Campos mínimos:
- `PromptCatalog`: id, slug, name, category, status, owner, visibility
- `PromptVersion`: version, body_encrypted, schema_json, changelog, approved_by
- `PromptPricing`: model, monthly_price, unit_price, currency, trial_days
- `PromptEntitlement`: tenant/license constraints, geo restrictions
- `PromptSubscription`: tenant_id, prompt_id, status, start/end, billing_ref

---

## 6) APIs (contrato funcional)

Admin APIs:
- `POST /api/prompts`
- `GET /api/prompts`
- `GET /api/prompts/:id`
- `PATCH /api/prompts/:id`
- `POST /api/prompts/:id/submit-review`
- `POST /api/prompts/:id/approve`
- `POST /api/prompts/:id/publish`
- `POST /api/prompts/:id/deprecate`
- `POST /api/prompts/:id/versions`
- `POST /api/prompts/:id/rollback`

Commercial APIs:
- `GET /api/prompt-catalog`
- `GET /api/prompt-catalog/:slug`
- `POST /api/prompt-catalog/:id/subscribe`
- `POST /api/prompt-catalog/:id/start-trial`

Runtime APIs:
- `POST /api/prompts/resolve` (input: `promptRef`, tenant context; output: token/payload runtime)
- `POST /api/prompts/usage` (metering por prompt/version/tenant)

---

## 7) UX/UI reglas críticas
- Nunca exponer prompt premium completo a roles de cliente.
- Mostrar valor de negocio antes que detalles técnicos en la página de venta.
- Mantener consistencia con marketplace existente (filtros, cards, detalle).
- Mobile-first para página detalle (decisión de compra también ocurre móvil).

---

## 8) Criterios de aceptación (Definition of Done)

Prompt Admin:
- Se puede crear prompt, versionarlo, aprobarlo y publicarlo con auditoría completa.
- No se permite `publish` sin checklist compliance en verde.
- Pricing y entitlements impactan disponibilidad en catálogo en tiempo real.

Prompt Detail:
- Renderiza contenido comercial completo desde metadata del prompt.
- CTA crea trial/suscripción funcional con trazabilidad de evento.
- Se muestran requisitos y limitaciones de forma explícita.

Runtime/IP:
- Studio puede usar `promptRef` en nodo agente.
- En runtime, prompt premium se resuelve sin exposición del body al cliente.
- Logs no contienen body de prompt ni secretos.

---

## 9) Entregable MVP (4-8 semanas)
- Admin lista + editor (sin A/B avanzado).
- Página detalle comercial completa.
- Flujo suscripción + entitlement básico.
- Resolución runtime por `promptRef`.
- Analytics base de conversión y uso.

## 10) Fase siguiente
- A/B testing de variantes.
- Recomendador de prompts por tipo de bot.
- Pricing dinámico por segmento.
- Multi-idioma comercial automático.
