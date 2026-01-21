import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageProvider,
  IntegrationType,
  UploadData,
  UploadResult,
  StorageObject,
} from '../../common/interfaces/integration.interface';

@Injectable()
export class S3Provider implements StorageProvider {
  readonly name = 's3';
  readonly type = IntegrationType.STORAGE;

  private readonly logger = new Logger(S3Provider.name);
  private client: S3Client | null = null;
  private bucket: string | null = null;
  private region: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') || null;

    if (accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.logger.log('S3 provider initialized');
    } else {
      this.logger.warn('S3 provider not configured - missing AWS credentials or bucket');
    }
  }

  isConfigured(): boolean {
    return this.client !== null && this.bucket !== null;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.client!.send(
        new ListObjectsV2Command({
          Bucket: this.bucket!,
          MaxKeys: 1,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async upload(data: UploadData): Promise<UploadResult> {
    this.ensureConfigured();

    const command = new PutObjectCommand({
      Bucket: this.bucket!,
      Key: data.key,
      Body: data.body,
      ContentType: data.contentType,
      Metadata: data.metadata,
    });

    const result = await this.client!.send(command);

    return {
      key: data.key,
      url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${data.key}`,
      etag: result.ETag,
    };
  }

  async download(key: string): Promise<Buffer> {
    this.ensureConfigured();

    const command = new GetObjectCommand({
      Bucket: this.bucket!,
      Key: key,
    });

    const response = await this.client!.send(command);
    const stream = response.Body;

    if (!stream) {
      throw new Error('No data returned from S3');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    this.ensureConfigured();

    const command = new DeleteObjectCommand({
      Bucket: this.bucket!,
      Key: key,
    });

    await this.client!.send(command);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    this.ensureConfigured();

    const command = new GetObjectCommand({
      Bucket: this.bucket!,
      Key: key,
    });

    return getSignedUrl(this.client!, command, { expiresIn });
  }

  async list(prefix?: string): Promise<StorageObject[]> {
    this.ensureConfigured();

    const command = new ListObjectsV2Command({
      Bucket: this.bucket!,
      Prefix: prefix,
    });

    const response = await this.client!.send(command);

    return (response.Contents || []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }));
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('S3 provider is not configured');
    }
  }
}
