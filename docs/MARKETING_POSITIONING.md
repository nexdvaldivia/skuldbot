# SkuldBot — Marketing Positioning

**Fecha:** 2026-04-21
**Estado:** Aprobado para uso en web, sales deck, partner collateral
**Regla rectora:** NO comparar directamente con competidores en contenido público. Destacar lo que nosotros somos, no lo que los otros no son.

---

## 0. Posicionamiento central

### Lo que somos

**SkuldBot es una plataforma de micro-sistemas autónomos — una fuerza de trabajo digital para operaciones reguladas.**

No automatizamos tareas. **Construimos sistemas.** Cada micro-sistema interpreta, decide, ejecuta y documenta. Tiene su propia memoria, su propio contexto, su propia trazabilidad criptográfica.

### Tres niveles de mensaje (elegir según audiencia)

| Audiencia | Mensaje |
|---|---|
| **CIOs / conferences / decision makers** | *"We don't automate tasks. We build systems."* |
| **Product / web / partners** | *"Autonomous Operations Platform — digital workforce for regulated industries."* |
| **Arquitectura / equipos técnicos internos** | *"Micro-sistemas autónomos con memoria persistente, vault dedicado, evidence criptográfica."* |

### La frase de una línea

> **"SkuldBot builds autonomous micro-systems that think, act, and prove it — inside your infrastructure."**

### One-paragraph (30-segundos)

> SkuldBot is an Autonomous Operations Platform. Instead of scripting bots that break when things change, you deploy autonomous micro-systems that interpret, reason, and act — while generating cryptographically-signed evidence of every decision. Each system runs inside your infrastructure, on any OS, using your own models and your own data. Built for healthcare, insurance, finance, government, and any industry where compliance is not optional.

---

## 1. Categoría

**No somos RPA. No somos workflow automation. No somos una AI platform.**

Somos una categoría nueva: **Autonomous Operations Platform**.

Un Autonomous Operations Platform se distingue porque:
- Los sistemas **piensan antes de ejecutar** (agentes LLM en el runtime)
- Los sistemas **tienen memoria** (no son scripts stateless)
- Los sistemas **documentan su razonamiento** (Evidence Pack firmado)
- Los sistemas **viven en la infraestructura del cliente** (no en la nuestra)
- Los sistemas **hablan entre sí** (flow + bot + agent orquestados como un solo run)

Términos que usamos: **digital workforce, micro-autonomous systems, autonomous operations, reasoning-first automation, regulated-first platform**.

Términos que **no** usamos en external messaging: ~~RPA, bot de X, automatización de tarea, script, macro, workflow engine, AI assistant, co-pilot~~.

---

## 2. Pilares de valor

### Pilar 1 — Sistemas que piensan, no scripts que se rompen

Tus operaciones no son deterministas. Los documentos llegan diferentes, las APIs cambian, los sistemas legacy se reinventan. Los sistemas autónomos de SkuldBot interpretan contexto antes de actuar — y cuando dudan, preguntan; cuando deciden, lo justifican.

### Pilar 2 — Todo se ejecuta en tu infraestructura

Tu Orchestrator vive en tu subscripción (Azure, AWS, GCP, on-prem). Tus runners están donde vos los pongas. Tus modelos de IA son tuyos — no hay LLM central de Skuld procesando tu data. Tus secretos se quedan en tu vault. Tu evidencia se queda en tu almacenamiento. **Nosotros nunca somos intermediarios de tu data sensible.**

### Pilar 3 — Evidencia criptográfica de cada decisión

Cada ejecución emite un Evidence Pack firmado e inmutable con:
- Qué datos se procesaron (linaje completo + clasificación PII/PHI/PCI)
- Qué decisiones tomó el agente (prompt, respuesta, razonamiento, alternativas consideradas)
- Qué controles se aplicaron (policy enforcement, redactions, approvals)
- Cuándo, dónde, con qué modelo — con hash + firma digital + chain of custody

Un auditor puede verificar la integridad **offline**. Un CTO puede dormir tranquilo.

### Pilar 4 — Compliance desde el diseño, no desde un módulo externo

HIPAA, SOC 2, PCI-DSS, GDPR, Finance (SOX) son policy packs que se evalúan **antes** de que tu sistema corra y **durante** la ejecución. No es auditoría pos-mortem. Si una regla se viola, el sistema no arranca.

### Pilar 5 — Multi-OS nativo

