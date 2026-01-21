import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Runner } from '../entities/runner.entity';

/**
 * Decorator to extract the authenticated runner from the request
 * Usage: @CurrentRunner() runner: Runner
 */
export const CurrentRunner = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Runner => {
    const request = ctx.switchToHttp().getRequest();
    return request.runner;
  },
);
