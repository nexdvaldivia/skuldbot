# Plan Maestro Enterprise: RPA + AI Agent Cognitivo Universal

## 1) Vision de producto

Construir una plataforma universal donde cada bot pueda:

- automatizar como RPA clasico (UI, web, escritorio, archivos, APIs),
- razonar y decidir como agente (LLM + herramientas + memoria),
- mover datos entre fuentes/destinos (ETL/ELT operativo),
- operar bajo controles enterprise para clientes altamente regulados (HIPAA, SOC2, etc.).

Arquitectura objetivo:

- `Control Plane` multi-tenant (SaaS central): gobierno, telemetria global, catalogos, licencias, billing, marketplace.
- `Orchestrator` dedicado por cliente (single-tenant en PaaS): ejecucion, vault mapping local del cliente, runners, RBAC local.
- `Runner` en red del cliente (on-prem/hybrid) para workloads con sistemas internos y datos sensibles.

Mandato de plataforma:

- El `Orchestrator` debe ser cloud-agnostic por diseño (Azure/AWS/GCP/K8s/self-hosted compatible).
- Debe poder instalarse oficialmente en `AWS`, `Azure`, `GCP` y `on-premise`.
- Debe tener distribución oficial en contenedores Docker.

Estandar obligatorio transversal:

- `Regulatory Design Guardrails`: `docs/REGULATORY_DESIGN_GUARDRAILS.md`
- `Platform Execution Map`: `docs/PLATFORM_EXECUTION_MAP.md`
- `Docs Governance (nodes + plataforma)`: `docs/DOCS_GOVERNANCE_NODES_AND_PLATFORM.md`

---

## 2) Estado real actual (basado en codigo)

### 2.1 Lo que YA esta fuerte

- Motor universal de nodos: `278` nodos registrados en `engine/skuldbot/nodes/registry.py`.
- Cobertura de integracion de datos (tap/target) para mover data fuente->destino.
- `ai.agent` con herramientas, memoria vectorial y embeddings en DSL/compilador.
- Marketplace/licenciamiento/billing con entidades y servicios reales en CP y Orchestrator.
- Vault mapping por instalacion de bot en Orchestrator (`vaultMappings`).
- Pipeline de uso/telemetria de consumo Orchestrator -> Control Plane (usage ingest).

### 2.2 Gaps enterprise que bloquean “go big”

- Integraciones de vault externo en Orchestrator pendientes (`Hashicorp/AWS/Azure/GCP` no implementadas).
- Resolucion de secretos en dispatch de runs pendiente (se envian vacios hoy en ese flujo).
- Guardias MCP con validaciones debiles (headers trust-based).
- MCP servers con bastante mock/TODO en licensing/marketplace/workflow.
- Control Plane no expone aun endpoints de flota `orchestrators/register|heartbeat|deregister|health` usados por Orchestrator.
- Componentes de evidencia/compliance con partes in-memory o placeholder (HSM/KMS/SIEM/TSA real).
- Prompt IP protection todavia no existe como capability producto (prompts premium ocultos por referencia).

---

## 3) Critica constructiva a la idea (y mejoras)

Tu idea es correcta y tiene ventaja competitiva clara. Donde suele fallar este tipo de plataformas:

- Quedarse en “RPA + chat” sin capa de datos ni observabilidad fin-a-fin.
- No separar control-plane vs data-plane (rompe cumplimiento en regulados).
- Monetizar bots sin gobernanza de prompts/IP (fuga de propiedad intelectual).
- Integrar vault a medias (cuando llega el cliente enterprise, se cae el deal).

Mejoras clave:

- Formalizar “planes de ejecucion declarativos” con politicas por tenant y por flujo.
- Convertir prompt engineering en producto: `Prompt Catalog` versionado + control de acceso + billing.
- Incluir “Data Contracts” y “Quality Gates” en flujos de movimiento de datos.
- Implementar “Evidence by design”: trazabilidad criptografica por run desde dia 1.

---

## 4) Arquitectura objetivo detallada

## 4.1 Control Plane (SaaS central)

Responsabilidades:

- Fleet management de orchestrators (registro, heartbeat, salud, version drift).
- Licenciamiento y entitlements (orchestrator, runners, bots, prompt packs).
- Billing y metering central (uso, cuotas, revenue share, payouts).
- Marketplace (bots, versiones, aprobaciones, suscripciones).
- Prompt Catalog (premium y privados, versionado, pricing, políticas).
- Politicas globales de seguridad/compliance.
- Telemetria central y analytics.
- Integrations hub por proveedor de servicio (payment, billing, storage, email, identity, messaging).

