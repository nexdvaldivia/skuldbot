# SkuldBot Master Plan

**Fecha**: 2026-04-14
**Autor**: Albert (Arquitectura + UI)
**Equipo**: Albert (UI + arquitectura + review), Luis (backend + infra + testing)
**Principio UI**: Refactoring UI (Adam Wathan & Steve Schoger) — sin romper diseno existente
**Referencia**: Nexion One como blueprint (propiedad de Dubiel, sin restriccion IP)

---

## Estado Actual del Proyecto

### Inventario Real (Auditado 2026-04-14)

| Componente        | Modulos | Endpoints | Entities | LOC UI  | Tests |
| ----------------- | :-----: | :-------: | :------: | :-----: | :---: |
| Control Plane API |   17    |   110+    |   35+    |    -    |  3%   |
| Control Plane UI  |    -    |     -     |    -     | 13,063  |  0%   |
| Orchestrator API  |   28    |    244    |   32+    |    -    |  3%   |
| Orchestrator UI   |    -    |     -     |    -     |  8,228  |  0%   |
| SkuldBot Website  |    -    |     -     |    -     | 10,332  |  0%   |
| Docs Components   |    -    |     -     |    -     |  3,946  |  0%   |
| Studio Desktop    |    -    |     -     |    -     | ~50,000 |  10%  |
| Engine (Python)   |    -    |     -     |    -     | ~37,000 |  60%  |
| Runner (Python)   |    -    |     -     |    -     | ~5,000  |  25%  |

### Dos Planos Arquitectonicos

```
CONTROL PLANE (Skuld LLC — UNA instancia)
  Negocio: clientes, licencias, billing, partners, marketplace, marketing, contratos
  URL: cp.skuldbot.com / api.skuldbot.com

ORCHESTRATOR (Per-Cliente — N instancias)
  Operaciones: bots, runners, ejecuciones, evidence, credentials, policies
  URL: {cliente}.skuldbot.com o self-hosted
```

---

## Organizacion por Modulos

### M1. PLATAFORMA BASE (Compartido)

| Sub-modulo                 |  Destino  | Estado                  | Que falta                                |
| -------------------------- | :-------: | ----------------------- | ---------------------------------------- |
| M1.1 Provider Architecture | CP + Orch | Parcial                 | Factory pattern, multi-provider failover |
| M1.2 Lookup Tables         | CP + Orch | CP: tiene, Orch: no     | Unificar, agregar categorias SkuldBot    |
| M1.3 RBAC Granular         | CP + Orch | CP: basico, Orch: real  | CP necesita resource-level permissions   |
| M1.4 Audit Trail           | CP + Orch | Orch: real, CP: parcial | CP necesita audit completo               |
| M1.5 User Management       | CP + Orch | Ambos: basico           | MFA, login history, password policies    |

### M2. CONTROL PLANE — NEGOCIO

| Sub-modulo            | Estado             | Que falta (ref Nexion)                                 |
| --------------------- | ------------------ | ------------------------------------------------------ |
| M2.1 Client Lifecycle | Real (7 endpoints) | Addresses, contacts, lifecycle states completos        |
| M2.2 Licencias        | Real (980 LOC)     | Ed25519 signing, grace periods, heartbeat verificacion |
| M2.3 Billing/Stripe   | Real (1,430 LOC)   | Invoice generation, payment portal, dunning            |
| M2.4 Contratos        | NO EXISTE          | Lifecycle, signing workflow, PDF, variables, gates     |
| M2.5 Suscripciones    | Parcial            | Pricing plans, trials, addons, cancellation flows      |
| M2.6 Fleet Management | Real (4 endpoints) | Dashboard de salud, alertas, metricas agregadas        |
| M2.7 Tenant Isolation | NO EXISTE          | Scans, status, acciones, grace periods                 |
| M2.8 Support Tickets  | Stub (86 LOC)      | CRUD, escalation, SLA tracking                         |

### M3. PARTNERS & MARKETPLACE

| Sub-modulo             | Estado                   | Que falta                                           |
| ---------------------- | ------------------------ | --------------------------------------------------- |
| M3.1 Partner Program   | Parcial (en marketplace) | Tiers, perfil completo, portal de partner           |
| M3.2 Revenue Share     | Entities existen         | Calculo, payouts, Stripe Connect, dashboard         |
| M3.3 Bot Marketplace   | Real (20 endpoints)      | Certificacion, reviews, ratings, analytics          |
| M3.4 Partner Directory | NO EXISTE                | Public page, filtros, perfiles, website integration |

