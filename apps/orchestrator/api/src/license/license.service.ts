import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface LicenseFeatures {
  maxBots: number;
  maxRunners: number;
  maxConcurrentRuns: number;
  maxRunsPerMonth: number;
  maxApiKeys: number;
  maxMonthlyRuns: number;
  aiAssistant: boolean;
  customNodes: boolean;
  apiAccess: boolean;
  sso: boolean;
  ssoEnabled: boolean;
  ssoEnforced: boolean;
  ssoProvider: string | null;
  ssoConfig: Record<string, any> | null;
  auditLog: boolean;
  prioritySupport: boolean;
  [key: string]: any; // Allow additional features
}

export interface TenantFromLicense {
  id: string;
  slug: string;
  type: string;
}

export interface LicenseInfo {
  valid: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  type: string | null;
  features: LicenseFeatures | null;
  expiresAt: Date | null;
  message: string;
}

export interface FullLicenseInfo {
  tenant: TenantFromLicense;
  features: LicenseFeatures | null;
  expiresAt: Date | null;
  valid: boolean;
}

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private licenseInfo: LicenseInfo | null = null;
  private lastValidation: Date | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.validateLicense();
  }

  async validateLicense(): Promise<LicenseInfo> {
    const licenseKey = this.configService.get<string>('LICENSE_KEY');
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');

    // If no license key, check for offline license
    if (!licenseKey) {
      this.logger.warn('No license key configured - running in unlicensed mode');
      this.licenseInfo = this.getUnlicensedMode();
      return this.licenseInfo;
    }

    // If no control plane URL, use offline validation
    if (!controlPlaneUrl) {
      this.logger.warn('No Control Plane URL configured - using offline validation');
      this.licenseInfo = this.validateOffline(licenseKey);
      return this.licenseInfo;
    }

    // Online validation against Control Plane
    try {
      const response = await fetch(`${controlPlaneUrl}/api/licenses/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKey }),
      });

      if (!response.ok) {
        throw new Error(`Control Plane returned ${response.status}`);
      }

      this.licenseInfo = await response.json();
      this.lastValidation = new Date();

      if (this.licenseInfo?.valid) {
        this.logger.log(`License validated: ${this.licenseInfo.type} - ${this.licenseInfo.tenantSlug}`);
      } else {
        this.logger.warn(`License invalid: ${this.licenseInfo?.message}`);
      }

      return this.licenseInfo;
    } catch (error) {
      this.logger.error('Failed to validate license against Control Plane', error);

      // If we have a cached valid license, use it
      if (this.licenseInfo?.valid && this.lastValidation) {
        const hoursSinceValidation = (Date.now() - this.lastValidation.getTime()) / 3600000;
        if (hoursSinceValidation < 24) {
          this.logger.warn('Using cached license info (last validated < 24h ago)');
          return this.licenseInfo;
        }
      }

      // Fall back to offline validation
      this.licenseInfo = this.validateOffline(licenseKey);
      return this.licenseInfo;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async periodicValidation() {
    this.logger.debug('Running periodic license validation');
    await this.validateLicense();
  }

  getLicenseInfo(): LicenseInfo {
    if (!this.licenseInfo) {
      return this.getUnlicensedMode();
    }
    return this.licenseInfo;
  }

  /**
   * Get full license info with tenant details.
   * Used by services that need tenant info from the license.
   */
  async getLicense(): Promise<FullLicenseInfo | null> {
    const info = this.getLicenseInfo();
    if (!info.valid || !info.tenantId) {
      return null;
    }

    return {
      tenant: {
        id: info.tenantId,
        slug: info.tenantSlug || info.tenantId,
        type: info.type || 'standard',
      },
      features: info.features,
      expiresAt: info.expiresAt,
      valid: info.valid,
    };
  }

  /**
   * Get tenant ID from license.
   */
  getTenantId(): string | null {
    return this.licenseInfo?.tenantId || null;
  }

  /**
   * Get tenant slug from license.
   */
  getTenantSlug(): string | null {
    return this.licenseInfo?.tenantSlug || null;
  }

  isLicensed(): boolean {
    return this.licenseInfo?.valid || false;
  }

  getFeatures(): LicenseFeatures | null {
    return this.licenseInfo?.features || null;
  }

  checkFeature(feature: keyof LicenseFeatures): boolean {
    const features = this.getFeatures();
    if (!features) return false;
    return !!features[feature];
  }

  checkLimit(limit: 'maxBots' | 'maxRunners' | 'maxConcurrentRuns' | 'maxRunsPerMonth', current: number): boolean {
    const features = this.getFeatures();
    if (!features) return false;
    const maxValue = features[limit];
    if (maxValue === -1) return true; // Unlimited
    return current < maxValue;
  }

  requireLicense(): void {
    if (!this.isLicensed()) {
      throw new HttpException(
        {
          message: 'Valid license required',
          code: 'LICENSE_REQUIRED',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  requireFeature(feature: keyof LicenseFeatures): void {
    this.requireLicense();
    if (!this.checkFeature(feature)) {
      throw new HttpException(
        {
          message: `Feature '${feature}' is not available in your license`,
          code: 'FEATURE_NOT_AVAILABLE',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private validateOffline(licenseKey: string): LicenseInfo {
    // Basic offline validation - check key format
    // In production, this would use cryptographic signature verification
    if (!licenseKey.startsWith('SKULD-') || licenseKey.split('-').length !== 5) {
      return {
        valid: false,
        tenantId: null,
        tenantSlug: null,
        type: null,
        features: null,
        expiresAt: null,
        message: 'Invalid license key format',
      };
    }

    // In offline mode, provide basic features
    // Production would decode features from signed license key
    return {
      valid: true,
      tenantId: 'offline',
      tenantSlug: 'offline',
      type: 'standard',
      features: {
        maxBots: 10,
        maxRunners: 3,
        maxConcurrentRuns: 3,
        maxRunsPerMonth: 1000,
        maxApiKeys: 10,
        maxMonthlyRuns: 1000,
        aiAssistant: false,
        customNodes: false,
        apiAccess: true,
        sso: false,
        ssoEnabled: false,
        ssoEnforced: false,
        ssoProvider: null,
        ssoConfig: null,
        auditLog: true,
        prioritySupport: false,
      },
      expiresAt: null,
      message: 'License validated offline',
    };
  }

  private getUnlicensedMode(): LicenseInfo {
    const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';

    if (isDevelopment) {
      // Development mode - all features enabled
      return {
        valid: true,
        tenantId: 'development',
        tenantSlug: 'development',
        type: 'development',
        features: {
          maxBots: -1,
          maxRunners: -1,
          maxConcurrentRuns: -1,
          maxRunsPerMonth: -1,
          maxApiKeys: -1,
          maxMonthlyRuns: -1,
          aiAssistant: true,
          customNodes: true,
          apiAccess: true,
          sso: true,
          ssoEnabled: false,
          ssoEnforced: false,
          ssoProvider: null,
          ssoConfig: null,
          auditLog: true,
          prioritySupport: false,
        },
        expiresAt: null,
        message: 'Development mode - all features enabled',
      };
    }

    // Production without license - very limited
    return {
      valid: false,
      tenantId: null,
      tenantSlug: null,
      type: null,
      features: null,
      expiresAt: null,
      message: 'No license configured',
    };
  }
}