No debe contener:

- secretos operativos del cliente en claro,
- datos PHI/PII crudos del runtime,
- auditoría operativa de runs del cliente ni evidence packs de ejecución.

## 4.2 Orchestrator por cliente (single-tenant PaaS)

Responsabilidades:

- Ejecucion de bots, scheduler, cola, asignacion a runners.
- Integracion con vault del cliente (BYO Vault).
- RBAC local, auditoria local, control de entorno.
- Caching local de artefactos permitidos (bot packages, prompt runtime tokens).
- Enforcement de politicas en tiempo real.

Requisitos cloud-agnostic (no negociables):

- evitar dependencias runtime exclusivas de un cloud provider.
- abstracciones de storage/queue/secrets/identity con adapters por proveedor.
- despliegue soportado en Kubernetes estándar + Terraform por proveedor.
- paridad funcional mínima Azure/AWS/GCP antes de GA enterprise.
- ruta de instalación on-premise soportada (Kubernetes y/o VM) con el mismo contrato operativo.
- empaquetado estándar:
- imágenes Docker versionadas y firmadas,
- `docker-compose` para POC/lab,
- Helm chart para producción en Kubernetes.

## 4.3 Runner (on-prem/hybrid)

Responsabilidades:

- Ejecutar tareas cerca de los sistemas del cliente.
- Resolver secretos de forma local/segura.
- Reportar estado/progreso/uso sin exfiltrar datos sensibles.

## 4.4 Studio

Responsabilidades:

- Diseñar flujos universales (RPA + agentes + data integration).
- Referenciar secretos (no plaintext).
- Conectar prompts por `promptRef` y no por texto premium embebido.

## 4.5 Integrations Fabric (provider-first)

Principio:

- Todas las integraciones se modelan por `service_type` y `provider`, no por lógica hardcodeada por cliente.

Servicios base:

- `payment` (ej. Stripe/Adyen), `billing`, `storage` (S3/Azure Blob/GCS), `email` (SMTP/Graph/SendGrid/SES), `identity` (OIDC/SAML providers), `messaging/webhooks`.

Contrato técnico:

- interfaz común por tipo de servicio,
- `provider registry` con health/capabilities/version,
- configuración validada por schema,
- secretos resueltos vía vault,
- fallback y failover definidos por política.

Beneficio:

- cambiar proveedor sin romper dominio de negocio,
- despliegue multi-cloud real para clientes regulados,
- mejor gobernanza de costos, resiliencia y cumplimiento.

---

## 5) Prompt IP + monetizacion (modelo producto)

## 5.1 Tipos de prompt

- `Skuld Premium Prompt` (IP protegida, no visible al cliente).
- `Customer Prompt` (BYOPrompt, editable por cliente).
- `Hybrid Prompt` (plantilla premium + slots custom permitidos).

## 5.2 Modelo tecnico recomendado

- En DSL: reemplazar prompt premium en texto por `promptRef` (`catalogId`, `version`, `policy`).
- En runtime:
  1. Bot solicita `promptRef` al Orchestrator.
  2. Orchestrator valida entitlement/licencia con Control Plane.
  3. Control Plane entrega payload cifrado o token de resolucion temporal.
  4. Prompt se inyecta solo en runtime (sin persistir claro en bot del cliente).
- Logging: nunca registrar prompt completo ni inputs sensibles.

## 5.3 Monetizacion

- Suscripcion mensual por paquete de prompts.
- Add-on por prompt premium individual.
- Uso por volumen opcional (calls/tokens/records).
- Si cliente crea bot propio, puede comprar prompts premium e insertarlos por nodo.

## 5.4 Prompt Admin + Pagina de detalle (ventas)

`Prompt Admin` (backoffice):

- CRUD de prompts (draft/review/published/deprecated).
- Versionado, changelog y rollback.
- Pricing por prompt/pack, trials y bundles.
- Entitlements por tenant/licencia/vertical.
- A/B testing de variantes de prompt.
- Telemetria por prompt: adopcion, conversion, uso, ROI estimado, churn.
- Compliance controls: etiquetas de riesgo, PHI/PII policy, aprobaciones.

`Prompt Detail Page` (catalogo comercial):