### M4. MARKETING & WEBSITE

| Sub-modulo              | Estado            | Que falta (ref Nexion)                       |
| ----------------------- | ----------------- | -------------------------------------------- |
| M4.1 CMS / Blog         | NO EXISTE         | Posts, categorias, TipTap editor, public API |
| M4.2 Email Marketing    | NO EXISTE         | Campaigns, lists, tracking, A/B, unsubscribe |
| M4.3 Events & Webinars  | NO EXISTE         | Scheduling, registration, public page        |
| M4.4 Website Public API | Parcial (leads)   | Plans, bots, partners, blog, events, FAQs    |
| M4.5 Lead Management    | Real (1 endpoint) | Pipeline, assignment, nurturing, analytics   |

### M5. ORCHESTRATOR — OPERACIONES (Per-Cliente)

| Sub-modulo              | Estado                     | Que falta                        |
| ----------------------- | -------------------------- | -------------------------------- |
| M5.1 Bot Management     | Real (21 endpoints)        | OK — funcional                   |
| M5.2 Run Execution      | Real (244 endpoints total) | OK — funcional                   |
| M5.3 Runner Management  | Real                       | OK — funcional                   |
| M5.4 Scheduling         | Real (1,842 LOC)           | OK — funcional                   |
| M5.5 Credentials Vault  | Real (2,225 LOC)           | OK — funcional                   |
| M5.6 Evidence Packs     | Real (8 sub-servicios)     | Integracion con runtime faltante |
| M5.7 RBAC (cliente)     | Real (693 LOC)             | OK — funcional                   |
| M5.8 Audit (cliente)    | Real (556 LOC)             | OK — funcional                   |
| M5.9 Marketplace Client | Real (14 endpoints)        | OK — funcional                   |
| M5.10 CP Sync           | Real (552 LOC)             | OK — heartbeat + usage reporting |

### M6. UI / FRONTEND

| Sub-modulo            | Asignado | Estado                                | Que falta                                               |
| --------------------- | :------: | ------------------------------------- | ------------------------------------------------------- |
| M6.1 CP UI            |  Albert  | 18 pages, 13K LOC                     | Contratos, partner portal, email marketing, blog admin  |
| M6.2 Orchestrator UI  |  Albert  | 11 pages, 8K LOC                      | Evidence viewer, credentials vault UI, schedule builder |
| M6.3 SkuldBot Website |  Albert  | 13 pages, 10K LOC                     | Blog, events, partner directory, legal pages            |
| M6.4 Docs             |  Albert  | 31 pages, 4K LOC                      | API reference, tutorials, video embeds                  |
| M6.5 Studio Desktop   |  Albert  | Refactors (FlowEditor, nodeTemplates) | Fase 6 del zero-defect                                  |

### M7. INFRAESTRUCTURA & DEVOPS

| Sub-modulo                 | Asignado | Estado                   | Que falta                            |
| -------------------------- | :------: | ------------------------ | ------------------------------------ |
| M7.1 Zero-Defect Plan      |   Luis   | Fase 1 casi cerrada      | Fases 2-6 pendientes                 |
| M7.2 Azure Deployment      |   Luis   | No iniciado              | App Services, PostgreSQL, Redis, DNS |
| M7.3 CI/CD                 |   Luis   | Pipeline basico (ZD-013) | Releases firmados, auto-deploy       |
| M7.4 Multi-cloud Deployers |   Luis   | No iniciado              | Terraform para Runners (AWS/Azure)   |

---

## Sprints

### Sprint 0: Estabilizacion (1 semana)

> Cerrar lo pendiente antes de arrancar trabajo nuevo.

| ID    | Tarea                                                      | Asignado | Modulo |
| ----- | ---------------------------------------------------------- | :------: | ------ |
| S0-01 | Cerrar Fase 1 Quality Gate (merge + build + verify)        |   Luis   | M7.1   |
| S0-02 | Commitear fix @types/react + entity LicenseRuntimeDecision |   Luis   | M7.1   |
| S0-03 | Limpiar worktrees obsoletos                                |   Luis   | M7.1   |
| S0-04 | Actualizar PROJECT_STATUS.md con estado real               |  Albert  | Docs   |

