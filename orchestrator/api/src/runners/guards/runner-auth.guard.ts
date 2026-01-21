import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { RunnersService } from '../runners.service';

/**
 * Guard for authenticating runner API requests
 * Expects header: Authorization: Bearer skr_xxxxx
 */
@Injectable()
export class RunnerAuthGuard implements CanActivate {
  constructor(private readonly runnersService: RunnersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer '

    if (!apiKey.startsWith('skr_')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const runner = await this.runnersService.authenticateByApiKey(apiKey);

    if (!runner) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach runner to request for use in controllers
    request.runner = runner;

    return true;
  }
}
