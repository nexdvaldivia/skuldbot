# Vertical Workers Architecture

Fecha: 2026-04-19
Estado: APROBADO — arquitectura obligatoria para todos los verticals
Ámbito: Skuld Platform — modelo de deployment, licensing, IP protection, y prompt architecture

---

## 1. Visión

Los Vertical Workers son micro-sistemas autónomos pre-construidos que resuelven problemas
completos de negocio. No son bots — son sistemas operacionales que piensan, ejecutan,
almacenan y evolucionan dentro de la infraestructura del cliente.

| Lo que NO son | Lo que SÍ son |
|---------------|---------------|
| Bot de facturas | Autonomous Accounts Payable System |
| Bot de claims | Autonomous Claims Intake System |
| Bot de compliance | Autonomous Compliance Engine |
| Bot de ventas | Autonomous Sales Pipeline System |
| Bot de reconciliación | Autonomous Reconciliation System |

**Posicionamiento:** "Automation IP Layer running inside your infrastructure"

---

## 2. Modelo de Deployment

Los Vertical Workers se despliegan en la infraestructura del cliente (Data Plane).
Skuld no controla la ejecución directa, pero controla el acceso, la inteligencia y la evolución.

```
┌─────────────────────────────────────────────────────┐
│  SKULD CONTROL PLANE (Skuld, LLC)                   │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Licensing │  │ Prompt   │  │ Updates &        │   │
│  │ Engine   │  │ Layer    │  │ Evolution        │   │
│  │          │  │ (IP)     │  │                  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────────────┘   │
│       │              │              │                 │
└───────┼──────────────┼──────────────┼─────────────────┘
        │              │              │
   heartbeat      promptRef       updates
        │              │              │
┌───────┼──────────────┼──────────────┼─────────────────┐
│       ▼              ▼              ▼                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ License  │  │ Prompt   │  │ Bot Package      │   │
│  │ Validator│  │ Resolver │  │ (.skb)           │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │         VERTICAL WORKER (ejecución)          │   │
│  │                                               │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │   │
│  │  │ DB      │  │ KeyVault │  │ AI Agent   │  │   │
│  │  │ Manager │  │          │  │            │  │   │
│  │  └─────────┘  └──────────┘  └────────────┘  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  CLIENT DATA PLANE (infraestructura del cliente)     │
└──────────────────────────────────────────────────────┘
```

**Principio:** Los datos del cliente NUNCA salen de su infraestructura.
La inteligencia de Skuld se consume via API, no se almacena localmente.

---

## 3. Los 3 Mecanismos de Control

### 3.1 Licensing (Kill Switch)

El Orchestrator del cliente valida la licencia via heartbeat periódico al Control Plane de Skuld.

```
Bot inicia → Orchestrator verifica licencia → CP valida → OK → Bot ejecuta
                                                         → FAIL → Bot se detiene
```

**Reglas:**
- Sin licencia válida = no ejecuta. No hay modo "degradado".
- Heartbeat periódico (configurable, default cada 1 hora).
- Grace period configurable (default 24h) para tolerancia de red.
- Después del grace period = kill switch activado.
- Feature flags por vertical: el cliente paga por los verticals que usa.
- License token firmado con fecha de expiración.

**Implementación:**
- `validateEntitlement(tenantId, feature, capability, context)` — punto único de decisión.
- Heartbeat en el Runner/Orchestrator del cliente.
- CP endpoint: `POST /api/v1/licenses/validate` (ya existe en Nexion).
- Evidence Pack registra: license validation result por ejecución.

### 3.2 Prompt Layer (IP / Moat)

Los prompts de Skuld son la inteligencia que hace funcionar los verticals como sistemas completos.
Son IP de Skuld, LLC — nunca se almacenan en el bot, nunca se exponen al cliente.

**Dos niveles de prompts:**

| Nivel | Propietario | Ubicación | Acceso |
|-------|------------|-----------|--------|
| **Skuld Prompts** | Skuld, LLC | Control Plane | promptRef → runtime resolution |
| **Client Prompts (BYOPrompt)** | Cliente | Orchestrator del cliente | Control total del cliente |

**Skuld Prompts incluyen:**
- Arquitectura de razonamiento del agente (ReAct chains)
- Lógica de clasificación de riesgo (FNOL, compliance, fraud)
- Templates de evaluación y decisión
- Reglas de procesamiento por industria (HIPAA, SOC2, PCI)
- Cadenas de decisión para aprobación/rechazo

**Client Prompts (BYOPrompt) incluyen:**
- Reglas de negocio específicas del cliente
- Adaptaciones a su flujo de trabajo
- Prompts custom para sus casos particulares
- El cliente es dueño completo de estos prompts

**Cómo funciona:**

```
Bot ejecuta nodo AI → necesita prompt →
  1. ¿Es promptRef de Skuld? → CP resuelve via API → prompt en memoria efímera → ejecuta → descarta
  2. ¿Es BYOPrompt del cliente? → Orchestrator local resuelve → ejecuta
```

**Si el cliente deja de pagar:**
- Sus BYOPrompts → los conserva (son suyos)
- Skuld Prompts → dejan de resolver (promptRef retorna 403)
- Bot → se queda con la estructura pero sin la inteligencia de Skuld