### Sprint 1: Provider Architecture + Azure Base (2 semanas)

> Sin providers, nada funciona en produccion.

| ID    | Tarea                                              | Asignado | Modulo |
| ----- | -------------------------------------------------- | :------: | ------ |
| S1-01 | Provider interfaces (payment, email, storage, SMS) |   Luis   | M1.1   |
| S1-02 | Stripe provider implementation                     |   Luis   | M1.1   |
| S1-03 | SendGrid + SMTP email providers                    |   Luis   | M1.1   |
| S1-04 | S3 + Azure Blob storage providers                  |   Luis   | M1.1   |
| S1-05 | IntegrationConfig entity (per-tenant config)       |   Luis   | M1.1   |
| S1-06 | Provider factory con fallback chain                |   Luis   | M1.1   |
| S1-07 | Azure resource group + App Services setup          |   Luis   | M7.2   |
| S1-08 | Azure PostgreSQL + Redis provisioning              |   Luis   | M7.2   |
| S1-09 | DNS config: skuldbot.com, docs, cp, api subdomains |   Luis   | M7.2   |
| S1-10 | Deploy website (skuldbot.com) a Azure              |   Luis   | M7.2   |
| S1-11 | Deploy docs (docs.skuldbot.com) a Azure            |   Luis   | M7.2   |

### Sprint 2: RBAC + Contratos + CP UI (2 semanas)

> RBAC granular y contratos son prerequisitos enterprise.

| ID    | Tarea                                                         | Asignado | Modulo |
| ----- | ------------------------------------------------------------- | :------: | ------ |
| S2-01 | RBAC granular: resource-level permissions en CP               |   Luis   | M1.3   |
| S2-02 | Permission guard decorator (@RequirePermission)               |   Luis   | M1.3   |
| S2-03 | User management: MFA (TOTP), login history, password policies |   Luis   | M1.5   |
| S2-04 | Contract entity + service (lifecycle, variables)              |   Luis   | M2.4   |
| S2-05 | Contract signing workflow (envelope, recipients, events)      |   Luis   | M2.4   |
| S2-06 | PDF generation (TipTap JSON → HTML → PDF)                     |   Luis   | M2.4   |
| S2-07 | Contract gates (no deploy sin contrato firmado)               |   Luis   | M2.4   |
| S2-08 | **CP UI: Contracts page** (list, create, sign, view PDF)      |  Albert  | M6.1   |
| S2-09 | **CP UI: RBAC page** (mejorar roles + permissions editor)     |  Albert  | M6.1   |
| S2-10 | **CP UI: User management** (MFA setup, login history)         |  Albert  | M6.1   |
| S2-11 | Deploy CP API (api.skuldbot.com) a Azure                      |   Luis   | M7.2   |
| S2-12 | Deploy CP UI (cp.skuldbot.com) a Azure                        |   Luis   | M7.2   |

### Sprint 3: Licencias + Billing Real (2 semanas)

> Sin licencias firmadas y billing real, no se cobra.

| ID    | Tarea                                                           | Asignado | Modulo |
| ----- | --------------------------------------------------------------- | :------: | ------ |
| S3-01 | Licencias: Ed25519 signing + verification                       |   Luis   | M2.2   |
| S3-02 | Licencias: grace periods + heartbeat validation                 |   Luis   | M2.2   |
| S3-03 | Licencias: feature gating en runtime                            |   Luis   | M2.2   |
| S3-04 | Licencias: audit trail (LicenseAudit entity)                    |   Luis   | M2.2   |
| S3-05 | Billing: pricing plans (starter/pro/enterprise)                 |   Luis   | M2.3   |
| S3-06 | Billing: Stripe subscription lifecycle                          |   Luis   | M2.3   |
| S3-07 | Billing: invoice generation + payment portal                    |   Luis   | M2.3   |
| S3-08 | Billing: usage metering (per-execution, per-bot)                |   Luis   | M2.3   |
| S3-09 | Billing: dunning workflow (past-due handling)                   |   Luis   | M2.3   |
| S3-10 | **CP UI: License management page** (issue, revoke, audit trail) |  Albert  | M6.1   |
| S3-11 | **CP UI: Billing dashboard** (invoices, payments, usage charts) |  Albert  | M6.1   |
| S3-12 | **CP UI: Pricing plans admin** (create, edit plans)             |  Albert  | M6.1   |

