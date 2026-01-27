import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * MCP Guard
 * 
 * Validates API keys and tenant context for MCP requests.
 * In production, this would validate JWT tokens and check permissions.
 */
@Injectable()
export class MCPGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Extract API key from header
    const apiKey = request.headers['x-api-key'];
    
    if (!apiKey) {
      return false;
    }

    // TODO: Validate API key against database
    // For now, accept any non-empty key
    
    // Extract tenant ID from API key or token
    // In production, this would come from JWT claims
    const tenantId = request.headers['x-tenant-id'] || 'default-tenant';
    
    // Attach to request for use in controllers
    request.tenant = {
      id: tenantId,
      apiKey,
    };

    return true;
  }
}