- Propuesta de valor clara (que problema resuelve).
- “Que logra” con KPIs esperados (tiempo ahorrado, precision, costo).
- Casos de uso por industria (sin bloquear universalidad).
- Inputs esperados, output schema JSON, precondiciones y dependencias.
- Demo/sandbox y ejemplo de flujo conectado a nodos.
- Pricing visible + plan recomendado + CTA de compra/suscripcion.
- FAQs, evidencia de cumplimiento, limitaciones y guardrails.
- Reviews/testimonios y comparativo de versiones.

Especificacion funcional detallada:

- `docs/PROMPT_ADMIN_SALES_FUNCTIONAL_SPEC.md`

## 5.5 Sales + Email Marketing (Growth OS nativo)

Objetivo:

- que el producto no solo ejecute bots, sino que tambien opere pipeline comercial y growth loop enterprise.

Capacidades a incorporar en Control Plane (reusando dominio de Nexion One):

- CRM de leads y pipeline (`new -> contacted -> qualified -> ... -> converted/lost`).
- Gestion de vendedores (objetivos, performance, funnel por rep, tendencias).
- Captacion publica de leads con rate-limit, deduplicacion y asignacion por reglas.
- Marketing de campañas con scheduling, A/B, listas dinamicas, templates y analytics.
- Cuentas de envio por proposito (support, billing, marketing, transactional).
- Webhooks de proveedores (delivery/open/click/bounce/unsubscribe/complaint).

Principios de arquitectura:

- Control Plane: dominio comercial global multi-tenant (catalogo, campañas, revenue intelligence).
- Orchestrator por cliente: ejecucion de bots/agentes y tareas operativas, no CRM maestro global.
- Integracion con licensing/billing: metering de campañas, envios y adopcion de prompts por tenant.

Controles regulatorios obligatorios para este bloque:

- secretos de cuentas de correo solo via vault + masking estricto en API.
- supresion global (unsubscribe/complaint) auditable y aplicada en runtime.
- minimizacion/redaccion de PII en telemetria central.
- politicas de retencion y derecho de borrado (SOC2/HIPAA + privacidad aplicable).

---

## 6) Seguridad y cumplimiento (HIPAA/SOC2 first)

Marco operativo obligatorio:

- aplicar `docs/REGULATORY_DESIGN_GUARDRAILS.md` en diseño, desarrollo, release y operación.

## 6.1 Controles tecnicos obligatorios

- BYO Vault real (Hashicorp/AWS/Azure/GCP) con rotacion y test conexion.
- mTLS + JWT firmado entre CP y Orchestrators.
- Cifrado en transito (TLS 1.2+) y en reposo (KMS/HSM production).
- Segregacion fuerte por tenant (compute, storage, claves, logs).
- Auditoria inmutable de acciones criticas en el Orchestrator (secrets, prompts, ejecuciones, cambios de policy).
- Data minimization y masking en telemetria.
- Secret zero-trust: no plaintext en DSL/plan/artifacts.
- Evidence package operativo + legal con hash canonico, verificacion y almacenamiento immutable por defecto (ver `docs/NEXION_EVIDENCE_PACKAGE_TRACEABILITY_ASSESSMENT.md`).

## 6.2 Controles operativos

- BAA para HIPAA, DPA, políticas de retencion/borrado.
- Runbooks de incidentes, acceso privilegiado JIT, revisiones trimestrales.
- SAST/DAST/SCA + hardening de CI/CD + firmas de artefactos.
- Evidencia para SOC2: change management, access reviews, logging, backup/DR tests.

## 6.3 RBAC/ABAC enterprise (obligatorio)

Principios:

- `least privilege` por defecto.
- separación de funciones (`SoD`) entre seguridad, operación, desarrollo y finanzas.
- permisos por recurso + acción + contexto (`tenant`, `environment`, `data_classification`).

Recursos mínimos:

- `orchestrators`, `runners`, `bots`, `runs`, `credentials`, `vault-connections`, `policies`, `prompts`, `billing`, `marketplace`.

Roles base Control Plane:

- `super_admin`, `security_admin`, `compliance_officer`, `platform_ops`, `billing_admin`, `tenant_admin`, `tenant_developer`, `tenant_viewer`.

Roles base Orchestrator (por cliente):

- `orchestrator_admin`, `ops_engineer`, `bot_developer`, `auditor_readonly`, `incident_responder`.

Reglas críticas:

- nadie fuera de `security_admin` y `orchestrator_admin` puede gestionar secretos/vault.
- `tenant_developer` puede diseñar bots, pero no aprobar policies ni cambiar billing.
- acciones de alto riesgo requieren `step-up auth` + motivo + auditoría inmutable.
- soporte JIT time-bound con expiración automática y trazabilidad completa.