### Sprint 4: Partners + Revenue Share + Marketplace (2 semanas)

> El diferenciador de negocio: partners crean bots, ganan dinero.

| ID    | Tarea                                                                           | Asignado | Modulo |
| ----- | ------------------------------------------------------------------------------- | :------: | ------ |
| S4-01 | Partner entity completo (tiers, perfil, metricas, canPublishToMarketplace flag) |   Luis   | M3.1   |
| S4-02 | Partner types (bot_creator, integrator, reseller, technology)                   |   Luis   | M3.1   |
| S4-03 | Partner approval workflow (apply → review → approve/reject)                     |   Luis   | M3.1   |
| S4-04 | Revenue share engine (calculo, acumulado, periodos)                             |   Luis   | M3.2   |
| S4-05 | Partner payouts (Stripe Connect o manual, approval workflow)                    |   Luis   | M3.2   |
| S4-06 | Bot certification workflow (submit → in_review → certified/rejected)            |   Luis   | M3.3   |
| S4-07 | Nexion (Skuld) internal bot publishing (bypass partner approval, still certify) |   Luis   | M3.3   |
| S4-08 | Bot reviews + ratings system                                                    |   Luis   | M3.3   |
| S4-09 | Marketplace analytics (installs, executions, revenue per bot)                   |   Luis   | M3.3   |
| S4-10 | **CP UI: Partner management page** (CRUD, tiers, approval queue, payouts)       |  Albert  | M6.1   |
| S4-11 | **CP UI: Partner portal** (dashboard, submit bots, earnings, payouts)           |  Albert  | M6.1   |
| S4-12 | **CP UI: Marketplace admin** (review queue, certify/reject, analytics)          |  Albert  | M6.1   |
| S4-13 | **Website: Partner directory page** (public, filtros, perfiles)                 |  Albert  | M6.3   |
| S4-14 | **Website: Marketplace public page** (catalogo de bots, por industria)          |  Albert  | M6.3   |

### Sprint 5: Marketing Engine (2 semanas)

> Blog, email campaigns, events — contenido que vende.

| ID    | Tarea                                                                   | Asignado | Modulo |
| ----- | ----------------------------------------------------------------------- | :------: | ------ |
| S5-01 | Blog entity + service (TipTap JSON, categories, authors)                |   Luis   | M4.1   |
| S5-02 | Blog public API (GET /public/blog)                                      |   Luis   | M4.1   |
| S5-03 | Email campaign entity + service (lists, send, track)                    |   Luis   | M4.2   |
| S5-04 | Email tracking (open pixel, click rewrite, unsubscribe)                 |   Luis   | M4.2   |
| S5-05 | Events entity + service (schedule, register, notify)                    |   Luis   | M4.3   |
| S5-06 | Website public API completa (plans, bots, partners, blog, events, FAQs) |   Luis   | M4.4   |
| S5-07 | Lead management: pipeline, assignment, analytics                        |   Luis   | M4.5   |
| S5-08 | **CP UI: Blog admin** (editor TipTap, categories, publish)              |  Albert  | M6.1   |
| S5-09 | **CP UI: Email campaigns** (create, design, send, analytics)            |  Albert  | M6.1   |
| S5-10 | **CP UI: Events admin** (create, registrations, attendees)              |  Albert  | M6.1   |
| S5-11 | **CP UI: Lead CRM** (pipeline view, assignment, status)                 |  Albert  | M6.1   |
| S5-12 | **Website: Blog page** (listing, article view, categories)              |  Albert  | M6.3   |
| S5-13 | **Website: Events page** (upcoming, registration form)                  |  Albert  | M6.3   |
| S5-14 | **Website: Legal pages** (Privacy, Terms, Security)                     |  Albert  | M6.3   |

### Sprint 6: Orchestrator UI + Operations (2 semanas)

> Mejorar la experiencia del cliente que opera bots.

