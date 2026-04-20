# Lecciones de Nexion PLN-005 para SkuldBot

Fecha: 2026-04-17
Origen: PLN-005 — Unificación Enterprise Gate (Nexion)
Propósito: Documentar patrones de falla encontrados en Nexion para prevenirlos en SkuldBot

---

## Contexto

Nexion (plataforma hermana bajo la misma propiedad) ejecutó un plan de unificación enterprise
para resolver defectos acumulados en entitlements, instalación, UI, workers y deploys.
Los patrones de falla identificados son directamente aplicables a SkuldBot porque compartimos
arquitectura similar (control plane + orchestrator + runners, multi-cloud, industrias reguladas).

Este documento NO es un backlog. Es un catálogo de riesgos conocidos con mitigaciones obligatorias.

---

## 1. Contrato único de entitlement

### Problema en Nexion
Múltiples puntos de decisión dispersos para validar si un org/tenant tiene derecho a usar
una funcionalidad. Cada dominio (conectores, billing, marketplace, verticals, plugins, addons)
implementaba su propia validación con lógica inconsistente.

### Mitigación para SkuldBot
- Definir `validateEntitlement(tenantId, feature, capability, context)` como único punto de decisión.
- Centralizar en un servicio de entitlements que todos los módulos consumen.
- Nunca validar entitlements inline en controllers — siempre vía servicio centralizado.
- Aplica para: licencias, billing, marketplace, features por plan, addons.

### Cuándo aplicar
Sprint de Licenses + Billing (S3-10..S3-12) y Marketplace.

---

## 2. Error envelope estandarizado

### Problema en Nexion
Errores con formatos inconsistentes. Algunos retornaban solo `message`, otros un objeto parcial.
UI no podía mostrar remediation porque el backend no la incluía. Soporte no podía correlacionar
incidentes porque no había correlation_id.

### Mitigación para SkuldBot
Todo error de denegación (HTTP, API, UI, Workers) debe retornar:

```json
{
  "error_code": "CONTRACTS_TEMPLATE_NOT_PUBLISHED",
  "message": "Template must be published before sending for signature",
  "remediation": "Publish the template first via Templates > Publish",
  "correlation_id": "req-uuid-v4",
  "support_url": "https://docs.skuldbot.com/errors/CONTRACTS_TEMPLATE_NOT_PUBLISHED",
  "details": {}
}
```

### Implementación requerida
- Crear catálogo centralizado de error codes (enum o constantes).
- Cada módulo registra sus error codes en el catálogo.
- Nunca usar strings literales en throws — siempre referencia al catálogo.
- El catálogo se documenta automáticamente en docs.skuldbot.com/errors.

### Estado actual en SkuldBot
Los throws en contracts usan strings sueltos (`'CONTRACT_OTP_LOCKED'`, etc.).
Funciona, pero no hay catálogo, no hay remediation, no hay correlation_id.

### Cuándo aplicar
Antes del primer deploy a producción. Puede hacerse como refactor post-contracts.

---

## 3. Fail-closed estricto

### Problema en Nexion
Fallbacks silenciosos que enmascaraban fallas reales. Un conector sin entitlement seguía
funcionando con datos cacheados. Un worker fallaba pero el sistema "continuaba startup".
Legacy runtime paths ejecutaban código viejo sin que nadie lo supiera.

### Mitigación para SkuldBot
- Sin fallback silencioso en paths de seguridad o entitlement.
- Provider fallback chain está bien para disponibilidad (SendGrid → SMTP), pero DEBE generar
  audit event, no solo warning log.
- Si un path crítico falla, el sistema debe detenerse con error explícito.
- Startup debe fallar si secretos no están configurados (ya implementado en OTP secret).

### Estado actual en SkuldBot
- OTP secret: fail-fast si insecure default ✅
- Provider fallback: logs warning pero NO genera audit event ⚠️
- No hay legacy runtime paths todavía, pero la estructura pre-monorepo (`control-plane/api`
  en raíz vs `apps/control-plane/api`) debe limpiarse al mergear S3.

---

## 4. Auditoría por cada denial

### Problema en Nexion
Solo se auditaban acciones exitosas. Las denegaciones (acceso rechazado, entitlement faltante,
validación fallida) no generaban eventos. Esto impedía detectar patrones de abuso,
configuraciones rotas, o clientes con problemas de licencia.

### Mitigación para SkuldBot
Cada denial genera evento auditable con:
- `tenantId` / `clientId`
- `feature` (qué intentó hacer)
- `capability` (qué se le denegó)
- `error_code`
- `caller` (userId, IP, user agent)
- `correlation_id`
- `timestamp`

### Estado actual en SkuldBot
- Signing: audita OTP lockout, sign, decline ✅
- Lookups/Policies: NO auditan accesos denegados ⚠️
- Guards: retornan 403 pero no generan audit event ⚠️

### Cuándo aplicar
Extender guards para generar audit events en denegación. Hacer como parte de compliance hardening.

---

## 5. UI: BlockedState vs EmptyState

