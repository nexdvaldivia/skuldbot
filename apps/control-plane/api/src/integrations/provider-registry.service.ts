import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  IntegrationProvider,
  IntegrationType,
} from '../common/interfaces/integration.interface';

export interface ProviderInfo {
  name: string;
  type: IntegrationType;
  isConfigured: boolean;
  isPrimary: boolean;
}

export interface ProviderHealthStatus {
  name: string;
  type: IntegrationType;
  healthy: boolean;
  lastChecked: Date;
  error?: string;
}

/**
 * ProviderRegistry - Central registry for all integration providers.
 *
 * This service manages the lifecycle of all providers (payment, storage, email, etc.)
 * and provides a unified interface to access them.
 *
 * Features:
 * - Register providers at startup
 * - Get provider by type and optionally by name
 * - Health checks for all providers
 * - Primary provider per type (configurable)
 */
@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly providers = new Map<string, IntegrationProvider>();
  private readonly primaryProviders = new Map<IntegrationType, string>();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    this.logger.log('ProviderRegistry initialized');
  }

  /**
   * Register a provider in the registry.
   * @param provider The provider instance to register
   * @param isPrimary Whether this should be the primary provider for its type
   */
  register(provider: IntegrationProvider, isPrimary = false): void {
    const key = this.getProviderKey(provider.type, provider.name);

    if (this.providers.has(key)) {
      this.logger.warn(`Provider ${key} already registered, overwriting`);
    }

    this.providers.set(key, provider);

    if (isPrimary || !this.primaryProviders.has(provider.type)) {
      this.primaryProviders.set(provider.type, provider.name);
      this.logger.log(`Primary ${provider.type} provider set to: ${provider.name}`);
    }

    this.logger.log(`Registered provider: ${key} (configured: ${provider.isConfigured()})`);
  }

  /**
   * Get a specific provider by type and name.
   * @param type The integration type
   * @param name The provider name (optional, defaults to primary)
   */
  get<T extends IntegrationProvider>(type: IntegrationType, name?: string): T | null {
    const providerName = name || this.primaryProviders.get(type);
    if (!providerName) {
      return null;
    }

    const key = this.getProviderKey(type, providerName);
    const provider = this.providers.get(key) as T | undefined;

    if (!provider) {
      this.logger.warn(`Provider not found: ${key}`);
      return null;
    }

    return provider;
  }

  /**
   * Get the primary provider for a type.
   * @param type The integration type
   */
  getPrimary<T extends IntegrationProvider>(type: IntegrationType): T | null {
    return this.get<T>(type);
  }

  /**
   * Get all providers of a specific type.
   * @param type The integration type
   */
  getAllByType<T extends IntegrationProvider>(type: IntegrationType): T[] {
    const providers: T[] = [];

    for (const [key, provider] of this.providers) {
      if (key.startsWith(`${type}:`)) {
        providers.push(provider as T);
      }
    }

    return providers;
  }

  /**
   * Get all registered providers.
   */
  getAll(): IntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Set the primary provider for a type.
   * @param type The integration type
   * @param name The provider name to set as primary
   */
  setPrimary(type: IntegrationType, name: string): boolean {
    const key = this.getProviderKey(type, name);
    if (!this.providers.has(key)) {
      this.logger.error(`Cannot set primary: provider ${key} not found`);
      return false;
    }

    this.primaryProviders.set(type, name);
    this.logger.log(`Primary ${type} provider changed to: ${name}`);
    return true;
  }

  /**
   * Get information about all registered providers.
   */
  getProviderInfo(): ProviderInfo[] {
    const info: ProviderInfo[] = [];

    for (const [, provider] of this.providers) {
      const isPrimary = this.primaryProviders.get(provider.type) === provider.name;
      info.push({
        name: provider.name,
        type: provider.type,
        isConfigured: provider.isConfigured(),
        isPrimary,
      });
    }

    return info;
  }

  /**
   * Check health of all providers.
   */
  async healthCheck(): Promise<ProviderHealthStatus[]> {
    const results: ProviderHealthStatus[] = [];

    for (const [, provider] of this.providers) {
      const status: ProviderHealthStatus = {
        name: provider.name,
        type: provider.type,
        healthy: false,
        lastChecked: new Date(),
      };

      if (!provider.isConfigured()) {
        status.error = 'Provider not configured';
        results.push(status);
        continue;
      }

      try {
        status.healthy = await provider.healthCheck();
      } catch (error) {
        status.healthy = false;
        status.error = error instanceof Error ? error.message : 'Unknown error';
      }

      results.push(status);
    }

    return results;
  }

  /**
   * Check health of a specific provider.
   * @param type The integration type
   * @param name The provider name (optional, defaults to primary)
   */
  async healthCheckProvider(
    type: IntegrationType,
    name?: string,
  ): Promise<ProviderHealthStatus | null> {
    const provider = this.get(type, name);
    if (!provider) {
      return null;
    }

    const status: ProviderHealthStatus = {
      name: provider.name,
      type: provider.type,
      healthy: false,
      lastChecked: new Date(),
    };

    if (!provider.isConfigured()) {
      status.error = 'Provider not configured';
      return status;
    }

    try {
      status.healthy = await provider.healthCheck();
    } catch (error) {
      status.healthy = false;
      status.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return status;
  }

  /**
   * Check if a provider is registered.
   * @param type The integration type
   * @param name The provider name
   */
  has(type: IntegrationType, name: string): boolean {
    const key = this.getProviderKey(type, name);
    return this.providers.has(key);
  }

  /**
   * Unregister a provider.
   * @param type The integration type
   * @param name The provider name
   */
  unregister(type: IntegrationType, name: string): boolean {
    const key = this.getProviderKey(type, name);
    const deleted = this.providers.delete(key);

    if (deleted && this.primaryProviders.get(type) === name) {
      // Find another provider of same type to be primary
      const remainingProviders = this.getAllByType(type);
      if (remainingProviders.length > 0) {
        this.primaryProviders.set(type, remainingProviders[0].name);
      } else {
        this.primaryProviders.delete(type);
      }
    }

    return deleted;
  }

  private getProviderKey(type: IntegrationType, name: string): string {
    return `${type}:${name}`;
  }
}
