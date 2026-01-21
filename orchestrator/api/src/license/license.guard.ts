import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseService, LicenseFeatures } from './license.service';

export const REQUIRE_LICENSE_KEY = 'requireLicense';
export const REQUIRE_FEATURE_KEY = 'requireFeature';

export const RequireLicense = () => {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(REQUIRE_LICENSE_KEY, true, descriptor?.value ?? target);
  };
};

export const RequireFeature = (feature: keyof LicenseFeatures) => {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(REQUIRE_FEATURE_KEY, feature, descriptor?.value ?? target);
    Reflect.defineMetadata(REQUIRE_LICENSE_KEY, true, descriptor?.value ?? target);
  };
};

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly licenseService: LicenseService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requireLicense = this.reflector.getAllAndOverride<boolean>(REQUIRE_LICENSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If license not required, allow access
    if (!requireLicense) {
      return true;
    }

    // Check if licensed
    if (!this.licenseService.isLicensed()) {
      throw new HttpException(
        {
          message: 'Valid license required to access this resource',
          code: 'LICENSE_REQUIRED',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Check specific feature requirement
    const requiredFeature = this.reflector.getAllAndOverride<keyof LicenseFeatures>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredFeature && !this.licenseService.checkFeature(requiredFeature)) {
      throw new HttpException(
        {
          message: `Feature '${requiredFeature}' is not available in your license`,
          code: 'FEATURE_NOT_AVAILABLE',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
