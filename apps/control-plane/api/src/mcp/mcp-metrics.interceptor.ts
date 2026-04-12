import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MCPMetricsService } from './mcp-metrics.service';

/**
 * MCP Metrics Interceptor
 *
 * Automatically records metrics for all MCP requests
 */
@Injectable()
export class MCPMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MCPMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const serverName = this.getServerName(request);

    this.metricsService.incrementRequestsInFlight(serverName);
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          this.metricsService.decrementRequestsInFlight(serverName);

          // Record specific metrics based on endpoint
          if (request.url.includes('/tools/call')) {
            const toolName = request.body?.name || 'unknown';
            this.metricsService.recordToolCall(serverName, toolName, 'success');
            this.metricsService.recordToolCallDuration(serverName, toolName, duration);
          } else if (request.url.includes('/resources/')) {
            const resourceType = this.extractResourceType(request.url);
            this.metricsService.recordResourceRead(serverName, resourceType, 'success');
            this.metricsService.recordResourceReadDuration(serverName, resourceType, duration);
          }
        },
        error: (error) => {
          const duration = (Date.now() - startTime) / 1000;
          this.metricsService.decrementRequestsInFlight(serverName);

          if (request.url.includes('/tools/call')) {
            const toolName = request.body?.name || 'unknown';
            this.metricsService.recordToolCall(serverName, toolName, 'error');
            this.metricsService.recordToolCallError(
              serverName,
              toolName,
              error.name || 'UnknownError',
            );
          } else if (request.url.includes('/resources/')) {
            const resourceType = this.extractResourceType(request.url);
            this.metricsService.recordResourceRead(serverName, resourceType, 'error');
            this.metricsService.recordResourceReadError(
              serverName,
              resourceType,
              error.name || 'UnknownError',
            );
          }
        },
      }),
    );
  }

  private getServerName(request: any): string {
    // Determine server name from request
    // Could be from headers, path, or config
    return request.headers['x-mcp-server'] || 'control-plane';
  }

  private extractResourceType(url: string): string {
    // Extract resource type from URL
    // e.g., /resources/licenses://... → licenses
    const match = url.match(/\/resources\/([^:]+):/);
    return match ? match[1] : 'unknown';
  }
}
