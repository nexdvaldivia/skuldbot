# Separacion: Control Plane vs Orchestrator

**Fecha**: 2026-04-14
**Autor**: Albert

---

## Arquitectura de Dos Planos

SkuldBot opera en dos niveles completamente separados:

### Control Plane (Skuld LLC)

- **Instancias**: UNA sola, operada por Skuld LLC
- **Proposito**: Gestionar el NEGOCIO de SkuldBot
- **Usuarios**: Equipo Skuld, partners, prospects
- **URL produccion**: `cp.skuldbot.com`

### Orchestrator (Per-Cliente)

- **Instancias**: UNA POR CLIENTE (o por suscripcion)
- **Proposito**: Gestionar los BOTS del cliente
- **Usuarios**: Equipo del cliente (operadores, admins, viewers)
- **URL produccion**: `orch.clienteA.com` o `clienteA.skuldbot.com`

---

## Que va en CADA plano

### CONTROL PLANE (Skuld LLC) — `apps/control-plane/`

Todo lo relacionado con operar el negocio de Skuld:

| Modulo               | Descripcion                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Clientes**         | Directorio de empresas clientes, lifecycle (lead → trial → active → suspended)      |
| **Licencias**        | Emision, firma Ed25519, revocacion, grace periods, feature gating                   |
| **Billing**          | Suscripciones, invoices, cobros Stripe, metering agregado                           |
| **Contratos**        | MSA, ToS, DPA, BAA — workflow de firma, PDF, gates                                  |
| **Partners**         | Programa de partners, tiers, revenue share, payouts                                 |
| **Marketplace**      | Catalogo de bots alquilables, reviews, certificacion                                |
| **Fleet Management** | Vista de TODOS los Orchestrators desplegados, health, heartbeat                     |
| **Marketing**        | Blog, email campaigns, events, landing pages, lead capture                          |
| **Website API**      | Endpoints publicos para skuldbot.com (plans, partners, blog)                        |
| **RBAC (interno)**   | Roles del equipo Skuld (super_admin, sales, support, partner_manager)               |
| **Users (internos)** | Empleados de Skuld + usuarios partner portal                                        |
| **Settings**         | Configuracion global: providers, domains, feature flags                             |
| **Audit**            | Audit trail de operaciones de negocio (quien emitio licencia, quien firmo contrato) |
| **Provider Config**  | Configuracion de providers globales (Stripe, SendGrid, Twilio, S3)                  |
| **Quotas & Usage**   | Aggregacion de uso de TODOS los Orchestrators para billing                          |
| **Support Tickets**  | Tickets de soporte de clientes (escalados desde Orchestrator)                       |

### ORCHESTRATOR (Per-Cliente) — `apps/orchestrator/`

Todo lo relacionado con operar los bots del cliente:

| Modulo                 | Descripcion                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| **Bots**               | CRUD de bots del cliente, versionado, deployment                      |
| **Runs**               | Historial de ejecuciones, logs, resultados                            |
| **Runners**            | Registro, health check, dispatch de jobs                              |
| **Schedules**          | Programacion de ejecuciones (cron, triggers)                          |
| **Evidence Packs**     | Generacion, almacenamiento, verificacion de integridad                |
| **Credentials**        | Vault del cliente (secretos para sus bots)                            |
| **RBAC (cliente)**     | Roles del equipo del cliente (admin, operator, viewer, auditor)       |
| **Users (cliente)**    | Empleados del cliente que operan bots                                 |
| **Audit**              | Audit trail de operaciones de bots (quien ejecuto, quien aprobo HITL) |
| **Policies**           | Policy packs del cliente (HIPAA, SOC2, PCI, custom)                   |
| **Webhooks**           | Triggers de entrada y notificaciones de salida                        |
| **Real-time Logs**     | WebSocket streaming de logs de ejecucion                              |
| **Marketplace Client** | Bots instalados del marketplace, actualizaciones                      |
| **LLM Config**         | BYOM: configuracion de providers LLM del cliente                      |
| **Compiler**           | Compilacion de DSL a Bot Packages (.skb)                              |
| **Storage**            | Artifacts del cliente (downloads, uploads, evidence packs)            |

