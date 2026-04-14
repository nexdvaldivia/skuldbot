# ADR-0002: Cloud-Agnostic Provider Architecture

**Fecha**: 2026-04-14
**Estado**: Aceptado
**Autor**: Albert (Arquitectura), Dubiel (Requisito)

## Contexto

SkuldBot opera en la infraestructura del cliente (modelo hibrido). Los clientes pueden estar
en AWS, Azure, GCP, on-premise o combinaciones. El Control Plane de Skuld LLC tambien debe
poder migrar entre clouds sin cambios de codigo.

Nexion ya implementa este patron exitosamente con factories per-organization en Python/FastAPI.
Necesitamos portarlo a NestJS/TypeScript.

## Decision

Todo servicio de infraestructura (storage, email, SMS, payments) se implementa detras de una
**interfaz abstracta** con un **factory** que lee la configuracion de base de datos (IntegrationConfig)
y retorna el provider correcto en runtime.

### Patron

```typescript
// 1. Interfaz abstracta
interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// 2. Implementaciones por cloud
class S3StorageProvider implements StorageProvider { ... }
class AzureBlobStorageProvider implements StorageProvider { ... }
class GCSStorageProvider implements StorageProvider { ... }
class MinIOStorageProvider implements StorageProvider { ... }
class LocalStorageProvider implements StorageProvider { ... }

// 3. Factory lee config de DB
class StorageProviderFactory {
  create(config: IntegrationConfig): StorageProvider {
    switch (config.providerType) {
      case 's3': return new S3StorageProvider(config);
      case 'azure-blob': return new AzureBlobStorageProvider(config);
      case 'gcs': return new GCSStorageProvider(config);
      case 'minio': return new MinIOStorageProvider(config);
      case 'local': return new LocalStorageProvider(config);
    }
  }
}

// 4. Aplicacion solo conoce la interfaz
@Injectable()
class EvidenceService {
  constructor(private storageFactory: StorageProviderFactory) {}

  async store(pack: EvidencePack): Promise<string> {
    const storage = await this.storageFactory.getProvider(tenantId);
    return storage.upload(key, data, 'application/zip');
  }
}
```

### IntegrationConfig Entity

```typescript
@Entity('integration_configs')
export class IntegrationConfig {
  @PrimaryGeneratedColumn('uuid') id: string;

  // null = global config, non-null = per-tenant/per-org
  @Column({ type: 'uuid', nullable: true }) organizationId: string | null;

  @Column() integrationType: string; // 'storage', 'email', 'sms', 'payment'
  @Column() providerType: string; // 's3', 'azure-blob', 'sendgrid', 'stripe', etc.
  @Column() instanceName: string; // 'primary', 'backup', etc.

  @Column({ type: 'jsonb', default: '{}' }) configData: Record<string, unknown>;
  // configData contiene credenciales y settings especificos del provider
  // Ejemplo S3: { region, bucket, accessKeyId, secretAccessKey }
  // Ejemplo Azure: { accountName, accountKey, containerName }

  @Column({ default: true }) isActive: boolean;
  @Column({ default: false }) isVerified: boolean;
}
```

### Providers a Implementar

| Tipo        | Providers                                | Interface       |
| ----------- | ---------------------------------------- | --------------- |
| **Storage** | S3, Azure Blob, GCS, MinIO, Local        | StorageProvider |
| **Email**   | SendGrid, AWS SES, SMTP, Microsoft Graph | EmailProvider   |
| **SMS**     | Twilio, AWS SNS, Azure Communication     | SmsProvider     |
| **Payment** | Stripe                                   | PaymentProvider |

### Failover Chain

Para servicios criticos (email), el factory soporta failover:

```typescript
// Email: SendGrid → AWS SES → SMTP → Microsoft Graph
const emailProvider = await emailFactory.getProviderWithFallback(tenantId);
```

## Alternativas Consideradas

1. **Variables de entorno por provider** — Descartado. No soporta per-tenant config ni failover.
2. **Config file YAML** — Descartado. No soporta cambio en runtime sin redeploy.
3. **Provider hardcodeado con if/else** — Descartado. Viola open/closed principle.

## Consecuencias

- Agregar un provider nuevo = 1 clase que implementa la interfaz + 1 case en el factory
- Cambiar de cloud = 1 cambio en IntegrationConfig (DB), 0 cambios de codigo
- Per-tenant config: cada cliente puede usar su propio provider
- Failover: si un provider falla, el factory intenta el siguiente
- Complejidad adicional: factory + config vs inyeccion directa
- Testing: cada provider necesita unit tests + integration tests con mocks
