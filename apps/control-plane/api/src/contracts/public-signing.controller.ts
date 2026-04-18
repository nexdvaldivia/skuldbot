import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicSigningService } from './public-signing.service';
import {
  PublicDeclineRequestDto,
  PublicDeclineResponseDto,
  PublicMarkViewedResponseDto,
  PublicOtpSimpleResponseDto,
  PublicOtpStatusResponseDto,
  PublicRequestEmailOtpResponseDto,
  PublicRequestSmsOtpDto,
  PublicRequestSmsOtpResponseDto,
  PublicSignRequestDto,
  PublicSignResponseDto,
  PublicSigningPageResponseDto,
  PublicVerifyOtpDto,
  UpdatePublicClientInfoDto,
} from './dto/public-signing.dto';

@Controller('public/sign')
export class PublicSigningController {
  constructor(private readonly publicSigningService: PublicSigningService) {}

  @Get(':token')
  async getSigningPage(@Param('token') token: string): Promise<PublicSigningPageResponseDto> {
    return this.publicSigningService.getSigningPage(token);
  }

  @Post(':token/view')
  async markViewed(
    @Param('token') token: string,
    @Req() request: Request,
  ): Promise<PublicMarkViewedResponseDto> {
    return this.publicSigningService.markViewed(
      token,
      this.getClientIp(request),
      this.getUserAgent(request),
    );
  }

  @Post(':token/client-info')
  async updateClientInfo(
    @Param('token') token: string,
    @Body() dto: UpdatePublicClientInfoDto,
  ): Promise<Record<string, unknown>> {
    return this.publicSigningService.updateClientInfo(token, dto);
  }

  @Get(':token/otp/status')
  async getOtpStatus(@Param('token') token: string): Promise<PublicOtpStatusResponseDto> {
    return this.publicSigningService.getOtpStatus(token);
  }

  @Post(':token/otp/request-email')
  async requestEmailOtp(
    @Param('token') token: string,
    @Req() request: Request,
  ): Promise<PublicRequestEmailOtpResponseDto> {
    return this.publicSigningService.requestEmailOtp(
      token,
      this.getClientIp(request),
      this.getUserAgent(request),
    );
  }

  @Post(':token/otp/verify-email')
  async verifyEmailOtp(
    @Param('token') token: string,
    @Body() dto: PublicVerifyOtpDto,
    @Req() request: Request,
  ): Promise<PublicOtpSimpleResponseDto> {
    return this.publicSigningService.verifyEmailOtp(
      token,
      dto,
      this.getClientIp(request),
      this.getUserAgent(request),
    );
  }

  @Post(':token/otp/request-sms')
  async requestSmsOtp(
    @Param('token') token: string,
    @Body() dto: PublicRequestSmsOtpDto,
    @Req() request: Request,
  ): Promise<PublicRequestSmsOtpResponseDto> {
    return this.publicSigningService.requestSmsOtp(
      token,
      dto,
      this.getClientIp(request),
      this.getUserAgent(request),
    );
  }

  @Post(':token/otp/verify-sms')
  async verifySmsOtp(
    @Param('token') token: string,
    @Body() dto: PublicVerifyOtpDto,
    @Req() request: Request,
  ): Promise<PublicOtpSimpleResponseDto> {
    return this.publicSigningService.verifySmsOtp(
      token,
      dto,
      this.getClientIp(request),
      this.getUserAgent(request),
    );
  }

  @Post(':token/sign')
  async sign(
    @Param('token') token: string,
    @Body() dto: PublicSignRequestDto,
    @Req() request: Request,
  ): Promise<PublicSignResponseDto> {
    return this.publicSigningService.sign(token, {
      ...dto,
      ipAddress: dto.ipAddress ?? this.getClientIp(request),
      userAgent: dto.userAgent ?? this.getUserAgent(request) ?? undefined,
    });
  }

  @Post(':token/decline')
  async decline(
    @Param('token') token: string,
    @Body() dto: PublicDeclineRequestDto,
    @Req() request: Request,
  ): Promise<PublicDeclineResponseDto> {
    return this.publicSigningService.decline(token, {
      ...dto,
      ipAddress: dto.ipAddress ?? this.getClientIp(request),
      userAgent: dto.userAgent ?? this.getUserAgent(request) ?? undefined,
    });
  }

  @Get(':token/documents/:documentId/preview-pdf')
  async previewPdf(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.publicSigningService.downloadPreviewPdf(
      token,
      documentId,
      download === 'true',
    );
    this.applyPdfHeaders(response, result.headers, result.fileName, result.contentDisposition);
    return new StreamableFile(result.buffer);
  }

  @Get(':token/documents/:documentId/final-pdf')
  async finalPdf(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.publicSigningService.downloadFinalPdf(
      token,
      documentId,
      download === 'true',
    );
    this.applyPdfHeaders(response, result.headers, result.fileName, result.contentDisposition);
    return new StreamableFile(result.buffer);
  }

  @Get(':token/documents/:documentId/signed-pdf')
  async signedPdf(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.publicSigningService.downloadSignedPdf(token, documentId);
    this.applyPdfHeaders(response, result.headers, result.fileName, result.contentDisposition);
    return new StreamableFile(result.buffer);
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (Array.isArray(forwarded)) {
      return forwarded[0] ?? request.ip ?? '0.0.0.0';
    }
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() || request.ip || '0.0.0.0';
    }
    return request.ip || '0.0.0.0';
  }

  private getUserAgent(request: Request): string | null {
    const userAgent = request.headers['user-agent'];
    if (Array.isArray(userAgent)) {
      return userAgent[0] ?? null;
    }
    return typeof userAgent === 'string' ? userAgent : null;
  }

  private applyPdfHeaders(
    response: Response,
    headers: Record<string, string>,
    fileName: string,
    disposition: 'inline' | 'attachment',
  ): void {
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
    Object.entries(headers).forEach(([key, value]) => {
      if (value) {
        response.setHeader(key, value);
      }
    });
  }
}