| ID    | Tarea                                                            | Asignado | Modulo |
| ----- | ---------------------------------------------------------------- | :------: | ------ |
| S6-01 | Tenant isolation service (scans, status, acciones)               |   Luis   | M2.7   |
| S6-02 | Support tickets CRUD + escalation                                |   Luis   | M2.8   |
| S6-03 | Alerts & notification routing                                    |   Luis   | M5     |
| S6-04 | Webhook management (CRUD, delivery tracking, retry)              |   Luis   | M5     |
| S6-05 | **Orch UI: Evidence Pack viewer** (timeline, decisions, lineage) |  Albert  | M6.2   |
| S6-06 | **Orch UI: Credentials vault UI** (folders, rotation, audit log) |  Albert  | M6.2   |
| S6-07 | **Orch UI: Schedule builder** (visual cron, calendar view)       |  Albert  | M6.2   |
| S6-08 | **Orch UI: Run detail page** (logs, artifacts, HITL decisions)   |  Albert  | M6.2   |
| S6-09 | **Orch UI: Bot detail page** (versions, executions, metrics)     |  Albert  | M6.2   |
| S6-10 | **CP UI: Fleet health dashboard** (all orchestrators, alerts)    |  Albert  | M6.1   |
| S6-11 | **CP UI: Tenant isolation viewer** (scan results, actions)       |  Albert  | M6.1   |

### Sprint 7: Testing + Hardening (2 semanas)

> Retomar zero-defect Fase 2-3 con todo el codigo nuevo.

| ID    | Tarea                                             | Asignado | Modulo |
| ----- | ------------------------------------------------- | :------: | ------ |
| S7-01 | Tests: Provider architecture (unit + integration) |   Luis   | M1.1   |
| S7-02 | Tests: RBAC + contracts (unit)                    |   Luis   | M2.4   |
| S7-03 | Tests: Licencias + billing (unit + Stripe mocks)  |   Luis   | M2.3   |
| S7-04 | Tests: Partners + revenue share (unit)            |   Luis   | M3.2   |
| S7-05 | Tests: Marketing modules (unit)                   |   Luis   | M4     |
| S7-06 | Tests: Engine Python (target 85%)                 |   Luis   | M7.1   |
| S7-07 | Tests: E2E flow Studio → Orch → Runner → Result   |   Luis   | M7.1   |
| S7-08 | **UI Tests: CP UI component tests**               |  Albert  | M6.1   |
| S7-09 | **UI Tests: Orchestrator UI component tests**     |  Albert  | M6.2   |
| S7-10 | SAST/DAST scanning                                |   Luis   | M7.1   |
| S7-11 | Load testing (k6: 1000 req/s)                     |   Luis   | M7.1   |
| S7-12 | Security hardening (rate limiting, CORS, helmet)  |   Luis   | M7.1   |

### Sprint 8: Deploy + Certification (2 semanas)

> Todo en Azure, listo para clientes.

| ID    | Tarea                                                         |   Asignado    | Modulo |
| ----- | ------------------------------------------------------------- | :-----------: | ------ |
| S8-01 | Terraform for Runner deployment (AWS + Azure)                 |     Luis      | M7.4   |
| S8-02 | CI/CD releases firmados (code signing Apple + MS)             |     Luis      | M7.3   |
| S8-03 | Studio auto-update via Tauri updater                          |     Luis      | M7.3   |
| S8-04 | DR runbook + backup automation                                |     Luis      | M7.1   |
| S8-05 | SOC2 controles documentados                                   |    Albert     | Docs   |
| S8-06 | HIPAA controles documentados                                  |    Albert     | Docs   |
| S8-07 | GDPR controles documentados                                   |    Albert     | Docs   |
| S8-08 | **Studio: Refactor FlowEditor.tsx** (9,600 → sub-componentes) |    Albert     | M6.5   |
| S8-09 | **Studio: Refactor nodeTemplates.ts** (10K → por categoria)   |    Albert     | M6.5   |
| S8-10 | **Studio: Migrate to Tauri 2.x + React 19**                   | Albert + Luis | M6.5   |
| S8-11 | Pentest externo                                               |     Luis      | M7.1   |
| S8-12 | Observability: Prometheus + Grafana + Alertas                 |     Luis      | M7.1   |

---

## Timeline Visual