### COMUNICACION CP ↔ ORCHESTRATOR

| Canal                 | Direccion | Datos                                             |
| --------------------- | :-------: | ------------------------------------------------- |
| **Register**          | Orch → CP | Orchestrator se registra al activar suscripcion   |
| **Heartbeat**         | Orch → CP | Health check periodico (cada 60s)                 |
| **Usage Ingest**      | Orch → CP | Metering: ejecuciones, bots activos, tokens LLM   |
| **License Check**     | Orch → CP | Validar licencia, verificar features/limits       |
| **Quota Check**       | Orch → CP | Verificar si puede ejecutar (dentro de cuota)     |
| **Marketplace Sync**  | CP → Orch | Push de bots del marketplace comprados            |
| **Config Push**       | CP → Orch | Actualizaciones de politicas, features            |
| **Ticket Escalation** | Orch → CP | Soporte que el cliente no puede resolver          |
| **Evidence Upload**   | Orch → CP | Evidence Packs para audit centralizado (opcional) |

---

## Impacto en el Plan de Migracion

### Modulos Nexion → CONTROL PLANE

| Modulo Nexion     | Adaptar a CP de SkuldBot             |
| ----------------- | ------------------------------------ |
| RBAC              | RBAC interno de Skuld LLC            |
| Licencias         | Emision y gestion de licencias       |
| Billing/Stripe    | Facturacion a clientes               |
| Contratos         | Workflow de firma con clientes       |
| Partners          | Programa de partners + revenue share |
| Blog/CMS          | Marketing content                    |
| Email Marketing   | Campaigns a prospects/clientes       |
| Events            | Webinars y demos                     |
| Website API       | Public endpoints                     |
| Integrations      | Provider config global               |
| Alerts            | Monitoring de fleet                  |
| Client Management | Lifecycle de clientes                |
| Tenant Isolation  | Verificacion de aislamiento          |

### Modulos Nexion → ORCHESTRATOR

| Modulo Nexion                | Adaptar a Orchestrator de SkuldBot  |
| ---------------------------- | ----------------------------------- |
| (No hay equivalente directo) | Bot management                      |
| (No hay equivalente directo) | Runner management                   |
| (No hay equivalente directo) | Evidence Packs                      |
| RBAC                         | RBAC del cliente (diferente del CP) |
| Users                        | Users del cliente                   |
| Audit                        | Audit de operaciones de bots        |
| Webhooks                     | Triggers y notificaciones           |
| Storage                      | Artifacts del cliente               |

### Modulos que SOLO existen en SkuldBot (sin equivalente Nexion)

- Evidence Pack system (generacion, firma, verificacion)
- Bot compiler (DSL → .skb)
- Runner dispatch y execution engine
- AI Planner
- BYOM (Bring Your Own Model)
- Real-time execution logs via WebSocket
- Policy evaluation engine
- Compliance frameworks (HIPAA, SOC2, PCI, GDPR)

---

## Regla de Oro

> **Si el dato/operacion es sobre el NEGOCIO de Skuld → Control Plane**
> **Si el dato/operacion es sobre los BOTS del cliente → Orchestrator**

Ejemplo:

- "Cuantos bots activos tiene el cliente X" → **CP** (billing)
- "Ejecutar bot Y en runner Z" → **Orchestrator** (operations)
- "Partner W creo un bot que se vendio 50 veces" → **CP** (marketplace + revenue)
- "Evidence Pack del bot Y ejecucion #123" → **Orchestrator** (compliance)
- "El orchestrator del cliente X no reporta heartbeat" → **CP** (fleet management)

---

_Documento preparado por Albert - (c) 2026 Skuld, LLC_
