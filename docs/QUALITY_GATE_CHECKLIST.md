# Quality Gate System (SkuldBot)

Fecha: 2026-04-17
Estado: APROBADO — formalizado 2026-04-17
Ámbito: toda PR, todo commit, todo merge a `master`. Aplica a Luis, Albert, y cualquier contribuidor.

Este documento define los gates de sistema de SkuldBot. No es un checklist de revisión personal
— es el estándar de calidad de la plataforma. Todo PR debe pasar todos los gates activos aplicables.
Sin excepción, sin n/a: todo PASS o REJECT.

---

## QG1 — Build

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 1.1 | Build del módulo afectado | AUTO | 0 errores — CI: `pnpm --filter build` |
| 1.2 | Build completo monorepo | AUTO | Todos los targets exitosos — CI: `pnpm turbo run build` |
| 1.3 | Worktree limpio | AUTO | CI runner = checkout fresco. Manual: `git worktree add` |

---

## QG2 — Tests

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 2.1 | Tests del módulo | AUTO | 0 fallos — CI: `pnpm --filter test` |
| 2.2 | Suites no disminuyen | AUTO | CI: count >= baseline anterior |
| 2.3 | Tests no borrados | AUTO | CI: count >= baseline anterior |
| 2.4 | Happy paths presentes | MANUAL | CRUD completo + edge cases para cada servicio nuevo |

---

## QG3 — Contracts / E2E

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 3.1 | Response DTOs no exponen internals | AUTO | CI: 0 campos con "otpCodeHash", "storageKey", "internalSecret", "passwordHash" en DTOs |
| 3.2 | Routing order | AUTO | CI: rutas literales ANTES de rutas paramétnicas en controllers |
| 3.3 | HTTP status codes | MANUAL | POST create → 201, DELETE → 204 o soft delete, GET not found → 404, duplicate → 409 |
| 3.4 | Error responses | MANUAL | Usan códigos estructurados, no strings genéricos |

---

## QG4 — Lint + Typecheck

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 4.1 | TypeScript compilation | AUTO | Incluido en QG1 build (nest build = tsc) |
| 4.2 | 0 TODOs/FIXME/HACK/XXX | AUTO | CI: `grep` en archivos modificados (excluir specs) = 0 |
| 4.3 | 0 console.log | AUTO | CI: `grep` en archivos modificados = 0 |
| 4.4 | Imports usados | AUTO | ESLint: `no-unused-imports` rule |
| 4.5 | TypeORM patterns | AUTO | CI: `grep` por `default: {}`, `synchronize: true` = 0 |
| 4.6 | Entity columns tipados | MANUAL | varchar con length, enum con enum type, nullable con explicit type |
| 4.7 | Enum policy: lookup tables para valores dinámicos | MANUAL | Status/type/category que el admin puede necesitar cambiar sin deploy → lookup table con FK (como Nexion ADR-001). Enums TypeScript solo para valores que NUNCA cambian sin deploy (HTTP methods, hash algorithms). Si hay duda → lookup table |
| 4.8 | 0 deuda técnica introducida | MANUAL | Cada entrega debe estar completa. Sin shortcuts, sin "mejorar después", sin TODO implícitos, sin funcionalidad parcial. Si no está terminado, no se entrega |

---

## QG5 — Security Baseline

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 5.1 | 0 hardcoded secrets | AUTO | CI: `grep` por password/secret con interpolación en archivos modificados = 0 |
| 5.2 | Input validation | MANUAL | Todos los campos de DTOs con class-validator decorators |
| 5.3 | SQL injection | AUTO | CI: 0 raw queries con concatenación de strings |
| 5.4 | Timing-safe comparisons | MANUAL | Comparaciones de tokens/OTP usan `timingSafeEqual`, no `===` |
| 5.5 | Secrets no expuestos | MANUAL | Response DTOs no incluyen OTP hashes, storage keys, internal secrets |
| 5.6 | File upload seguro | MANUAL | Si hay upload: size limit, content type whitelist, hash verificación |
| 5.7 | Unsafe code | AUTO | CI: `grep` por eval, exec, child_process = 0 |
| 5.8 | Insecure defaults rejected | MANUAL | Secrets con denylist de defaults inseguros, fail-fast si no configurado |

---

## QG6 — CI Smoke

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 6.1 | Build en worktree limpio | AUTO | CI runner = checkout fresco, QG1 pasa |
| 6.2 | Tests en worktree limpio | AUTO | CI runner = checkout fresco, QG2 pasa |
| 6.3 | No depende de estado local | MANUAL | 0 paths absolutos, 0 archivos locales, 0 env vars no documentadas |

---