```
Sprint 0  ██ Estabilizacion                    (1 sem)
Sprint 1  ████ Providers + Azure Base          (2 sem)
Sprint 2  ████ RBAC + Contratos + CP UI        (2 sem)
Sprint 3  ████ Licencias + Billing Real        (2 sem)
Sprint 4  ████ Partners + Marketplace          (2 sem)
Sprint 5  ████ Marketing Engine                (2 sem)
Sprint 6  ████ Orch UI + Operations            (2 sem)
Sprint 7  ████ Testing + Hardening             (2 sem)
Sprint 8  ████ Deploy + Certification          (2 sem)
──────────────────────────────────────────────────────
Total: 9 sprints, ~17 semanas, 99 tareas
```

---

## Distribucion por Rol

### Albert (UI + Arquitectura) — 40 tareas

| Sprint | Tareas | Foco                                                                     |
| ------ | :----: | ------------------------------------------------------------------------ |
| S0     |   1    | Docs                                                                     |
| S2     |   3    | CP UI: contratos, RBAC, users                                            |
| S3     |   3    | CP UI: licencias, billing, pricing                                       |
| S4     |   5    | CP UI: partners, portal, marketplace + Website: partners, marketplace    |
| S5     |   7    | CP UI: blog, campaigns, events, leads + Website: blog, events, legal     |
| S6     |   7    | Orch UI: evidence, vault, schedule, runs, bots + CP UI: fleet, isolation |
| S7     |   2    | UI tests                                                                 |
| S8     |   5    | Studio refactors + compliance docs                                       |

### Luis (Backend + Infra) — 59 tareas

| Sprint | Tareas | Foco                                             |
| ------ | :----: | ------------------------------------------------ |
| S0     |   3    | QG, fixes, cleanup                               |
| S1     |   11   | Providers + Azure deployment                     |
| S2     |   7    | RBAC, MFA, contratos, PDF, Azure deploy CP       |
| S3     |   9    | Licencias Ed25519, billing Stripe, metering      |
| S4     |   7    | Partners, revenue share, marketplace features    |
| S5     |   7    | Blog, email marketing, events, public API, leads |
| S6     |   4    | Tenant isolation, tickets, alerts, webhooks      |
| S7     |   8    | Tests + security + load testing                  |
| S8     |   6    | Terraform, CI/CD, DR, pentest, observability     |

---

## Principios UI (Refactoring UI)

Todas las paginas UI que Albert construya seguiran estos principios:

1. **Jerarquia por peso y color, no por tamano** — No todo grande es importante
2. **Spacing scale constrained** — 4, 8, 12, 16, 24, 32, 48, 64 (no valores arbitrarios)
3. **Color palette limitada** — Zinc/Slate base, emerald primary, semantic colors para estados
4. **Menos borders, mas sombras y spacing** — Separar con espacio y fondo, no con lineas
5. **Empty states diseñados** — Primera impresion importa
6. **No mirrors de base de datos** — UI organizada por tareas del usuario, no por tablas
7. **Acciones primarias obvias** — Un CTA claro por seccion
8. **Datos reales primero** — Si no hay datos, mostrar estado vacio util, no placeholder
9. **Tipografia con proposito** — Max 2 font sizes por seccion, usar weight/color para diferenciar
10. **No romper lo existente** — El design system actual (Shadcn + Radix + Tailwind) se mantiene y se mejora

---

## Quality Gates por Sprint

| Sprint | Gate                                                                        |
| ------ | --------------------------------------------------------------------------- |
| S0     | `turbo run build` 7/7, CI verde, branch protection activa                   |
| S1     | Providers: unit tests pasan, Azure: subdominios responden 200               |
| S2     | Contratos: E2E sign flow funciona, CP UI conectada al API                   |
| S3     | Licencia: firma + verify + grace period funciona, Stripe: test payment pasa |
| S4     | Revenue share: calculo correcto en tests, Partner portal funcional          |
| S5     | Blog: publicar + ver en website funciona, Campaign: enviar test email       |
| S6     | Evidence viewer: renderiza pack real, Schedule: crear + ejecutar funciona   |
| S7     | >80% coverage en modulos nuevos, 0 SAST high/critical, load test pasa       |
| S8     | Pentest clean, auto-update funciona, Terraform aplica sin errores           |

---

_Plan maestro preparado por Albert - (c) 2026 Skuld, LLC_