Tus sistemas autónomos corren en Windows, macOS y Linux — igual de bien. No requerís flotas Windows solo porque la herramienta no te da opción.

### Pilar 6 — Híbrido unificado: flows + bots + agentes en un solo runtime

Un mismo proceso puede mezclar lógica de APIs, interacción con UI real (incluyendo Citrix/SAP/legacy), y razonamiento LLM — todo bajo un único ID de ejecución, un único audit trail, un único contrato.

### Pilar 7 — Trae tus propios modelos (BYOM)

Usá el LLM que quieras: OpenAI, Anthropic, Azure OpenAI, AWS Bedrock, Google Vertex, Ollama on-prem, o tu modelo custom en tu VPC. El sistema decide automáticamente qué proveedor usar según la clasificación de la data — PHI nunca sale a un LLM público sin BAA firmado.

### Pilar 8 — Governance multi-tenant real

Jerarquía completa de tenants → folders → resources con inheritance de permisos. Aislamiento de cómputo real (no solo lógico): los runners, queues y storage de un tenant jamás tocan la data de otro.

---

## 3. Casos de uso (storytelling por industria)

Cada caso es un **sistema autónomo** con nombre propio. No "bot". No "workflow".

### Healthcare

- **Autonomous Claims Intake System** — recibe claim, clasifica PHI, extrae datos del CMS-1500, valida contra policy, interpela al operador humano si hay ambigüedad, genera Evidence Pack HIPAA-compliant.
- **Autonomous Prior Authorization Engine** — razonamiento clínico contra el payer policy, documentación de criterios Milliman/InterQual, trazabilidad para appeals.
- **Autonomous Lab Results Processor** — parsing de HL7/FHIR, triage de resultados críticos, notificación clínica con audit.

### Insurance

- **Autonomous FNOL (First Notice of Loss) System** — llamada entrante, extracción estructurada del claim, decisión sobre next best action, handoff documentado al adjuster.
- **Autonomous Underwriting Assistant** — recoleccción de broker submission, cross-check contra reinsurance policies, recomendación con explicabilidad.

### Finance / Banking

- **Autonomous KYC Refresh Engine** — detección de refresh due date, recolecta documentación actualizada, ejecuta AML checks, genera paquete auditable para regulator.
- **Autonomous Reconciliation System** — match multi-source, resolución de excepciones con razonamiento, escalation con threshold configurable.

### Government / Public Sector

- **Autonomous Permit Processing System** — intake ciudadano, verificación cruzada contra múltiples sistemas legacy, decisión documentada, notificación con track & trace.

### Logistics

- **Autonomous Exception Handler** — monitoreo de milestones de tracking, detección de anomalías, acción correctiva (reschedule, alternate route, customer notify) con audit.

---

## 4. Características técnicas en lenguaje de producto

### Arquitectura en 1 línea

> **Orchestrator en tu cloud + Runners multi-OS + Agentes LLM + Evidence Pack.**

### Features visibles (para web / deck)

| Feature | Beneficio |
|---|---|
| **Visual Designer** | Diseña sistemas autónomos con drag-and-drop; preview en vivo; debug local sin deploy. |
| **Multi-OS Runners** | Windows / macOS / Linux con el mismo sistema, sin rewrite. |
| **Cognitive Agents** | LLM integrado al runtime — el sistema razona, no solo ejecuta. |
| **Bring Your Own Model** | Configurá tu LLM por tenant: OpenAI, Anthropic, Azure, AWS, Google, Ollama on-prem. |
| **Own Your Infrastructure** | Todo corre en tu cloud o on-prem. Nosotros nunca vemos tu data. |
| **Evidence Pack** | Cada run firma un paquete inmutable — verificable offline por tu auditor. |
| **Policy Packs** | HIPAA / SOC 2 / PCI-DSS / GDPR / Finance — evaluados antes y durante la ejecución. |
| **Enterprise Vault** | Plugin architecture: Azure KV / AWS Secrets / HashiCorp / CyberArk. |
| **Session Isolation** | Cada ejecución en su propia sesión aislada; cleanup automático en datos sensibles. |
| **Audit-First Observability** | Tracing distribuido con correlación end-to-end; métricas operacionales separadas del audit trail inmutable. |
| **Legacy-Friendly** | Citrix, SAP, mainframes, apps internas — el runtime lo maneja sin scripting de imágenes frágil. |
| **Multi-Tenant Governance** | Jerarquía tenants → folders → resources con RBAC granular e inheritance. |

