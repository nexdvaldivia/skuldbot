# Skuldbotweb Continuity Baseline

Fecha: 2026-02-22  
Estado: decision arquitectonica activa

## 1) Decision oficial

- `skuldbotweb` es la base oficial para continuar el sitio de Skuld.
- No se copiara ni se reemplazara la web con codigo de `nexion-website`.
- Referencias desde Nexion/Nexion-One se limitan a capacidades de negocio (CRM, marketing ops, RBAC, evidencia), no a clonado de UI/branding.

## 2) Inventario real de `skuldbotweb`

Estructura:

- `skuldbotweb/frontend` (Next.js App Router)
- `skuldbotweb/backend` (NestJS)
- `skuldbotweb/MARKETING_CONTENT.md` (contenido comercial)

Rutas frontend detectadas:

- `/`
- `/about`
- `/compliance`
- `/contact`
- `/features`
- `/integrations`
- `/partners`
- `/pricing`
- `/products/orchestrator`
- `/products/runner`
- `/products/studio`
- `/roi-calculator`
- `/use-cases`

Secciones/componentes principales:

- `Hero`, `WhySkuldBot`, `Features`, `HowItWorks`, `AIAgents`, `AIPlanner`
- `DataConnectors`, `DataQuality`, `Compliance`, `UseCases`, `Pricing`, `CTA`
- `Navbar`, `Footer`

Backend API actual:

- `GET /api`
- `GET /api/health`
- `POST /api/contact`
- `POST /api/contact/newsletter`
- `POST /api/contact/demo`

## 3) Hallazgos de continuidad

- El formulario de contacto en frontend usa simulacion local (`setTimeout`) y no integra el backend real.
- `contact.service.ts` en backend esta en modo placeholder (sin CRM/email provider productivo).
- Existen links `href=\"#\"` en partes del sitio (pendiente cerrar rutas reales).

## 4) Adaptacion correcta (sin copiar web externa)

Si se reutiliza trabajo de Nexion-One, debe entrar por:

- `control-plane/api` para CRM/marketing/ventas/integraciones provider-first.
- `control-plane/ui` para backoffice enterprise (no para sustituir sitio marketing).
- contratos `CP <-> Orchestrator` para telemetria, licencias y fleet management.

No debe entrar por:

- copiar templates/paginas completas de `nexion-website`,
- replicar paleta, logo o identidad visual de Nexion,
- mezclar assets o textos sin adaptacion de marca Skuld.

## 5) Plan inmediato para `skuldbotweb`

1. Conectar `contact` frontend a endpoints reales de backend (`/api/contact*`).
2. Implementar pipeline productivo de leads/newsletter/demo en backend (DB + email + auditoria).
3. Eliminar placeholders `href=\"#\"` con rutas o CTAs reales.
4. Añadir telemetria comercial y evidencia de conversion apta para entornos regulados.
5. Publicar trust/compliance content alineado a HIPAA/SOC2 y contratos de producto reales.
