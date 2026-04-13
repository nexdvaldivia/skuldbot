# Nexion Evidence Package: Evaluacion de Trazabilidad para Skuld

Fecha: 2026-02-22

## 1) Veredicto ejecutivo

Si, el `evidence package` de Nexion esta bueno y conviene reutilizarlo como base de Skuld.

Conclusion corta:

- `nexion` aporta evidencia tecnica de ejecucion (runs, lineage, artifacts, policy).
- `nexion-one` aporta evidencia legal/contractual (aceptaciones, firma, PDF firmado, hash y verificacion).
- La combinacion de ambos patrones encaja con clientes altamente regulados.

## 2) Evidencia concreta encontrada

### 2.1 Nexion (trazabilidad tecnica de runtime)

- Modelo dedicado de pack por run: `nexion/backend/app/models/transform_spec.py:865`
- Servicio de evidencia deterministica: `nexion/backend/app/services/transform_evidence_service.py:108`
- Hash canonico SHA-256 (JSON ordenado): `nexion/backend/app/services/transform_evidence_service.py:476`
- Secciones incluidas en payload:
  - run/spec/variables/engine/policy/artifacts/lineage/rollback/retry/error: `nexion/backend/app/services/transform_evidence_service.py:351`
- Verificacion anti-tamper por recomputacion:
  - servicio: `nexion/backend/app/services/transform_evidence_service.py:288`
  - endpoint: `nexion/backend/app/api/v1/transforms.py:973`
- Endpoints completos (generate/get/status/verify):
  - `nexion/backend/app/api/v1/transforms.py:862`
  - `nexion/backend/app/api/v1/transforms.py:924`
  - `nexion/backend/app/api/v1/transforms.py:949`
  - `nexion/backend/app/api/v1/transforms.py:973`
- Test de deteccion de tampering:
  - `nexion/backend/tests/test_transform_evidence_service.py:601`

### 2.2 Nexion (pack de compliance/auditoria)

- Modelo de evidence pack con metadata y tracking de acceso:
  - `nexion/backend/app/models/auditor.py:389`
- Generacion de pack de compliance:
  - `nexion/backend/app/services/audit_service.py:1414`
- API para generar/listar/descargar packs:
  - `nexion/backend/app/api/v1/audit.py:953`
  - `nexion/backend/app/api/v1/audit.py:991`
  - `nexion/backend/app/api/v1/audit.py:1025`

### 2.3 Nexion-One (evidencia legal y contractual)

- Registro legal fuerte en `ContractAcceptance`:
  - snapshots, hashes y evidencia de aceptacion: `nexion-one/backend/app/models/contract.py:596`
- Verificacion deterministica de evidencia legal:
  - `nexion-one/backend/app/api/v1/contracts.py:1196`
- Flujo offline enterprise con evidencia PDF y hash:
  - upload y hash server-side: `nexion-one/backend/app/api/v1/admin/signing.py:725`
  - complete-offline: `nexion-one/backend/app/api/v1/admin/signing.py:783`
  - validaciones estrictas de hash: `nexion-one/backend/app/services/signing_service.py:1566`
- Guard de integridad de snapshots:
  - `nexion-one/backend/scripts/check_contract_snapshot_integrity.py:1`

## 3) Gaps a corregir antes de copiar 1:1

## 3.1 Gap de inmutabilidad del payload runtime (importante)

- En transform evidence, por API se genera pack sin `storage_base_path`, por lo que `pack_uri` puede quedar nulo y no persistir snapshot immutable por defecto.
- Referencias:
  - build con storage opcional: `nexion/backend/app/services/transform_evidence_service.py:127`
  - endpoint sin base path: `nexion/backend/app/api/v1/transforms.py:867`

Impacto:

- Hay hash y verificacion, pero sin almacenamiento inmutable obligatorio el auditor depende de estado actual para recomputar.

## 3.2 Gap de cadena de custodia de descarga

- El modelo tiene `download_count/last_downloaded_*`, pero el endpoint de descarga del pack no actualiza contadores.
- Referencias:
  - campos de tracking: `nexion/backend/app/models/auditor.py:485`
  - endpoint download: `nexion/backend/app/api/v1/audit.py:1025`

Impacto:

- Se debilita trazabilidad de acceso al evidence package.

## 3.3 Gap de verificacion dedicada del pack de compliance

- Se calcula `file_hash` en generacion, pero no se ve endpoint dedicado para re-verificar ese pack con la misma semantica fuerte del flujo transform.
- Referencia de hash: `nexion/backend/app/services/audit_service.py:1495`

Impacto:

- Integridad existe, pero el proceso formal de verificacion reutilizable/auditable queda incompleto.

## 4) Recomendacion para Skuld (adopcion enterprise)

Implementar `Evidence Core` en Skuld fusionando ambos patrones:

- `Evidence Runtime Pack` (de Nexion):
  - por run y por nodo (RPA + agent + data movement),
  - payload canonico, hash SHA-256, verify endpoint,
  - lineage de datos + lineage de decisiones del agente.

- `Evidence Legal Pack` (de Nexion-One):
  - consentimiento/aceptacion contractual, firma, snapshot de terminos,
  - hashes de artefactos legales (PDF/JSON),
  - verificacion deterministica y evidencia offline.

- Controles extra obligatorios en Skuld:
  - almacenamiento WORM/immutable por defecto (S3 Object Lock/Azure Immutable Blob/GCS retention lock),
  - firma criptografica del pack (JWS/CMS) con KMS/HSM,
  - timestamping confiable (TSA o equivalente),
  - hash chain por eventos de run (event_i incluye hash de event_i-1),
  - auditoria de descarga/visualizacion obligatoria.

## 5) Blueprint de implementacion en Skuld

## 5.1 Orchestrator (por cliente)

- Nuevo modulo `evidence`:
  - generar `run evidence pack` en cierre de ejecucion,
  - exigir persistencia inmutable + `pack_uri` no nulo en modo enterprise,
  - endpoint `verify` por run y por pack.
- Integrar evidencia de nodo `ai.agent`:
  - no guardar prompt premium en claro,
  - guardar referencia (`promptRef`, version, policy, checksum de template) y metadata de inferencia permitida.

## 5.2 Control Plane

- Recibir solo telemetria y metadatos de evidencia (no PHI/PII cruda).
- Inventario global de packs y estado de verificacion por orchestrator.
- Dashboard de compliance:
  - cobertura de evidencia por tenant,
  - fallos de verificacion,
  - accesos/descargas y alertas.

## 5.3 RBAC y compliance

- Roles separados:
  - `EvidenceAdmin`, `AuditorReadOnly`, `SecurityOfficer`.
- Politicas:
  - principio de minimo privilegio,
  - SoD (quien opera != quien audita),
  - retencion legal y hold por tenant.

## 6) Decisiones

- Reusar: si, fuerte recomendacion.
- Copia literal: no.
- Estrategia correcta: adaptar y endurecer.

Resultado esperado:

- Skuld con trazabilidad tecnica + legal de nivel auditoria enterprise, alineado a HIPAA/SOC2 para clientes regulados.
