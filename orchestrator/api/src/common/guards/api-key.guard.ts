import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ApiKey, ApiKeyStatus } from '../../users/entities/api-key.entity';
import { User } from '../../users/entities/user.entity';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * API Key Authentication Guard.
 *
 * Validates API keys passed via:
 * - Authorization: Bearer sk_live_xxxxx
 * - X-API-Key: sk_live_xxxxx
 *
 * API keys have:
 * - Scoped permissions (can be more restrictive than user's roles)
 * - Optional IP whitelist
 * - Expiration dates
 * - Usage tracking
 *
 * Can be used as alternative to JWT auth or alongside it.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Extract API key from headers
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException({
        code: 'API_KEY_REQUIRED',
        message: 'API key is required. Provide via Authorization header or X-API-Key.',
      });
    }

    // Validate API key format
    if (!this.isValidKeyFormat(apiKey)) {
      throw new UnauthorizedException({
        code: 'INVALID_API_KEY_FORMAT',
        message: 'Invalid API key format.',
      });
    }

    // Hash the key and look it up
    const keyHash = this.hashApiKey(apiKey);
    const apiKeyEntity = await this.apiKeyRepository.findOne({
      where: { keyHash },
      relations: ['user', 'tenant'],
    });

    if (!apiKeyEntity) {
      throw new UnauthorizedException({
        code: 'INVALID_API_KEY',
        message: 'Invalid API key.',
      });
    }

    // Check key status
    if (apiKeyEntity.status === ApiKeyStatus.REVOKED) {
      throw new UnauthorizedException({
        code: 'API_KEY_REVOKED',
        message: 'This API key has been revoked.',
      });
    }

    if (apiKeyEntity.isExpired) {
      throw new UnauthorizedException({
        code: 'API_KEY_EXPIRED',
        message: 'This API key has expired.',
      });
    }

    // Check IP whitelist
    const clientIp = this.getClientIp(request);
    if (!apiKeyEntity.isIpAllowed(clientIp)) {
      throw new ForbiddenException({
        code: 'IP_NOT_ALLOWED',
        message: 'Your IP address is not allowed to use this API key.',
      });
    }

    // Check scopes against required permissions
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      const missingScopes = requiredPermissions.filter(
        (permission) => !apiKeyEntity.hasScope(permission),
      );

      if (missingScopes.length > 0) {
        throw new ForbiddenException({
          code: 'INSUFFICIENT_SCOPES',
          message: `API key is missing required scopes: ${missingScopes.join(', ')}`,
          requiredScopes: requiredPermissions,
          missingScopes,
        });
      }
    }

    // Load user
    const user = await this.userRepository.findOne({
      where: { id: apiKeyEntity.userId },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'The user associated with this API key is not active.',
      });
    }

    // Update usage tracking (async, don't wait)
    this.updateUsage(apiKeyEntity.id, clientIp).catch((err) =>
      console.error('Failed to update API key usage:', err),
    );

    // Attach user and API key info to request
    request.user = user;
    request.apiKey = apiKeyEntity;
    request.authMethod = 'api_key';

    return true;
  }

  private extractApiKey(request: any): string | null {
    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer sk_')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const xApiKey = request.headers['x-api-key'];
    if (xApiKey?.startsWith('sk_')) {
      return xApiKey;
    }

    return null;
  }

  private isValidKeyFormat(key: string): boolean {
    // Format: sk_live_<32 hex chars> or sk_test_<32 hex chars>
    return /^sk_(live|test)_[a-f0-9]{32}$/.test(key);
  }

  private hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.ip
    );
  }

  private async updateUsage(apiKeyId: string, ip: string): Promise<void> {
    await this.apiKeyRepository.update(apiKeyId, {
      lastUsedAt: new Date(),
      lastUsedIp: ip,
      usageCount: () => 'usageCount + 1',
    });
  }
}

/**
 * Combined guard that accepts either JWT or API key.
 * Useful for endpoints that should work with both auth methods.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: any, // Injected JwtAuthGuard
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check if API key is present
    const hasApiKey =
      request.headers['x-api-key']?.startsWith('sk_') ||
      request.headers.authorization?.startsWith('Bearer sk_');

    if (hasApiKey) {
      return this.apiKeyGuard.canActivate(context);
    }

    // Fall back to JWT
    return this.jwtAuthGuard.canActivate(context);
  }
}
