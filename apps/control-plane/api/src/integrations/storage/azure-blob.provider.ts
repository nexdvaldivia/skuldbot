import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import {
  IntegrationType,
  StorageObject,
  StorageProvider,
  UploadData,
  UploadResult,
} from '../../common/interfaces/integration.interface';

@Injectable()
export class AzureBlobProvider implements StorageProvider {
  readonly name = 'azure-blob';
  readonly type = IntegrationType.STORAGE;

  private readonly logger = new Logger(AzureBlobProvider.name);
  private readonly containerName: string | null;
  private readonly serviceClient: BlobServiceClient | null;
  private readonly sharedKeyCredential: StorageSharedKeyCredential | null;

  constructor(private readonly configService: ConfigService) {
    this.containerName = this.configService.get<string>('AZURE_STORAGE_CONTAINER') ?? null;

    const connectionString = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING');
    const accountName =
      this.configService.get<string>('AZURE_STORAGE_ACCOUNT_NAME') ||
      this.configService.get<string>('AZURE_STORAGE_ACCOUNT');
    const accountKey = this.configService.get<string>('AZURE_STORAGE_ACCOUNT_KEY');
    const endpointSuffix = this.configService.get<string>(
      'AZURE_STORAGE_ENDPOINT_SUFFIX',
      'core.windows.net',
    );
    const explicitBlobEndpoint = this.configService.get<string>('AZURE_STORAGE_BLOB_ENDPOINT');

    let client: BlobServiceClient | null = null;
    let credential: StorageSharedKeyCredential | null = null;

    if (connectionString) {
      client = BlobServiceClient.fromConnectionString(connectionString);
      if (accountName && accountKey) {
        credential = new StorageSharedKeyCredential(accountName, accountKey);
      }
    } else if (accountName && accountKey) {
      credential = new StorageSharedKeyCredential(accountName, accountKey);
      const endpoint = explicitBlobEndpoint || `https://${accountName}.blob.${endpointSuffix}`;
      client = new BlobServiceClient(endpoint, credential);
    }

    this.serviceClient = client;
    this.sharedKeyCredential = credential;

    if (this.serviceClient && this.containerName) {
      this.logger.log('Azure Blob provider initialized');
    } else {
      this.logger.warn(
        'Azure Blob provider not configured - missing AZURE_STORAGE_CONTAINER and credentials',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.serviceClient && this.containerName);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      await this.getContainerClient().getProperties();
      return true;
    } catch {
      return false;
    }
  }

  async upload(data: UploadData): Promise<UploadResult> {
    this.ensureConfigured();

    const blobClient = this.getContainerClient().getBlockBlobClient(data.key);
    const body = typeof data.body === 'string' ? Buffer.from(data.body) : data.body;

    const response = await blobClient.uploadData(body, {
      blobHTTPHeaders: {
        blobContentType: data.contentType,
      },
      metadata: data.metadata,
    });

    return {
      key: data.key,
      url: blobClient.url,
      etag: response.etag,
    };
  }

  async download(key: string): Promise<Buffer> {
    this.ensureConfigured();

    const blobClient = this.getContainerClient().getBlobClient(key);
    const response = await blobClient.download();

    if (!response.readableStreamBody) {
      throw new Error(`No data returned from Azure Blob for key "${key}"`);
    }

    return streamToBuffer(response.readableStreamBody);
  }

  async delete(key: string): Promise<void> {
    this.ensureConfigured();

    const blobClient = this.getContainerClient().getBlobClient(key);
    await blobClient.deleteIfExists();
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    this.ensureConfigured();

    const blobClient = this.getContainerClient().getBlobClient(key);
    if (!this.sharedKeyCredential || !this.containerName) {
      this.logger.warn(
        'Shared key credentials not available for Azure Blob signed URL. Returning public blob URL.',
      );
      return blobClient.url;
    }

    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + expiresIn * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: key,
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        startsOn,
        expiresOn,
      },
      this.sharedKeyCredential,
    ).toString();

    return `${blobClient.url}?${sas}`;
  }

  async list(prefix?: string): Promise<StorageObject[]> {
    this.ensureConfigured();

    const objects: StorageObject[] = [];
    const iterator = this.getContainerClient().listBlobsFlat({ prefix });

    for await (const blob of iterator) {
      objects.push({
        key: blob.name,
        size: blob.properties.contentLength || 0,
        lastModified: blob.properties.lastModified || new Date(),
      });
    }

    return objects;
  }

  private getContainerClient() {
    this.ensureConfigured();
    return this.serviceClient!.getContainerClient(this.containerName!);
  }

  private ensureConfigured(): void {
    if (!this.serviceClient || !this.containerName) {
      throw new Error('Azure Blob provider is not configured');
    }
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
