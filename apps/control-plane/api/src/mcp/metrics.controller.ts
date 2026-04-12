import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { MCPMetricsService } from './mcp-metrics.service';

/**
 * Metrics Controller
 *
 * Exposes Prometheus metrics endpoint
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MCPMetricsService) {}

  @Get()
  async getMetrics(): Promise<string> {
    return await this.metricsService.getMetrics();
  }
}