---

## 5. Messaging por segmento

### Healthcare CIO

> "Tus procesos de claims, prior auth y lab results pueden ser operados por sistemas autónomos que piensan clínicamente, nunca envían PHI fuera de tu infraestructura, y documentan cada decisión con un Evidence Pack firmado que tu compliance officer puede verificar en segundos."

### Insurance COO

> "Acelerá el time-to-decision de FNOL, underwriting y claims con sistemas autónomos que razonan con tus policies, escalan al adjuster cuando hay duda, y dejan audit trail inmutable para reguladores estatales."

### Banking CRO

> "KYC refresh, AML review, y reconciliation operadas por sistemas autónomos que corren dentro de tu VPC, usan tu LLM, y generan la evidencia que tu auditor pide — antes de que la pida."

### Government CTO

> "Sistemas autónomos que atienden trámites ciudadanos 24/7, se integran con tus sistemas legacy (sí, incluso los que hablan Cobol), y dejan Evidence Pack con firma criptográfica que resiste cualquier information request."

### MSP / Systems Integrator

> "Construí autonomous operations platforms para tus clientes regulados. SkuldBot corre en la infraestructura de ellos, vos operás la capa de sistemas. White-label disponible."

---

## 6. Taglines

### Principales (para hero / header)

- **"Autonomous systems. In your infrastructure. Proving every step."**
- **"We don't automate tasks. We build systems."**
- **"The digital workforce for regulated operations."**
- **"Think. Act. Prove it."**

### Secundarios (para secciones, banners, sales)

- "AI agents that reason, decide, and document."
- "Your infrastructure. Your models. Your evidence."
- "Cognitive automation for audit-grade operations."
- "Beyond scripts: systems that think."
- "Every decision documented. Every action audited."
- "Run anywhere — prove everywhere."
- "Own the workforce, not the vendor."

### Anti-taglines (NO usar)

- ~~"RPA with AI"~~ → somos más que RPA
- ~~"Better than UiPath"~~ → no comparamos
- ~~"No-code bots"~~ → bots no es el concepto, sistemas sí
- ~~"Automate everything"~~ → "everything" es vago; la promesa es audit-grade operations
- ~~"AI assistant / co-pilot"~~ → nosotros operamos, no asistimos

---

## 7. FAQ de messaging interno (para el equipo)

**¿Por qué dejamos de decir "RPA"?**
Porque un sistema que tiene DB propia, vault propio, razonamiento propio y evidencia propia no es un script que hace click. Es un business system completo.

**¿Y si el cliente pregunta "¿hacen RPA?"?**
"Sí, podés automatizar tareas, pero te damos algo que va mucho más allá: sistemas autónomos completos con razonamiento, memoria, y evidencia. El RPA es un caso de uso, no nuestro posicionamiento."

**¿Por qué no comparamos directamente con UiPath / n8n / ElectroNeek en marketing público?**
- Dar nombre a competidores es darles SEO gratis.
- Las comparativas directas envejecen mal (ellos sacan features, uno queda desactualizado).
- Nos posicionamos como categoría nueva, no como alternativa.

**¿Dónde sí comparamos?**
En sales deck 1:1 (con disclaimer legal), en RFPs cuando el prospect pregunta explícitamente, en battlecards internos de sales. **Nunca** en la web, blog, social o material descargable público.

**¿Qué hacemos si un analista (Gartner, Forrester) nos pide comparar?**
Posicionamos como categoría "Autonomous Operations Platform" y argumentamos por qué no encajamos del todo en RPA ni en AI platform ni en workflow automation.

---

## 8. Glosario de términos (consistente en todo contenido)

| Usar | En lugar de |
|---|---|
| Autonomous system | Bot |
| Digital workforce | RPA fleet |
| Autonomous Operations Platform | RPA platform |
| Cognitive agent | AI add-on |
| Evidence Pack | Audit log |
| Policy Pack | Compliance module |
| Run | Execution / job (depende de contexto) |
| Runner | Worker / executor |
| Orchestrator | Management server |
| Tenant infrastructure | Customer environment |
| Bring Your Own Model | Multi-provider support |
| Flow Engine / Bot Engine | Workflow / RPA |
| Micro-autonomous system | Process bot |
| Deploy in your subscription | Self-hosted |

---

## 9. Mapeo a secciones del sitio web

