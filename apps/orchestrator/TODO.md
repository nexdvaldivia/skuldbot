# Orchestrator - TODO

## Form Trigger - Autenticacion

Cuando se implemente el Form Trigger en el Orchestrator, agregar soporte para:

### Opciones de Autenticacion

```typescript
interface FormTriggerAuth {
  type: 'none' | 'basic' | 'api_key' | 'oauth' | 'jwt';

  // Para basic auth
  allowedUsers?: string[];

  // Para API key
  apiKeyHeader?: string;
  validApiKeys?: string[];

  // Para OAuth/JWT
  provider?: 'google' | 'github' | 'azure' | 'custom';
  clientId?: string;
  allowedDomains?: string[];
}
```

### Comportamiento Esperado

1. **Sin autenticacion** (`none`): Formulario publico, cualquiera puede enviar
2. **Basic Auth**: Usuario/password antes de ver el formulario
3. **API Key**: Header requerido para submit (para integraciones)
4. **OAuth**: Login con Google/GitHub/etc antes de enviar
5. **JWT**: Token valido requerido (para apps internas)

### Implementacion

- [ ] Agregar campo `requireAuth` al Form Trigger en Studio
- [ ] Crear middleware de autenticacion en Orchestrator API
- [ ] Generar URLs unicas por formulario
- [ ] Rate limiting por IP/usuario
- [ ] Logs de acceso y submits

### Referencias

- Studio config schema: `studio/src/data/nodeTemplates.ts` (trigger.form)
- Form preview: `studio/src/components/FormPreview.tsx`