## 6.4 Comunicación Control Plane <-> Orchestrator (obligatorio)

Requisitos de transporte:

- mTLS mutuo + JWT firmado (issuer/audience estrictos, rotación de claves).
- API keys solas no son suficientes para operaciones críticas.
- control de versión de protocolo (`x-protocol-version`) y compatibilidad backward definida.

Canales:

- `fleet channel`: register, heartbeat, health, deregister.
- `control channel`: políticas, entitlements, configuración operativa.
- `usage channel`: metering/telemetría agregada e idempotente.
- `artifact channel`: distribución segura de bot packages y metadatos de prompts.

Confiabilidad:

- mensajes idempotentes con `event_id`.
- retries con backoff exponencial + dead-letter queue.
- orden lógico por entidad (`orchestrator_id`, `run_id`) cuando aplique.
- degradación controlada si CP no disponible (cache TTL + modo restringido).

Seguridad de datos:

- nunca enviar PHI/PII crudo al CP salvo consentimiento/justificación explícita.
- minimización y redacción antes de egress.
- firmas de integridad para payloads críticos.
- no transferir evidence packs ni trails de auditoría operativa al CP.

---

## 7) Roadmap por fases (enterprise-grade)

## Fase 0 (2-4 semanas) - Cierre de riesgos bloqueantes

Objetivo: eliminar “falsos enterprise”.

Entregables:

- Implementar vault externo en Orchestrator (`fetchFromExternalVault`, `testVaultConnection`).
- Resolver secretos en dispatch (`runs.processor`), con cifrado de transporte a runner.
- Endpoints de fleet en CP (`/api/orchestrators/register|heartbeat|deregister|health`).
- Auth fuerte para uso/telemetria (validar licencia/api-key firmada, no solo headers).
- Hardening MCP guards (tenant activo + token validado).
- Política “no plaintext secrets” ya aplicada en Studio + Engine (continuar enforcement en APIs).

Exit criteria:

- 100% de credenciales en runtime via vault references.
- 0 secretos en claro en DSL validados por pipeline.
- Orchestrator visible/gestionable desde CP con heartbeat estable.

## Fase 1 (4-8 semanas) - Prompt Catalog & oferta comercial

Objetivo: habilitar IP protection + ingresos por prompts.

Entregables:

- `Prompt Catalog Service` en CP (CRUD/versionado/publicacion/precio/entitlements).
- `Prompt Admin Console` para operación comercial y de producto (pricing, entitlements, A/B, analytics).
- `Prompt Detail Page` tipo marketplace para ventas (valor, KPIs, demo, pricing, CTA).
- Soporte `promptRef` en DSL y compilador (compatibilidad backward).
- Runtime prompt resolver en Orchestrator con caché cifrada TTL.
- UI Studio para elegir prompt premium vs BYOPrompt por nodo.
- Billing por suscripcion de prompt packs.

Exit criteria:

- Cliente puede ejecutar bot con prompt premium sin ver prompt base.
- Entitlements y billing auditables por tenant/prompt/version.

## Fase 1B (4-8 semanas, en paralelo) - Sales CRM + Email Marketing

Objetivo: traer motor comercial enterprise ya probado para acelerar revenue y adopcion.

Entregables:

- Modulos `crm` y `marketing` en `control-plane/api` (NestJS) adaptando dominio de Nexion One.
- UI backoffice en `control-plane/ui` para leads, reps, campañas, listas, templates y cuentas de envio.
- Modelo de datos base: `Lead`, `LeadActivity`, `EmailCampaign`, `EmailTemplate`, `EmailList`, `EmailListMember`, `EmailAccount`.
- Ingestion de eventos de proveedores (open/click/bounce/unsubscribe/complaint) con trazabilidad.
- Conexión con billing/usage para pricing por campaña/volumen/adopcion.

Exit criteria:

- ventas opera funnel y campañas desde el producto sin herramientas externas core.
- no hay secretos de proveedores en claro ni en logs ni en respuestas API.
- métricas comerciales conectadas a dashboards de negocio (conversión, CAC proxy, pipeline velocity).

## Fase 2 (6-10 semanas) - Compliance y operaciones enterprise

Objetivo: pasar due-diligence de regulados.

Entregables:

