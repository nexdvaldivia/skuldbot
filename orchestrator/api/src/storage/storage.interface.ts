export interface StorageService {
  /**
   * Upload a file to storage
   */
  upload(bucket: string, key: string, data: Buffer, options?: UploadOptions): Promise<string>;

  /**
   * Download a file from storage
   */
  download(bucket: string, key: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   */
  delete(bucket: string, key: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(bucket: string, key: string): Promise<boolean>;

  /**
   * Get a signed URL for temporary access
   */
  getSignedUrl(bucket: string, key: string, expiresInSeconds: number): Promise<string>;

  /**
   * List files in a bucket with optional prefix
   */
  list(bucket: string, prefix?: string): Promise<StorageObject[]>;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  encryption?: boolean;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
