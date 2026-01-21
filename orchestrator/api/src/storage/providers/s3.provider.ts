import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageService,
  UploadOptions,
  StorageObject,
} from '../storage.interface';

@Injectable()
export class S3StorageProvider implements StorageService {
  private client: S3Client;

  constructor(private configService: ConfigService) {
    const s3Config = this.configService.get('storage.s3');

    this.client = new S3Client({
      endpoint: s3Config.endpoint,
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async upload(
    bucket: string,
    key: string,
    data: Buffer,
    options?: UploadOptions,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: options?.contentType,
      Metadata: options?.metadata,
    });

    await this.client.send(command);
    return key;
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    const chunks: Uint8Array[] = [];

    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async delete(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  async list(bucket: string, prefix?: string): Promise<StorageObject[]> {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const response = await this.client.send(command);

    return (response.Contents || []).map((item) => ({
      key: item.Key!,
      size: item.Size!,
      lastModified: item.LastModified!,
      etag: item.ETag,
    }));
  }
}
