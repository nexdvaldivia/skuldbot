import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Auditor info attached to request by AuditorAuthGuard
 */
export interface AuditorInfo {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}

/**
 * Current Auditor Decorator
 *
 * Extracts the authenticated auditor from the request.
 * Use after AuditorAuthGuard has verified the token.
 *
 * @example
 * ```typescript
 * @Get('evidence-packs')
 * @UseGuards(AuditorAuthGuard)
 * async listPacks(@CurrentAuditor() auditor: AuditorInfo) {
 *   return this.service.listPacks(auditor.organizationId);
 * }
 * ```
 */
export const CurrentAuditor = createParamDecorator(
  (data: keyof AuditorInfo | undefined, ctx: ExecutionContext): AuditorInfo | string => {
    const request = ctx.switchToHttp().getRequest();
    const auditor = request.auditor as AuditorInfo;

    if (!auditor) {
      throw new Error('CurrentAuditor decorator requires AuditorAuthGuard');
    }

    return data ? auditor[data] : auditor;
  },
);
