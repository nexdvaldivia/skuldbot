import { Controller, Get, Post } from '@nestjs/common';
import { LicenseService, LicenseInfo } from './license.service';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Get()
  async getLicenseInfo(): Promise<LicenseInfo> {
    return this.licenseService.getLicenseInfo();
  }

  @Get('features')
  async getFeatures() {
    return {
      features: this.licenseService.getFeatures(),
      licensed: this.licenseService.isLicensed(),
    };
  }

  @Post('validate')
  async validateLicense(): Promise<LicenseInfo> {
    return this.licenseService.validateLicense();
  }
}
