import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StorageService,
  UploadOptions,
  StorageObject,
} from '../storage.interface';

@Injectable()
export class LocalStorageProvider implements StorageService {
  private basePath: string;

  constructor(private configService: ConfigService) {
    this.basePath = this.configService.get('storage.local.basePath') || './storage';
  }

  private getFullPath(bucket: string, key: string): string {
    return path.join(this.basePath, bucket, key);
  }

  async upload(
    bucket: string,
    key: string,
    data: Buffer,
    options?: UploadOptions,
  ): Promise<string> {
    const fullPath = this.getFullPath(bucket, key);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, data);

    // Store metadata if provided
    if (options?.metadata) {
      const metaPath = `${fullPath}.meta.json`;
      await fs.writeFile(metaPath, JSON.stringify({
        contentType: options.contentType,
        metadata: options.metadata,
        uploadedAt: new Date().toISOString(),
      }));
    }

    return key;
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(bucket, key);
    return fs.readFile(fullPath);
  }

  async delete(bucket: string, key: string): Promise<void> {
    const fullPath = this.getFullPath(bucket, key);
    await fs.unlink(fullPath).catch(() => {});

    // Also delete metadata file if exists
    const metaPath = `${fullPath}.meta.json`;
    await fs.unlink(metaPath).catch(() => {});
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const fullPath = this.getFullPath(bucket, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    // Local storage doesn't support signed URLs
    // Return a placeholder path - in production, serve via API endpoint
    return `/api/storage/${bucket}/${key}`;
  }

  async list(bucket: string, prefix?: string): Promise<StorageObject[]> {
    const bucketPath = path.join(this.basePath, bucket);
    const searchPath = prefix ? path.join(bucketPath, prefix) : bucketPath;

    try {
      const files = await this.listFilesRecursive(searchPath, bucketPath);
      return files;
    } catch {
      return [];
    }
  }

  private async listFilesRecursive(
    dir: string,
    basePath: string,
  ): Promise<StorageObject[]> {
    const results: StorageObject[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subResults = await this.listFilesRecursive(fullPath, basePath);
        results.push(...subResults);
      } else if (!entry.name.endsWith('.meta.json')) {
        const stats = await fs.stat(fullPath);
        results.push({
          key: path.relative(basePath, fullPath),
          size: stats.size,
          lastModified: stats.mtime,
        });
      }
    }

    return results;
  }
}