**Reglas obligatorias:**
- Los Skuld Prompts NUNCA se hardcodean en el .skb ni en el DSL.
- Los Skuld Prompts NUNCA se almacenan en el Orchestrator del cliente.
- El .skb contiene `promptRef: "skuld://claims/classify-risk/v2"`, no el texto del prompt.
- El promptRef se resuelve en runtime via API al CP.
- El prompt vive en memoria efímera del Runner, nunca persiste.
- El Evidence Pack registra: promptRef usado, tokens consumidos, latencia. NO el texto del prompt.

### 3.3 Updates & Evolution

El cliente depende de Skuld para mejorar los verticals. Sin updates, el vertical se congela
en su versión actual y pierde valor progresivamente.

**Lo que Skuld actualiza:**
- Nuevas versiones del vertical (mejoras de lógica, nuevos nodos)
- Optimizaciones de rendimiento
- Adaptaciones a cambios regulatorios (HIPAA updates, nuevas reglas SOC2)
- Nuevos prompts y cadenas de decisión
- Bug fixes y patches de seguridad
- Nuevas integraciones y conectores

**Modelo de updates:**
- Updates entregados via el CP como nuevas versiones del .skb
- El Orchestrator del cliente descarga y aplica (manual o automático según config)
- Versionado semántico: major (breaking), minor (features), patch (fixes)
- Rollback disponible a versión anterior

---

## 4. Protección de IP

### 4.1 Qué contiene el .skb (visible al cliente)

```
bot-vertical-claims.skb
├── manifest.json          # Metadata, versión, dependencias
├── main.py                # Workflow structure (nodos, conexiones, flujo)
├── resources/
│   └── keywords.py        # Keywords genéricos
├── variables/
│   └── config.yaml        # Configuración del vertical
└── requirements.txt       # Dependencias Python
```

**El .skb es la estructura, no la inteligencia.** Es como tener el chasis de un auto
sin el motor. Funciona para mover piezas, pero no para conducir.

### 4.2 Qué NO contiene el .skb (protegido)

- Skuld Prompts (viven en CP, se resuelven por promptRef)
- Reglas de clasificación de riesgo (IP de Skuld)
- Cadenas de decisión avanzadas (IP de Skuld)
- Templates de evaluación por industria (IP de Skuld)
- Lógica de scoring y priorización (IP de Skuld)
- Modelos de decisión entrenados (IP de Skuld)

### 4.3 Blindaje anti-copia

| Mecanismo | Qué previene |
|-----------|-------------|
| License heartbeat | Usar sin pagar |
| promptRef (no hardcode) | Copiar la inteligencia |
| Compiled components | Reverse-engineer el runtime |
| Update dependency | Congelar y divergir |
| Evidence Pack | Probar uso sin licencia (legal) |

---

## 5. Pricing

| Componente | Precio |
|-----------|--------|
| Vertical Worker (por vertical, por mes) | $10,000 — $30,000 |
| Volumen / procesamiento | + variable según uso |
| Suscripción Orchestrator | Base mensual |
| Licencia por Runner | Por runner activo |
| BYOPrompt (client custom) | Incluido en suscripción |
| Updates y evolución | Incluido en suscripción |

**Justificación del precio:** El cliente está comprando un sistema operacional completo
que corre en su infraestructura, con inteligencia enterprise, compliance auditable,
y evolución continua. No está comprando un script.

---

## 6. Conexión con Nexion

```
Skuld → crea micro-sistemas autónomos (ejecución + memoria + control)
Nexion → les da datos gobernados (pipelines + quality + cataloging)

Resultado: Autonomous systems operating on governed enterprise data
```

Nexion ya tiene implementado:
- Heartbeat + license validation
- Prompt layer separado
- Entitlement engine
- Feature flags por vertical
- Kill switch por org

SkuldBot porta este modelo y le suma:
- Database Manager (memoria persistente por bot)
- KeyVault (gestión enterprise de secrets)
- Compliance-first desde día 1 (envelope encryption, audit trail, 0 deuda)
- Multi-cloud by design (no deuda de migración)

---

## 7. Relación con otros documentos

| Documento | Relación |
|-----------|----------|
| `CLAUDE.md` | promptRef pattern, Evidence Pack, BYO model |
| `COMPLIANCE_FIRST_POLICY.md` | Encryption, audit trail, licensing gates |
| `QUALITY_GATE_CHECKLIST.md` | QG11 (Licensing Gate), QG13 (Runtime Contract) |
| `skuld_architecture_strategy_final.pdf` | Database Manager + KeyVault = memoria del micro-sistema |
| `NEXION_PLN005_LESSONS_FOR_SKULD.md` | Entitlement engine, error catalog, audit denials |

---

## 8. Mensaje por audiencia

| Audiencia | Mensaje |
|-----------|---------|
| **Dev team (interno)** | Construimos micro-sistemas autónomos. Cada bot es un sistema completo con DB, vault, y AI. Los prompts de Skuld son IP — nunca en el .skb |
| **Sales / Partners** | Autonomous Operations Platform. Sistemas que corren en la infra del cliente con inteligencia de Skuld |
| **CIO / Executive** | "We don't automate tasks. We build systems." — Skuld despliega agentes digitales que piensan, almacenan y evolucionan. Tú controlas todo. Nosotros proporcionamos la inteligencia |
| **Legal / Compliance** | Datos soberanos del cliente. Licencia validada por heartbeat. Evidence Pack auditable. Compliance-first by design |

---

## Versionado

| Versión | Fecha | Cambio |
|:-------:|-------|--------|
| 1.0 | 2026-04-19 | Creación — arquitectura de Vertical Workers |
