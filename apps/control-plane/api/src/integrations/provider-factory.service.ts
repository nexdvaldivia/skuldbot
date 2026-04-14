import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { IntegrationProvider, IntegrationType } from '../common/interfaces/integration.interface';
import { ProviderConfig } from './entities/provider-config.entity';
import { ProviderRegistry } from './provider-registry.service';

export interface ProviderResolutionOptions {
  tenantId?: string | null;
  preferredProvider?: string;
  includeUnconfigured?: boolean;
}

export interface ProviderExecutionResult<TResult> {
  provider: string;
  attemptedProviders: string[];
  result: TResult;
}

@Injectable()
export class ProviderFactoryService {
  private readonly logger = new Logger(ProviderFactoryService.name);

  constructor(
    @InjectRepository(ProviderConfig)
    private readonly providerConfigRepository: Repository<ProviderConfig>,
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  async resolve<T extends IntegrationProvider>(
    type: IntegrationType,
    options: ProviderResolutionOptions = {},
  ): Promise<T | null> {
    const chain = await this.resolveChain<T>(type, options);
    return chain[0] ?? null;
  }

  async resolveChain<T extends IntegrationProvider>(
    type: IntegrationType,
    options: ProviderResolutionOptions = {},
  ): Promise<T[]> {
    const priorityNames = await this.getPriorityNames(type, options);
    const allProviders = this.providerRegistry.getAllByType<T>(type);
    const byName = new Map(allProviders.map((provider) => [provider.name, provider]));

    const orderedProviders: T[] = [];
    const seen = new Set<string>();

    for (const name of priorityNames) {
      const provider = byName.get(name);
      if (!provider) {
        continue;
      }
      if (!options.includeUnconfigured && !provider.isConfigured()) {
        continue;
      }
      orderedProviders.push(provider);
      seen.add(name);
    }

    for (const provider of allProviders) {
      if (seen.has(provider.name)) {
        continue;
      }
      if (!options.includeUnconfigured && !provider.isConfigured()) {
        continue;
      }
      orderedProviders.push(provider);
      seen.add(provider.name);
    }

    return orderedProviders;
  }

  async executeWithFallback<TProvider extends IntegrationProvider, TResult>(
    type: IntegrationType,
    operation: string,
    executor: (provider: TProvider) => Promise<TResult>,
    options: ProviderResolutionOptions = {},
  ): Promise<ProviderExecutionResult<TResult>> {
    const chain = await this.resolveChain<TProvider>(type, options);
    if (chain.length === 0) {
      throw new Error(
        `No providers available for type "${type}" (tenant: ${options.tenantId ?? 'global'}).`,
      );
    }

    const attemptedProviders: string[] = [];
    const errors: string[] = [];

    for (const provider of chain) {
      attemptedProviders.push(provider.name);
      try {
        const result = await executor(provider);
        if (attemptedProviders.length > 1) {
          this.logger.warn(
            `Provider fallback succeeded for ${type}.${operation} using "${provider.name}" after trying "${attemptedProviders.slice(0, -1).join(', ')}".`,
          );
        }
        return { provider: provider.name, attemptedProviders, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        errors.push(`${provider.name}: ${message}`);
        this.logger.warn(
          `Provider "${provider.name}" failed for ${type}.${operation}. Trying fallback...`,
        );
      }
    }

    throw new Error(
      `All providers failed for ${type}.${operation}. Attempted: ${attemptedProviders.join(', ')}. Errors: ${errors.join(' | ')}`,
    );
  }

  private async getPriorityNames(
    type: IntegrationType,
    options: ProviderResolutionOptions,
  ): Promise<string[]> {
    const tenantId = options.tenantId ?? null;
    const tenantConfigs =
      tenantId === null
        ? []
        : await this.providerConfigRepository.find({
            where: {
              type,
              tenantId,
              isActive: true,
            },
            order: {
              isPrimary: 'DESC',
              updatedAt: 'DESC',
              name: 'ASC',
            },
          });

    const globalConfigs = await this.providerConfigRepository.find({
      where: {
        type,
        tenantId: IsNull(),
        isActive: true,
      },
      order: {
        isPrimary: 'DESC',
        updatedAt: 'DESC',
        name: 'ASC',
      },
    });

    const orderedNames: string[] = [];
    if (options.preferredProvider) {
      orderedNames.push(options.preferredProvider);
    }

    for (const config of [...tenantConfigs, ...globalConfigs]) {
      orderedNames.push(config.name);
    }

    return [...new Set(orderedNames)];
  }
}