El sitio actual vive en `web/skuldbotweb/frontend/src/` (Next.js). Propuestas de mejora usando este material:

### Homepage

| Sección actual | Propuesta de update |
|---|---|
| Hero (tagline + CTA) | Reemplazar con "Autonomous systems. In your infrastructure. Proving every step." + CTA "See a system in action" |
| Features grid | Re-estructurar en los **8 pilares** (Sección 2) — cada pilar es una card con icon, title, copy corto |
| Industries section | Usar los **casos de uso con nombre propio** (Sección 3) — cada card nombra el sistema autónomo ("Autonomous Claims Intake System"), no una función genérica |
| Social proof / logos | (Mantener) |
| CTA final | "Own the workforce, not the vendor — Book a demo" |

### Platform / Product page

- Sección "How it works": usar el diagrama de arquitectura del `ORCHESTRATOR_ARCHITECTURE.md` (versión ejecutiva 12 módulos, sin los detalles técnicos) — posicionar como "Your infrastructure, our runtime."
- Sección "Compliance" separada destacando Evidence Pack + Policy Packs como diferenciadores — ejemplo visual del JSON firmado con hash chain.
- Sección "Bring Your Own" con logos de LLM providers (Ollama, OpenAI, Anthropic, Azure, AWS, Google) — mensaje: "Use your model, your data, your rules."

### Industry pages (healthcare, insurance, finance, gov)

Una página por vertical, con:
- Tres casos de uso de sistemas autónomos (Sección 3) con nombres específicos
- Compliance applicable (HIPAA, SOX, etc.)
- Messaging por segmento (Sección 5)

### Pricing page

- Eliminar lenguaje "per bot" / "per script"
- Hablar de "per autonomous system" o "per tenant" (alineado con memoria "Licencias/modelo de negocio: después de estabilizar runtime core" — pricing queda pendiente de definir por producto)

### Blog / Content strategy

Temas sugeridos (sin mencionar competidores):

- "Why autonomous systems need evidence packs, not audit logs"
- "The difference between automation and autonomy"
- "BYOM: why compliance-first teams run their own LLMs"
- "Cognitive agents as regulated-operations workforce"
- "What makes a business system 'autonomous'?"
- "Multi-OS automation: why Windows-only doesn't cut it anymore"

---

## 10. Assets pendientes para generar

Lista de artefactos que podemos crear con este material (no incluidos aún):

- [ ] Homepage hero video (30s): un "autonomous claims intake system" en acción end-to-end
- [ ] One-pager PDF por industria (healthcare, insurance, finance, gov) — 2 páginas cada uno
- [ ] Sales deck (12 slides) — usar los 8 pilares como esqueleto
- [ ] Battlecards internos (NO público) — con comparativa técnica real
- [ ] Demo script de "Autonomous Claims Intake System" (scripted walkthrough)
- [ ] Whitepaper: "Evidence-Grade Automation for Regulated Industries"
- [ ] Case study template — cómo partners cuentan historias de transformación
- [ ] Glossary page (Sección 8) como referencia pública

---

## 11. Regla de oro para copywriters y diseñadores

**Antes de publicar cualquier contenido externo, pasar por este check:**

- [ ] No menciona competidores por nombre
- [ ] No usa "RPA", "bot", "script", "workflow tool"
- [ ] Habla en términos de "sistemas autónomos" / "digital workforce" / "autonomous operations"
- [ ] Cada claim tiene evidencia (Evidence Pack, Policy Pack, BYOM)
- [ ] Copy ejemplifica con casos nombrados (Autonomous X System), no genéricos
- [ ] No promete cosas que no entregamos hoy (si es roadmap, decirlo)

---

## 12. Referencias internas (NO linkear públicamente)

- **Arquitectura técnica autoritativa:** `docs/ORCHESTRATOR_ARCHITECTURE.md` — tiene la comparativa técnica completa (Sección 3.1) para sales/RFP/analyst briefings.
- **Plan ejecutivo:** `~/.claude/plans/zippy-churning-wand.md` — Plan Unificado de runtime (Studio + Orchestrator + Runner).
- **Memoria de posicionamiento:** `memory/project_positioning_change.md` — decisión de 2026-04-17.
- **CLAUDE.md del repo** — principios compliance-first + BYO-Everything.

---

**Copywriter note**: este doc es el **source of truth** del messaging. Si un feature tiene varios nombres internos, acá mandamos. Si hay duda, se consulta este doc antes de publicar.
