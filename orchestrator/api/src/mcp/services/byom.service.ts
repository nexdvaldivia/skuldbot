import { Injectable, Logger } from '@nestjs/common';
import { Tool, ToolResult, LLMProviderConfig, LLMProviderType, DataClassification } from '../types/mcp.types';

/**
 * BYOM (Bring Your Own Model) Service
 * 
 * Manages multi-provider LLM configurations for tenants.
 * Supports 12+ providers including cloud (Azure, Bedrock) and self-hosted (Ollama, vLLM).
 */
@Injectable()
export class BYOMService {
  private readonly logger = new Logger(BYOMService.name);
  
  // In-memory storage (should be database in production)
  private providers: Map<string, LLMProviderConfig> = new Map();

  constructor() {
    // Seed with example providers
    this.seedExampleProviders();
  }

  /**
   * Get all BYOM tools
   */
  getTools(): Tool[] {
    return [
      {
        name: 'configure_llm_provider',
        description: 'Configure a new LLM provider (Azure, Bedrock, Ollama, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            config: {
              type: 'object',
              description: 'Provider configuration',
              properties: {
                name: { type: 'string' },
                provider: {
                  type: 'string',
                  enum: [
                    'azure-ai-foundry',
                    'aws-bedrock',
                    'vertex-ai',
                    'openai',
                    'anthropic',
                    'ollama',
                    'vllm',
                    'tgi',
                    'llamacpp',
                    'lmstudio',
                    'localai',
                    'custom',
                  ],
                },
                endpoint: { type: 'string' },
                model: { type: 'string' },
                apiKey: { type: 'string' },
                priority: { type: 'number' },
                baaSigned: { type: 'boolean' },
                hipaaCompliant: { type: 'boolean' },
                allowedDataClassifications: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['name', 'provider', 'endpoint', 'model'],
            },
          },
          required: ['tenantId', 'config'],
        },
        requiresApproval: false,
        tags: ['byom', 'llm', 'configuration'],
      },
      {
        name: 'list_llm_providers',
        description: 'List all configured LLM providers for a tenant',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            includeHealth: {
              type: 'boolean',
              description: 'Include health check status',
              default: true,
            },
          },
          required: ['tenantId'],
        },
        requiresApproval: false,
        tags: ['byom', 'llm'],
      },
      {
        name: 'get_llm_provider',
        description: 'Get a specific LLM provider configuration',
        inputSchema: {
          type: 'object',
          properties: {
            providerId: {
              type: 'string',
              description: 'Provider ID',
            },
          },
          required: ['providerId'],
        },
        requiresApproval: false,
        tags: ['byom', 'llm'],
      },
      {
        name: 'update_llm_provider',
        description: 'Update an existing LLM provider configuration',
        inputSchema: {
          type: 'object',
          properties: {
            providerId: {
              type: 'string',
              description: 'Provider ID',
            },
            updates: {
              type: 'object',
              description: 'Fields to update',
            },
          },
          required: ['providerId', 'updates'],
        },
        requiresApproval: false,
        tags: ['byom', 'llm', 'configuration'],
      },
      {
        name: 'delete_llm_provider',
        description: 'Delete an LLM provider configuration',
        inputSchema: {
          type: 'object',
          properties: {
            providerId: {
              type: 'string',
              description: 'Provider ID',
            },
          },
          required: ['providerId'],
        },
        requiresApproval: true,
        tags: ['byom', 'llm', 'configuration'],
      },
      {
        name: 'test_llm_provider',
        description: 'Test connectivity and health of an LLM provider',
        inputSchema: {
          type: 'object',
          properties: {
            providerId: {
              type: 'string',
              description: 'Provider ID',
            },
          },
          required: ['providerId'],
        },
        requiresApproval: false,
        tags: ['byom', 'llm', 'health'],
      },
      {
        name: 'route_to_best_provider',
        description: 'Get the best LLM provider for given data classification',
        inputSchema: {
          type: 'object',
          properties: {
            tenantId: {
              type: 'string',
              description: 'Tenant ID',
            },
            dataClassification: {
              type: 'string',
              enum: ['public', 'internal', 'confidential', 'phi', 'pii', 'pci'],
              description: 'Data classification level',
            },
          },
          required: ['tenantId', 'dataClassification'],
        },
        requiresApproval: false,
        tags: ['byom', 'llm', 'routing'],
      },
    ];
  }

  /**
   * Execute a BYOM tool
   */
  async executeTool(toolCall: { name: string; arguments: Record<string, any> }): Promise<ToolResult> {
    try {
      switch (toolCall.name) {
        case 'configure_llm_provider':
          return await this.configureProvider(toolCall.arguments.tenantId, toolCall.arguments.config);

        case 'list_llm_providers':
          return await this.listProviders(toolCall.arguments.tenantId, toolCall.arguments.includeHealth);

        case 'get_llm_provider':
          return await this.getProvider(toolCall.arguments.providerId);

        case 'update_llm_provider':
          return await this.updateProvider(toolCall.arguments.providerId, toolCall.arguments.updates);

        case 'delete_llm_provider':
          return await this.deleteProvider(toolCall.arguments.providerId);

        case 'test_llm_provider':
          return await this.testProvider(toolCall.arguments.providerId);

        case 'route_to_best_provider':
          return await this.routeToBestProvider(
            toolCall.arguments.tenantId,
            toolCall.arguments.dataClassification,
          );

        default:
          return {
            success: false,
            error: `Unknown BYOM tool: ${toolCall.name}`,
          };
      }
    } catch (error) {
      this.logger.error(`BYOM tool execution failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message || 'Tool execution failed',
      };
    }
  }

  // ============================================================
  // Tool Implementations
  // ============================================================

  private async configureProvider(tenantId: string, config: Partial<LLMProviderConfig>): Promise<ToolResult> {
    const providerId = `${tenantId}-${config.provider}-${Date.now()}`;

    const provider: LLMProviderConfig = {
      id: providerId,
      name: config.name,
      tenantId,
      provider: config.provider as LLMProviderType,
      endpoint: config.endpoint,
      model: config.model,
      apiKey: config.apiKey,
      credentials: config.credentials,
      headers: config.headers || {},
      baaRequired: config.baaRequired ?? this.requiresBAA(config.provider as LLMProviderType),
      baaSigned: config.baaSigned ?? false,
      hipaaCompliant: config.hipaaCompliant ?? this.isHIPAACompliant(config.provider as LLMProviderType),
      dataResidency: config.dataResidency || 'unknown',
      allowedDataClassifications: config.allowedDataClassifications || [DataClassification.PUBLIC],
      priority: config.priority ?? 5,
      fallbackTo: config.fallbackTo,
      capabilities: config.capabilities || {
        chat: true,
        streaming: false,
        functionCalling: false,
        embedding: false,
        vision: false,
        jsonMode: false,
      },
      limits: config.limits || {
        maxTokens: 4096,
        maxConcurrent: 10,
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 100000,
        },
      },
      pricing: config.pricing || {
        inputTokens: 0,
        outputTokens: 0,
        currency: 'USD',
      },
      metadata: config.metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.providers.set(providerId, provider);

    this.logger.log(`Configured LLM provider: ${provider.name} (${provider.provider}) for tenant ${tenantId}`);

    return {
      success: true,
      result: {
        providerId,
        provider,
        message: `LLM provider ${provider.name} configured successfully`,
      },
    };
  }

  private async listProviders(tenantId: string, includeHealth: boolean = true): Promise<ToolResult> {
    const tenantProviders = Array.from(this.providers.values()).filter((p) => p.tenantId === tenantId);

    // Sort by priority (descending)
    tenantProviders.sort((a, b) => b.priority - a.priority);

    if (includeHealth) {
      // Run health checks (in parallel)
      await Promise.all(
        tenantProviders.map(async (provider) => {
          if (!provider.healthCheck) {
            provider.healthCheck = await this.runHealthCheck(provider);
          }
        }),
      );
    }

    return {
      success: true,
      result: {
        providers: tenantProviders,
        total: tenantProviders.length,
      },
    };
  }

  private async getProvider(providerId: string): Promise<ToolResult> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      return {
        success: false,
        error: `Provider ${providerId} not found`,
      };
    }

    return {
      success: true,
      result: { provider },
    };
  }

  private async updateProvider(providerId: string, updates: Partial<LLMProviderConfig>): Promise<ToolResult> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      return {
        success: false,
        error: `Provider ${providerId} not found`,
      };
    }

    // Update fields
    Object.assign(provider, updates, {
      updatedAt: new Date().toISOString(),
    });

    this.providers.set(providerId, provider);

    this.logger.log(`Updated LLM provider: ${provider.name}`);

    return {
      success: true,
      result: {
        provider,
        message: `Provider ${provider.name} updated successfully`,
      },
    };
  }

  private async deleteProvider(providerId: string): Promise<ToolResult> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      return {
        success: false,
        error: `Provider ${providerId} not found`,
      };
    }

    this.providers.delete(providerId);

    this.logger.log(`Deleted LLM provider: ${provider.name}`);

    return {
      success: true,
      result: {
        message: `Provider ${provider.name} deleted successfully`,
      },
    };
  }

  private async testProvider(providerId: string): Promise<ToolResult> {
    const provider = this.providers.get(providerId);

    if (!provider) {
      return {
        success: false,
        error: `Provider ${providerId} not found`,
      };
    }

    const healthCheck = await this.runHealthCheck(provider);
    provider.healthCheck = healthCheck;

    return {
      success: healthCheck.status === 'healthy',
      result: {
        providerId,
        providerName: provider.name,
        healthCheck,
      },
    };
  }

  private async routeToBestProvider(tenantId: string, dataClassification: string): Promise<ToolResult> {
    const classification = dataClassification as DataClassification;
    const tenantProviders = Array.from(this.providers.values()).filter(
      (p) => p.tenantId === tenantId && p.allowedDataClassifications.includes(classification),
    );

    if (tenantProviders.length === 0) {
      return {
        success: false,
        error: `No providers configured for data classification: ${classification}`,
      };
    }

    // Sort by priority
    tenantProviders.sort((a, b) => b.priority - a.priority);

    // Find first healthy provider
    for (const provider of tenantProviders) {
      const health = provider.healthCheck || (await this.runHealthCheck(provider));

      if (health.status === 'healthy') {
        return {
          success: true,
          result: {
            providerId: provider.id,
            providerName: provider.name,
            provider: provider.provider,
            endpoint: provider.endpoint,
            model: provider.model,
            hipaaCompliant: provider.hipaaCompliant,
            dataResidency: provider.dataResidency,
            healthCheck: health,
            explanation: `Selected ${provider.name} (priority ${provider.priority}) for ${classification} data`,
          },
        };
      }
    }

    // All providers unhealthy, return best one anyway with warning
    const bestProvider = tenantProviders[0];
    return {
      success: true,
      result: {
        providerId: bestProvider.id,
        providerName: bestProvider.name,
        provider: bestProvider.provider,
        endpoint: bestProvider.endpoint,
        model: bestProvider.model,
        warning: 'Provider may be unhealthy, but is highest priority',
        healthCheck: bestProvider.healthCheck,
      },
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private async runHealthCheck(
    provider: LLMProviderConfig,
  ): Promise<LLMProviderConfig['healthCheck']> {
    const startTime = Date.now();

    try {
      // Mock health check (in production, would call actual endpoint)
      // await fetch(`${provider.endpoint}/health`);

      const latency = Date.now() - startTime;

      return {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        latencyMs: latency,
        errorRate: 0,
        uptime: 99.9,
      };
    } catch (error) {
      return {
        status: 'down',
        lastCheck: new Date().toISOString(),
        latencyMs: -1,
        errorRate: 100,
        uptime: 0,
      };
    }
  }

  private requiresBAA(provider: LLMProviderType): boolean {
    // Cloud providers typically require BAA for PHI
    return [
      'azure-ai-foundry',
      'aws-bedrock',
      'vertex-ai',
      'openai',
      'anthropic',
    ].includes(provider);
  }

  private isHIPAACompliant(provider: LLMProviderType): boolean {
    // Self-hosted providers are inherently HIPAA compliant (data stays in VPC)
    return [
      'ollama',
      'vllm',
      'tgi',
      'llamacpp',
      'lmstudio',
      'localai',
    ].includes(provider);
  }

  private seedExampleProviders(): void {
    // Seed example Azure provider
    const azureExample: LLMProviderConfig = {
      id: 'example-azure-1',
      name: 'Azure AI Foundry - Example',
      tenantId: 'example-tenant',
      provider: 'azure-ai-foundry',
      endpoint: 'https://your-resource.openai.azure.com',
      model: 'gpt-4-turbo',
      apiKey: '***',
      credentials: {},
      headers: {},
      baaRequired: true,
      baaSigned: true,
      hipaaCompliant: true,
      dataResidency: 'us-east-1',
      allowedDataClassifications: [
        DataClassification.PHI,
        DataClassification.PII,
        DataClassification.PUBLIC,
      ],
      priority: 10,
      capabilities: {
        chat: true,
        streaming: true,
        functionCalling: true,
        embedding: false,
        vision: false,
        jsonMode: true,
      },
      limits: {
        maxTokens: 128000,
        maxConcurrent: 100,
        rateLimit: {
          requestsPerMinute: 300,
          tokensPerMinute: 1000000,
        },
      },
      pricing: {
        inputTokens: 0.01,
        outputTokens: 0.03,
        currency: 'USD',
      },
      healthCheck: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        latencyMs: 120,
        errorRate: 0.1,
        uptime: 99.9,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Seed example Ollama provider
    const ollamaExample: LLMProviderConfig = {
      id: 'example-ollama-1',
      name: 'Ollama Local - Example',
      tenantId: 'example-tenant',
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
      model: 'llama3:70b-instruct',
      credentials: {},
      headers: {},
      baaRequired: false,
      baaSigned: false,
      hipaaCompliant: true,
      dataResidency: 'local',
      allowedDataClassifications: [
        DataClassification.PHI,
        DataClassification.PII,
        DataClassification.PUBLIC,
      ],
      priority: 8,
      capabilities: {
        chat: true,
        streaming: true,
        functionCalling: false,
        embedding: true,
        vision: false,
        jsonMode: true,
      },
      limits: {
        maxTokens: 8192,
        maxConcurrent: 10,
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 100000,
        },
      },
      pricing: {
        inputTokens: 0,
        outputTokens: 0,
        currency: 'USD',
      },
      healthCheck: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
        latencyMs: 150,
        errorRate: 0,
        uptime: 99.5,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.providers.set(azureExample.id, azureExample);
    this.providers.set(ollamaExample.id, ollamaExample);

    this.logger.log('Seeded example BYOM providers');
  }
}