### Problema en Nexion
UI ocultaba módulos cuando el tenant no tenía entitlement. El usuario no sabía que el módulo
existía, no podía pedir acceso, y soporte no podía diagnosticar porque no había evidencia
visual. Otros módulos mostraban estado vacío cuando en realidad estaban bloqueados por licencia.

### Mitigación para SkuldBot
Dos componentes visuales distintos, nunca intercambiables:

**EmptyState** — El módulo está disponible pero no tiene datos todavía.
- Muestra onboarding: "Create your first template", "Add a signatory"
- CTA: acción de creación
- Tono: bienvenida

**BlockedState** — El módulo existe pero el tenant no tiene derecho a usarlo.
- Muestra: qué está bloqueado, por qué, y cómo resolverlo
- CTA: upgrade plan, contact sales, contact admin
- Incluye: `error_code`, `correlation_id`, remediation visible
- NUNCA ocultar el módulo del menú

### Cuándo aplicar
Albert debe implementar este patrón al portar la UI de contratos desde Nexion.
Aplica a todos los módulos del CP UI.

---

## 6. Rotación de keys sin downtime

### Problema en Nexion
Rotar un JWT secret o API key requería reiniciar el backend. Durante el reinicio,
todas las sesiones activas se invalidaban y los workers perdían conexión.

### Mitigación para SkuldBot
- Soporte dual-key temporal: key activa + key previa en ventana de gracia.
- Switchover sin reinicio: nueva key se activa, anterior sigue válida por N minutos.
- Expiración controlada de key previa.
- Audit event por rotación.

### Estado actual en SkuldBot
No implementado. OTP secret es single-key, requiere reinicio para cambiar.

### Cuándo aplicar
Antes de producción regulada. Puede ser sprint de hardening pre-launch.

---

## 7. Bootstrap flow documentado y testeado

### Problema en Nexion
Orden de bootstrap roto: dependencias circulares entre superadmin creation,
DB migrations, y configuración inicial. Login inicial fallaba post-install.
Deployer no tenía smoke tests.

### Mitigación para SkuldBot
- Documentar secuencia exacta de bootstrap: migrations → seed → superadmin → verify.
- Endpoint de setup (`/api/v1/setup/admin`) con token de instalación obligatorio.
- Smoke tests automáticos post-deploy en CI/CD.
- Login post-install debe funcionar sin intervención manual.

### Estado actual en SkuldBot
No hay bootstrap flow. No hay setup endpoint. No hay smoke tests post-deploy.

### Cuándo aplicar
Antes del primer deploy a Azure. Parte del CI/CD pipeline.

---

## 8. Paridad multi-cloud en deployers

### Problema en Nexion
Cambios en deployer Azure que no se replicaban en deployer AWS y viceversa.
Funcionalidades que solo existían en un cloud. Tests que solo corrían en uno.

### Mitigación para SkuldBot
- Nuestra arquitectura de providers ya abstrae cloud-specifics.
- Pero cuando lleguen los deployers de Orchestrator, DEBE haber:
  - Gate automático: cambio en deployer A = cambio obligatorio en deployer B.
  - E2E de instalación en cada cloud target.
  - Matriz de paridad documentada.

### Cuándo aplicar
Cuando construyamos deployers de Orchestrator (no aplica a CP que va a Azure Web App).

---

## 9. Workers con mismo contrato

### Problema en Nexion
Celery tasks (background jobs) no aplicaban los mismos gates que la API.
Un worker podía ejecutar una acción que la API bloqueaba. Error codes diferentes
entre API y workers para la misma denegación.

### Mitigación para SkuldBot
- BotRunner (nuestro equivalente a workers) DEBE usar el mismo contrato de entitlements.
- Mismos error codes, mismo error envelope, misma auditoría.
- Si la API bloquea algo, el Runner también lo bloquea.

### Cuándo aplicar
Cuando integremos BotRunner con el Orchestrator y sistema de licencias.

---

## Resumen de prioridades

| # | Lección | Prioridad | Cuándo |
|---|---------|:---------:|--------|
| 1 | Contrato de entitlement | ALTA | S3 Licenses/Billing |
| 2 | Error catalog centralizado | ALTA | Pre-deploy |
| 3 | Fail-closed + audit en fallback | MEDIA | Compliance hardening |
| 4 | Audit por denial | MEDIA | Compliance hardening |
| 5 | BlockedState vs EmptyState | ALTA | UI contracts port |
| 6 | Dual-key rotation | MEDIA | Pre-producción regulada |
| 7 | Bootstrap flow | ALTA | Pre-deploy Azure |
| 8 | Paridad deployers | BAJA | Deployers Orchestrator |
| 9 | Workers mismo contrato | MEDIA | Runner + Orchestrator |

---

## Referencias

- Nexion PLN-005: Documento interno de Skuld, LLC
- SkuldBot CLAUDE.md: Principios de seguridad y compliance
- SkuldBot WORK_PROTOCOL.md: Quality gates QG1-QG9
- SkuldBot REGULATORY_DESIGN_GUARDRAILS.md: Guardrails de arquitectura