- SIEM connectors reales (Splunk/Datadog/CloudWatch/ELK/Sentinel).
- Evidencia: custody persistente en DB + KMS/HSM provider + TSA opcional real.
- SSO enterprise cerrado (OIDC + SAML funcional).
- RBAC ABAC fino para prompts, vault, bots, runs, marketplaces.
- SLO/SLA y observabilidad (RED/USE, tracing, alerting, error budget).

Exit criteria:

- Security review interna aprobada.
- Paquete de evidencia SOC2/HIPAA reproducible por auditor.

## Fase 3 (continuo) - Escala y ecosistema

Objetivo: crecimiento de producto y partner ecosystem.

Entregables:

- Marketplace partner-grade con revenue share automatizado end-to-end.
- Certificacion de bots/prompts por vertical (sin perder universalidad).
- Policy packs por industria (healthcare/finance/public sector).
- FinOps y capacity planning multi-region.

---

## 8) Matriz de brecha (actual -> objetivo)

- Vault externo Orchestrator: parcial -> completo productivo.
- Secret resolution en dispatch: TODO -> obligatorio antes de GA regulado.
- Fleet telemetry de orchestrators: parcial -> control-plane operativo 360.
- MCP layers: mock-heavy -> delegacion a servicios reales + persistencia.
- Prompt IP: inexistente -> promptRef + runtime resolver + pricing.
- Evidence integrations: placeholder -> KMS/HSM/SIEM/TSA real.
- SSO SAML: parcial -> completo enterprise.
- Growth stack comercial: disperso/externo -> CRM + marketing nativo conectado a billing.

---

## 9) Diseño universal de capacidades del bot (no vertical-locked)

Capas funcionales en cada flujo:

- `Automatizacion`: web/desktop/API/files/email/DB.
- `Inteligencia`: agent/reasoning/classification/extraction/summarization.
- `Datos`: tap/transform/quality/target.
- `Gobierno`: policies/compliance/human-in-the-loop/auditoria.

Patron recomendado de flujo:

1. Ingesta (`DB/Excel/API/etc`).
2. Normalizacion y calidad.
3. Nodo `ai.agent` (o AI task especializada) con `promptRef` o BYOPrompt.
4. Salida estructurada JSON.
5. Enriquecimiento/validacion.
6. Entrega destino (DB/API/queue/file/system).
7. Telemetria y evidencia.

Esto cubre tu ejemplo ICD10 sin convertir la plataforma en “producto ICD10”.

---

## 10) Plan de adopcion para cliente rapido (fast-track)

Semana 1:

- Deploy orchestrator dedicado PaaS.
- Configurar runner(s) en red cliente.
- Integrar vault BYO del cliente.
- Activar control-plane usage + fleet heartbeat.

Semana 2:

- Migrar bot inicial (ej. diagnostico -> ICD10 via nodo agente con JSON output).
- Definir guardrails y pruebas con datos enmascarados.
- Acordar SLO operativo y runbooks.

Semana 3:

- Activar modelo comercial (bot rentado + prompts premium si aplica).
- Dashboard de telemetria y costos.
- Sign-off de seguridad.

---

## 11) Decisiones de producto recomendadas (directas)

- Si: plataforma universal, verticales como “packs” encima.
- Si: orquestador por cliente (single-tenant PaaS) + control-plane central.
- Si: bots rentados y marketplace.
- Si: prompts premium protegidos + prompts del cliente coexistiendo.
- Si: adaptar UX de proyectos fuente con branding nativo Skuld (logo/paleta/componentes propios).
- No: prompts premium visibles en DSL del cliente.
- No: secretos en bot package o configuraciones en claro.
- No: clonar identidad visual de sistemas origen aunque se reutilice funcionalidad.
- No: pasar a producción regulada con TODO/mock en vault/auth/telemetry chain.

---

## 12) KPIs de exito

Tecnicos:

- % runs con secretos via vault references = 100%.
- % orchestrators con heartbeat activo en CP > 99.5%.
- MTTR incidentes P1 < 60 min.
- Error rate ejecucion < 1%.

Producto/negocio:

- ARPA por cliente = (orchestrator + runners + bots + prompt packs).
- Attach rate de prompts premium por bot.
- Retencion de bots instalados y uso mensual por tenant.
- Lead->trial conversion rate por vertical.
- Trial->paid conversion con prompts premium y bots rentados.
- Campaign deliverability y engagement (open/click/bounce/complaint) por tenant.

Compliance:

- 0 hallazgos criticos en auditoria interna.
- Evidencia completa y verificable por trimestre.
