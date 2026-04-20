# ADR-0001: Engineering Standards y Reglas Operativas

**Fecha**: 2026-04-14
**Estado**: Aceptado
**Autor**: Luis (propuesta), Albert (documentacion), Dubiel (aprobacion)

## Contexto

El proyecto SkuldBot esta en transicion de desarrollo inicial a plataforma enterprise-grade.
Se identificaron 47 defectos en la auditoria de abril 2026 y se creo un plan de 9 sprints
para llevar la plataforma a produccion. Se necesitan reglas operativas claras para que
el trabajo nuevo no acumule mas deuda tecnica.

## Decision

Adoptamos 5 reglas operativas vinculantes:

1. **No merge sin Quality Gate** — build, tests, lint critico, seguridad minima, smoke deploy
2. **ADR para cambios grandes** — decisiones tecnicas escritas y versionadas
3. **Tests de integracion obligatorios** — cada modulo nuevo con contracts + integration tests
4. **Zero quick-fix** — hardening y observabilidad van en el mismo PR funcional
5. **Marketplace con flujo estricto** — draft → certification → approved → published

## Alternativas Consideradas

1. **"Move fast and break things"** — Descartado. No es viable para enterprise RPA en industrias reguladas.
2. **Standards solo para produccion** — Descartado. La deuda se acumula en desarrollo y es mas cara de pagar despues.
3. **Standards graduales** — Descartado. Reglas parciales se ignoran. Mejor definir todo desde el inicio.

## Consecuencias

- PRs tardaran mas en mergearse (requieren tests, review, QG)
- El codigo nuevo sera mas confiable desde el primer commit
- La deuda tecnica existente se paga gradualmente (no se agrega nueva)
- El marketplace tendra menor volumen pero mayor calidad
- El equipo tiene reglas claras — menos ambiguedad, menos discusiones

## Implementacion

- Documento: `docs/ENGINEERING_STANDARDS.md` (version 1.0)
- Aplica a partir de Sprint 0 del Master Plan
- Todo el equipo (Dubiel, Albert, Luis) es responsable de enforcement
