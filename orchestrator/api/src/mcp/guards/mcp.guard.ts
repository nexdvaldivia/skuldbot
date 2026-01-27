import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * MCP Guard for Orchestrator
 * 
 * Validates tenant context and ensures requests are authorized.
 * In production, this would validate JWT tokens from Control Plane.
 */
@Injectable()
export class MCPGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Extract tenant ID from header
    const tenantId = request.headers['x-tenant-id'];
    
    if (!tenantId) {
      return false;
    }

    // TODO: Validate tenant exists and is active
    // TODO: Validate JWT token from Control Plane
    
    // Attach to request for use in controllers
    request.tenant = {
      id: tenantId,
    };

    return true;
  }
}

