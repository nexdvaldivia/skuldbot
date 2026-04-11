import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Signature Result from signing operation
 */
export interface SignatureResult {
  algorithm: string;
  signedAt: string;
  signature: string;
  certificateFingerprint: string;
  tsaTimestamp?: string;
  tsaAuthority?: string;
}

/**
 * Digital Signature Service for Evidence Packs
 *
 * Provides cryptographic signing using:
 * - RSA-PSS with 4096-bit keys (primary)
 * - ECDSA with P-384 curve (alternative)
 *
 * Optional TSA (Time Stamp Authority) integration for legal validity.
 *
 * In production, private keys should be stored in HSM/KMS.
 */
@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  private privateKey: crypto.KeyObject | null = null;
  private publicKey: crypto.KeyObject | null = null;
  private certificateFingerprint: string = '';
  private readonly algorithm: string;

  constructor(private readonly configService: ConfigService) {
    this.algorithm = this.configService.get<string>('evidence.signatureAlgorithm', 'RSA-PSS-4096');
    this.initializeKeys();
  }

  /**
   * Initialize signing keys.
   * In production, these would come from HSM/KMS.
   */
  private initializeKeys(): void {
    const provider = this.configService.get<string>('evidence.signatureProvider', 'local');

    if (provider === 'local') {
      // Generate ephemeral keys for development/testing
      // In production, use HSM-backed keys
      if (this.algorithm.startsWith('RSA')) {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 4096,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        this.privateKey = crypto.createPrivateKey(privateKey);
        this.publicKey = crypto.createPublicKey(publicKey);
      } else {
        // ECDSA with P-384
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
          namedCurve: 'P-384',
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        this.privateKey = crypto.createPrivateKey(privateKey);
        this.publicKey = crypto.createPublicKey(publicKey);
      }

      // Generate certificate fingerprint (in production, use actual certificate)
      const publicKeyDer = this.publicKey.export({ type: 'spki', format: 'der' });
      this.certificateFingerprint = crypto
        .createHash('sha256')
        .update(publicKeyDer)
        .digest('hex');

      this.logger.log(`Signature service initialized with local ${this.algorithm} keys`);
    } else {
      // TODO: Implement HSM/KMS provider
      this.logger.warn(`Signature provider '${provider}' not yet implemented`);
    }
  }

  /**
   * Sign a manifest JSON string.
   */
  async signManifest(manifestJson: string): Promise<SignatureResult> {
    if (!this.privateKey) {
      throw new Error('Signing key not initialized');
    }

    const signedAt = new Date().toISOString();

    // Create signature
    let signature: Buffer;
    if (this.algorithm.startsWith('RSA')) {
      signature = crypto.sign('sha256', Buffer.from(manifestJson), {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      });
    } else {
      signature = crypto.sign('sha384', Buffer.from(manifestJson), this.privateKey);
    }

    const result: SignatureResult = {
      algorithm: this.algorithm,
      signedAt,
      signature: signature.toString('base64'),
      certificateFingerprint: this.certificateFingerprint,
    };

    // Optional TSA timestamping
    const tsaEnabled = this.configService.get<boolean>('evidence.tsaEnabled', false);
    if (tsaEnabled) {
      const tsaResult = await this.requestTsaTimestamp(signature);
      if (tsaResult) {
        result.tsaTimestamp = tsaResult.timestamp;
        result.tsaAuthority = tsaResult.authority;
      }
    }

    return result;
  }

  /**
   * Verify a signature against manifest JSON.
   */
  async verifySignature(
    manifestJson: string,
    signatureBase64: string,
    expectedFingerprint: string,
  ): Promise<boolean> {
    if (!this.publicKey) {
      throw new Error('Verification key not initialized');
    }

    // Verify fingerprint matches
    if (expectedFingerprint !== this.certificateFingerprint) {
      this.logger.warn('Certificate fingerprint mismatch');
      return false;
    }

    const signature = Buffer.from(signatureBase64, 'base64');

    try {
      if (this.algorithm.startsWith('RSA')) {
        return crypto.verify(
          'sha256',
          Buffer.from(manifestJson),
          {
            key: this.publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          },
          signature,
        );
      } else {
        return crypto.verify('sha384', Buffer.from(manifestJson), this.publicKey, signature);
      }
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Get public key for external verification.
   */
  getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error('Public key not initialized');
    }
    return this.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  /**
   * Get certificate fingerprint.
   */
  getCertificateFingerprint(): string {
    return this.certificateFingerprint;
  }

  /**
   * Request timestamp from TSA (Time Stamp Authority).
   * In production, this would call an RFC 3161 compliant TSA.
   */
  private async requestTsaTimestamp(
    signature: Buffer,
  ): Promise<{ timestamp: string; authority: string } | null> {
    const tsaUrl = this.configService.get<string>('evidence.tsaUrl');

    if (!tsaUrl) {
      return null;
    }

    try {
      // TODO: Implement RFC 3161 TSA request
      // For now, return simulated timestamp
      this.logger.debug('TSA timestamping not yet implemented, returning simulated timestamp');

      return {
        timestamp: new Date().toISOString(),
        authority: 'simulated-tsa',
      };
    } catch (error) {
      this.logger.warn(`Failed to get TSA timestamp: ${error}`);
      return null;
    }
  }
}
