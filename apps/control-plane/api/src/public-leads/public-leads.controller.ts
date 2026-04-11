import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PublicLeadIntakeDto } from './dto/public-lead-intake.dto';
import { PublicLeadsService } from './public-leads.service';
import { PublicLeadsSignatureGuard } from './guards/public-leads-signature.guard';

@Controller('public/leads')
export class PublicLeadsController {
  constructor(private readonly publicLeadsService: PublicLeadsService) {}

  @Post('intake')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicLeadsSignatureGuard)
  async intake(
    @Body() dto: PublicLeadIntakeDto,
    @Headers('x-gateway-id') gatewayIdHeader: string,
    @Headers('x-request-id') requestIdHeader: string,
    @Req() request: Request,
  ): Promise<{
    success: boolean;
    leadId: string;
    ticketId: string;
    deduplicated: boolean;
    intakeCount: number;
    receivedAt: string;
  }> {
    const result = await this.publicLeadsService.ingest(dto, {
      gatewayId: gatewayIdHeader?.trim() || 'unknown',
      requestId: requestIdHeader?.trim() || null,
      sourceIp: this.getSourceIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });

    return {
      success: true,
      leadId: result.leadId,
      ticketId: result.ticketId,
      deduplicated: result.deduplicated,
      intakeCount: result.intakeCount,
      receivedAt: result.receivedAt,
    };
  }

  private getSourceIp(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0]?.trim() || null;
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0]?.split(',')[0]?.trim() || null;
    }

    return request.ip ?? null;
  }
}
