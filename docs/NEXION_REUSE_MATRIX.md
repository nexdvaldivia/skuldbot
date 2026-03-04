# Nexion -> Skuldbot Reuse Matrix

Documento complementario de escaneo completo:
- `docs/NEXION_FULL_SCAN_ADAPTATION_BLUEPRINT.md`
- `docs/NEXION_NEXIONONE_DEEP_SCAN_2026-02-22.md`
- `docs/NEXION_SKULD_MODULE_DECISION_MATRIX.md`

## 1) Confirmación de acceso
Repositorio fuente oficial enterprise detectado y accesible:
- `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend`

Puntos fuertes observados:
- `app/` con dominio, servicios, esquemas y API madura.
- `app/services/` y `app/models/` con secretos, seguridad, licencias, metering y telemetría.

Regla de fuente de verdad:
- Para arquitectura enterprise, usar solo `nexion-one`.
- `nexion/backend` queda fuera del alcance de migración salvo comparación puntual.

---

## 2) Regla de migración
No hacer copia ciega de backend completo porque hay diferencia de stack:
- Skuldbot `Control Plane + Orchestrator`: NestJS/TypeScript.
- Nexion One backend: FastAPI/Python.

Estrategia correcta:
- `copiar dominio y reglas` (lógica, modelos, políticas),
- `adaptar capa API/infra` al stack de Skuldbot,
- `reusar Python directo` solo donde encaja natural (engine/runner/libs Python).

---

## 3) Reutilización por prioridad

## P0 - Importar ya (alto ROI, bajo riesgo)
1. Secrets governance / manifest
- Fuente: `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/services/secrets_service.py`
- Destino sugerido:
  - `orchestrator/api/src/credentials/*` (contratos/validaciones/políticas),
  - `engine/skuldbot/libs/vault.py` (nombres/patrones estándar).
- Valor: estandariza secretos por cloud y reduce errores de despliegue.

2. Compliance templates (HIPAA/SOC2/etc.)
- Fuente:
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/services/security_service.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/security.py`
- Destino sugerido:
  - `orchestrator/api/src/policies/*`,
  - `engine/skuldbot/libs/compliance.py`.
- Valor: acelera policy packs regulados enterprise.

3. PHI/protection utilities
- Fuente:
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/services/security_service.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/services/secrets_service.py`
- Destino sugerido:
  - `engine/skuldbot/libs/compliance.py`,
  - `engine/skuldbot/libs/vault.py` (tokenización/redacción runtime).
- Valor: protección de datos sensible en ejecución.

## P1 - Adaptar (alto valor, requiere traducción fuerte)
4. Esquemas de licencia/cuotas
- Fuente:
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/models/license.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/licenses.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/ip_licenses.py`
- Destino sugerido:
  - `control-plane/api/src/licenses/*`,
  - `orchestrator/api/src/license/*`.
- Valor: mejorar contratos de validación y uso de cuotas.

5. Auditoría y tracking de uso
- Fuente:
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/models/usage.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/models/usage_event.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/services/telemetry_service.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/telemetry.py`
- Destino sugerido:
  - `orchestrator/api/src/usage/*`,
  - `control-plane/api/src/billing/*`.
- Valor: telemetría y monetización más robustas.

6. Dominio comercial (Sales CRM + Email Marketing)
- Fuente principal (Nexion One):
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/sales.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/leads.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/marketing_campaigns.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/marketing_templates.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/marketing_lists.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/admin/email_accounts.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/public/leads.py`
  - `/Users/dubielvaldivia/Documents/khipus/nexion/nexion-one/backend/app/api/v1/webhooks/email.py`
- Modelos fuente:
  - `app/models/lead.py`, `app/models/lead_activity.py`
  - `app/models/email_campaign.py`, `app/models/email_campaign_recipient.py`
  - `app/models/email_template.py`
  - `app/models/email_list.py`, `app/models/email_list_member.py`
  - `app/models/email_account.py`, `app/models/transactional_email_log.py`
  - `app/models/client_contact.py`, `app/models/partner.py`
- Destino sugerido en Skuldbot:
  - `control-plane/api/src/crm/*` (leads, funnel, sales reps, reportes),
  - `control-plane/api/src/marketing/*` (campañas, templates, listas, deliverability),
  - `control-plane/api/src/integrations/email/*` (providers + sender accounts enterprise),
  - `control-plane/ui/src/app/(dashboard)/crm/*` y `control-plane/ui/src/app/(dashboard)/marketing/*`,
  - `orchestrator/api/src/dispatch/*` + `orchestrator/api/src/runs/*` para ejecución de campañas trigger-based.
- Valor:
  - acelera go-to-market comercial (pipeline de ventas + crecimiento),
  - habilita venta de bots/agents con adquisición y nurturing nativos,
  - integra señales comerciales con licenciamiento/billing/marketplace ya existentes.

## P2 - No migrar 1:1 (solo patrones)
7. API FastAPI completa (`app/api/*`)
- Razón: capa HTTP no portable a NestJS.
- Acción: mapear contratos y reimplementar endpoints en TypeScript.

8. Infra específica de Nexion no alineada al producto actual
- Ejemplo: subdominios verticales de analytics no relacionados con roadmap inmediato.
- Acción: extraer ideas, no código.

---

## 4) Plan de importación recomendado (rápido)

Semana 1:
- Generar `shared policy contracts` (secrets/compliance) desde Nexion One.
- Integrar manifest de secretos en Orchestrator (sin romper APIs actuales).

Semana 2:
- Portar templates HIPAA/SOC2 a policy packs de Skuldbot.
- Integrar redacción/tokenización en runtime de engine/runner.

Semana 3:
- Reforzar licenciamiento/cuotas/usage con modelos maduros inspirados en Nexion One.
- Cerrar pruebas de regresión y seguridad.

Semana 4-5:
- Portar dominio comercial core: `Lead`, `LeadActivity`, `SalesRep` y `Pipeline/Funnel`.
- Exponer APIs admin/public para captación de leads y asignación.
- Integrar actividad comercial con auditoría y tenancy enterprise.

Semana 6-7:
- Portar `EmailCampaign`, `EmailTemplate`, `EmailList`, `EmailListMember`, `EmailAccount`.
- Conectar webhooks de eventos (open/click/bounce/unsubscribe/complaint).
- Integrar metering: campañas, envíos, engagement y uso por tenant para billing.

---

## 5) Criterio de aceptación de migración
- Ningún secreto en claro en artefactos/DSL/logs.
- Policy packs HIPAA/SOC2 activables por tenant.
- Uso y billing con idempotencia y trazabilidad consistente.
- Cero endpoints críticos en modo mock para la ruta de cliente enterprise.
- CRM/marketing listos sin exponer PII/PHI en logs ni en telemetría global.
- Cuentas de email con secretos en vault y masking estricto en respuestas API.
