import { ApiKeyScope, ApiKeyEnvironment } from '../../../users/entities/api-key.entity';

/**
 * DTO for creating a new API key.
 */
export class CreateApiKeyDto {
  name: string;
  description?: string;
  scopes: ApiKeyScope[];
  allowedIps?: string[];
  expiresAt?: Date;
  environment?: ApiKeyEnvironment;
  rateLimit?: number;
}

/**
 * DTO for updating an API key.
 */
export class UpdateApiKeyDto {
  name?: string;
  description?: string;
  scopes?: ApiKeyScope[];
  allowedIps?: string[];
  rateLimit?: number;
  isActive?: boolean;
}