## QG7 — Review + Definition of Done

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 7.1 | Scope respetado | MANUAL | Solo archivos del módulo en scope, 0 archivos fuera de scope |
| 7.2 | Funciones < 100 LOC | MANUAL | Todas las funciones < 100 líneas |
| 7.3 | No duplicación | MANUAL | Lógica compartida extraída a utils, no copy-paste entre services |
| 7.4 | Migrations idempotentes | AUTO | CI: CREATE/ALTER con IF NOT EXISTS, DOWN con DROP IF EXISTS |
| 7.5 | Migrations previas intactas | AUTO | CI: 0 cambios en migrations anteriores |
| 7.6 | Module registration | MANUAL | Entities y services nuevos registrados correctamente |
| 7.7 | Commit atómico | MANUAL | Un commit por bloque funcional, no mezcla scopes |
| 7.8 | Self-review declarada | AUTO | CI: PR body contiene sección de self-review (regulatory-guardrails.yml) |
| 7.9 | Threads resueltos | AUTO | GitHub branch protection: "require resolved conversations" |

---

## QG8 — Compliance Check

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 8.1 | Auth guards en TODOS los endpoints | AUTO | CI: @UseGuards en clase o endpoint, verificado en controllers modificados |
| 8.2 | Permissions en TODOS los endpoints | AUTO | CI: @RequirePermissions en cada endpoint de controllers modificados |
| 8.3 | Validators en DTOs | MANUAL | Todos los campos de entrada con class-validator decorators |
| 8.4 | Error handling estructurado | MANUAL | ConflictException para duplicados, NotFoundException para missing, BadRequestException para input inválido |
| 8.5 | Audit events | MANUAL | Operaciones de signing, entitlements, admin actions generan audit events |
| 8.6 | Soft delete donde aplique | MANUAL | Entities con deletedAt usan soft delete, list excluye deleted por defecto |
| 8.7 | Denied actions auditadas | MANUAL | Denegaciones generan eventos auditables (lección PLN-005) |
| 8.8 | Certification-impact flag | MANUAL | Si toca auth/secrets/compliance/data: threat model mínimo en PR |

---

## QG-UI — UI / Branding Gate (obligatorio si hay cambios de UI)

| # | Check | Comando / Método | PASS si |
|---|-------|-----------------|---------|
| UI.1 | Solo shadcn/ui | AUTO | CI: 0 componentes nativos del browser (`<select`, `<input`, `<dialog`, `<textarea` nativo). Todo shadcn/ui |
| UI.2 | 0 alert/confirm/prompt | AUTO | CI: `grep` por `alert(`, `confirm(`, `prompt(` = 0. Todo feedback por toast |
| UI.3 | Tailwind CSS exclusivo | AUTO | CI: 0 `style={{`, 0 `styled(`, 0 `.module.css`. Solo Tailwind utility classes |
| UI.4 | Tipografía Montserrat | MANUAL | Montserrat como font principal, sin fonts del sistema en UI de producto |
| UI.5 | Colores corporativos Skuld | AUTO | CI: 0 hex/rgb hardcoded fuera de tailwind config. Paleta Skuld (emerald base), logo oficial |
| UI.6 | Refactoring UI principles (by Adam Wathan & Steve Schoger, creators of Tailwind CSS) | MANUAL | Jerarquía clara, espaciado consistente, contraste suficiente, estados completos. Ref: https://www.refactoringui.com |
| UI.7 | Reutilización de componentes | MANUAL | Si un componente ya existe, se reutiliza. 0 componentes duplicados o recreados. NUNCA reinventar lo que ya existe |
| UI.8 | BlockedState vs EmptyState | MANUAL | Sin datos → EmptyState + CTA onboarding. Sin entitlement → BlockedState + CTA + error_code. NUNCA ocultar módulo |
| UI.9 | Responsive | MANUAL | Layout funcional en desktop (1280+), tablet (768+), mobile (375+) |
| UI.10 | Accessibility básica | MANUAL | Labels en inputs, alt en imágenes, contraste WCAG AA, keyboard navigation |
| UI.11 | Enterprise go-to-market | MANUAL | 0 placeholders, 0 lorem ipsum, 0 estados incompletos. Calidad enterprise |
| UI.12 | Port from Nexion first | MANUAL | Si Nexion tiene la implementación, se porta. No se inventa desde cero |

---

## QG9 — Nexion Parity (si porta desde Nexion)

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 9.1 | Endpoints completos | MANUAL | Todos los endpoints de Nexion para el scope presentes |
| 9.2 | Entity columns completos | MANUAL | Todos los campos de Nexion presentes (adaptados: nexion_ → skuld_) |
| 9.3 | Service methods completos | MANUAL | Todos los métodos públicos de Nexion portados |
| 9.4 | Comportamiento idéntico | MANUAL | Status workflows, validaciones, state machines coinciden |
| 9.5 | Naming convention | MANUAL | nexion_ → skuld_, company_name default "Skuld, LLC" |

---

## QG10 — Release Pipeline (si hay release/deploy)

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 10.1 | Freeze label enforcement | AUTO | CI: PRs sin label `REL-###` o `EXC-*` rechazados durante freeze |
| 10.2 | Immutable digest | AUTO | CI: SHA256 digest de imágenes Docker presente y verificable |
| 10.3 | Signed images | AUTO | CI: cosign sign/verify válido |
| 10.4 | Tag-version match | AUTO | CI: git tag = package.json/manifest version |
| 10.5 | Release evidence | AUTO | CI: secciones de evidencia completas (build, tests, security, compliance) |
| 10.6 | Install matrix | AUTO | CI: todos los escenarios de instalación PASS |
| 10.7 | Zero patch policy | MANUAL | 0 patches sin evidencia de gates completos |

