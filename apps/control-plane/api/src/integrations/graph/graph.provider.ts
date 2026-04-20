import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import {
  GraphProvider,
  IntegrationType,
  GraphUser,
  GraphGroup,
  GraphMailData,
} from '../../common/interfaces/integration.interface';

@Injectable()
export class MicrosoftGraphProvider implements GraphProvider {
  readonly name = 'microsoft-graph';
  readonly type = IntegrationType.GRAPH;

  private readonly logger = new Logger(MicrosoftGraphProvider.name);
  private client: Client | null = null;

  constructor(private readonly configService: ConfigService) {
    const tenantId = this.configService.get<string>('AZURE_TENANT_ID');
    const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('AZURE_CLIENT_SECRET');

    if (tenantId && clientId && clientSecret) {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      this.client = Client.initWithMiddleware({
        authProvider,
      });

      this.logger.log('Microsoft Graph provider initialized');
    } else {
      this.logger.warn('Microsoft Graph provider not configured - missing Azure credentials');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.api('/organization').get();
      return true;
    } catch {
      return false;
    }
  }

  async getUsers(): Promise<GraphUser[]> {
    this.ensureConfigured();

    const response = await this.client!.api('/users')
      .select('id,displayName,mail,userPrincipalName')
      .get();

    return response.value.map(this.mapUser);
  }

  async getUser(userId: string): Promise<GraphUser> {
    this.ensureConfigured();

    const user = await this.client!.api(`/users/${userId}`)
      .select('id,displayName,mail,userPrincipalName')
      .get();

    return this.mapUser(user);
  }

  async getGroups(): Promise<GraphGroup[]> {
    this.ensureConfigured();

    const response = await this.client!.api('/groups')
      .select('id,displayName,description')
      .get();

    return response.value.map(this.mapGroup);
  }

  async sendMail(userId: string, data: GraphMailData): Promise<void> {
    this.ensureConfigured();

    const message = {
      message: {
        subject: data.subject,
        body: {
          contentType: 'HTML',
          content: data.body,
        },
        toRecipients: data.toRecipients.map((email) => ({
          emailAddress: { address: email },
        })),
      },
    };

    await this.client!.api(`/users/${userId}/sendMail`).post(message);
  }

  private ensureConfigured(): void {
    if (!this.client) {
      throw new Error('Microsoft Graph provider is not configured');
    }
  }

  private mapUser(user: Record<string, unknown>): GraphUser {
    return {
      id: user.id as string,
      displayName: user.displayName as string,
      mail: user.mail as string,
      userPrincipalName: user.userPrincipalName as string,
    };
  }

  private mapGroup(group: Record<string, unknown>): GraphGroup {
    return {
      id: group.id as string,
      displayName: group.displayName as string,
      description: group.description as string | undefined,
    };
  }
}