---

## QG11 — Licensing Gate (si toca licensing/entitlements)

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 11.1 | Dual review obligatorio | AUTO | GitHub CODEOWNERS + branch protection: 2 approvals |
| 11.2 | Entitlement contract tests | AUTO | CI: tests granted/denied/unreachable/expired PASS |
| 11.3 | Error envelope completo | MANUAL | Payload: error_code, message, remediation, correlation_id, support_url |
| 11.4 | Cache + invalidación | MANUAL | Cache TTL 30-60s, invalidación por evento verificada |
| 11.5 | Dual-key rotation | MANUAL | Key activa + key previa en ventana de gracia, rotación sin downtime |

---

## QG12 — Deployer Gates (si toca deployers)

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 12.1 | Paridad multi-cloud | AUTO | CI: cambio en deployer A = cambio obligatorio en deployer B |
| 12.2 | Deployment contract | AUTO | CI: runtime invariants (auth, registry, destructive-resume) presentes |
| 12.3 | Failure injection | AUTO | CI: tests de inyección de fallas PASS |
| 12.4 | Post-deploy smoke | AUTO | CI: smoke tests post-deploy PASS |
| 12.5 | Bootstrap sequence | MANUAL | Orden: migrations → seed → superadmin → verify. Login post-install OK |

---

## QG13 — Runtime Contract (si toca Runner/workers)

| # | Check | Modo | PASS si |
|---|-------|:----:|---------|
| 13.1 | Runtime contract parity | AUTO | CI: contract tests Runner vs API PASS |
| 13.2 | Error codes compartidos | AUTO | CI: Runner usa mismo catálogo de error codes que API |
| 13.3 | Audit parity | MANUAL | Runner genera mismos eventos de auditoría, mismo formato |
| 13.4 | Credential guard | AUTO | CI: fail-fast si credenciales inválidas o expiradas |

---

## Reglas de ejecución

1. **Todo gate es PASS o REJECT**. No existe n/a, no existe "non-blocker", no existe "deuda para después".
2. **Un defecto encontrado = REJECT**. Se reportan todos los defectos, no solo el primero.
3. **Todos los gates se ejecutan en cada review**. No se omite ninguno. No se hace "solo verificar los fixes".
4. **Worktree limpio obligatorio**. Nunca revisar en el working tree principal.
5. **Build y tests primero**. Si QG1 o QG2 fallan, no se continúa con los demás gates.
6. **Evidencia en cada gate**. Cada PASS tiene un dato verificable (count, comando, línea de código).
7. **0 deuda técnica**. Cada entrega es completa. Sin shortcuts, sin "mejorar después", sin funcionalidad parcial, sin TODOs implícitos. Si no está terminado al 100%, no se entrega. Entrega completa o nada.
8. **Enums vs Lookup Tables**. Valores que un admin puede cambiar sin deploy (status, types, categories) → lookup table con CRUD + FK. Enums TypeScript solo para constantes que NUNCA cambian sin deploy (HTTP methods, hash algorithms, enum de puertos). Referencia: Nexion ADR-001.
9. **0 superficialidad**. Nunca leer solo la definición — leer el flujo completo (modelo + service + escritura + lectura + tests). Nunca responder con una suposición sobre cómo funciona algo — verificar leyendo el código real. Si se dice "X es plaintext" o "X no tiene Y", la evidencia debe ser el flujo end-to-end, no una línea aislada. Una conclusión basada en lectura parcial es peor que no responder.

---

## Formato de reporte de review

```
## Gate Review — Commit `<hash>` (<descripción>)

| Gate | Resultado | Evidencia |
|:----:|:---------:|-----------|
| QG1  | PASS/FAIL | <evidencia> |
| QG2  | PASS/FAIL | <evidencia> |
| ...  | ...       | ...         |

### Defectos (si hay)

| # | Gate | Defecto | Ubicación | Fix requerido |
|---|------|---------|-----------|---------------|
| D1 | QGx | ... | file:line | ... |

## VEREDICTO: APPROVE / REJECT — N defectos
```

---

## Versionado

| Versión | Fecha | Cambio |
|:-------:|-------|--------|
| 0.1 | 2026-04-17 | Borrador inicial — pendiente aprobación |
| 0.2 | 2026-04-17 | Agregados gates de Nexion PLN-005: self-review (7.8), threads resueltos (7.9), certification-impact (8.8), release pipeline (QG10), licensing (QG11), deployers (QG12), runtime contract (QG13) |
| 1.0 | 2026-04-17 | Formalizado y aprobado por Dubiel |
| 1.1 | 2026-04-17 | Todos los gates marcados AUTO/MANUAL. Workflow CI quality-gates.yml creado para los 30 checks automáticos. QG-UI como gate duro dedicado con 12 checks |
| 1.2 | 2026-04-17 | Agregados: QG4.7 (enum policy: lookup tables vs enums, ref Nexion ADR-001), QG4.8 (0 deuda técnica), reglas de ejecución 7 y 8 |
