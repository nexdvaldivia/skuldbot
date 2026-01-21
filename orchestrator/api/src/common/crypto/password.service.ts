import { Injectable } from '@nestjs/common';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';

/**
 * Password Service for secure password hashing and verification.
 *
 * Uses Argon2id - the winner of the Password Hashing Competition and
 * recommended by OWASP for password storage.
 *
 * Argon2id is preferred because it provides:
 * - Protection against GPU cracking attacks
 * - Protection against side-channel attacks
 * - Memory-hard computation (makes parallel attacks expensive)
 */
@Injectable()
export class PasswordService {
  /**
   * Argon2 configuration following OWASP recommendations.
   * These settings balance security with performance.
   */
  private readonly argon2Options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3, // 3 iterations
    parallelism: 4, // 4 parallel threads
    hashLength: 32, // 32 bytes output
  };

  /**
   * Hash a password using Argon2id.
   *
   * @param password - Plain text password
   * @returns Hashed password string (includes algorithm params and salt)
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, this.argon2Options);
  }

  /**
   * Verify a password against a hash.
   * Uses constant-time comparison to prevent timing attacks.
   *
   * @param password - Plain text password to verify
   * @param hash - Stored password hash
   * @returns True if password matches
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Invalid hash format or other error
      return false;
    }
  }

  /**
   * Check if a password hash needs to be rehashed.
   * Call this during login to upgrade old hashes.
   *
   * @param hash - Current password hash
   * @returns True if hash should be regenerated
   */
  async needsRehash(hash: string): Promise<boolean> {
    return argon2.needsRehash(hash, this.argon2Options);
  }

  /**
   * Validate password strength.
   * Returns validation result with specific failures.
   *
   * Requirements (NIST SP 800-63B compliant):
   * - Minimum 8 characters
   * - Not in common password list (implement separately)
   * - Not repetitive or sequential
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
    score: number;
  } {
    const errors: string[] = [];
    let score = 0;

    // Minimum length
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    } else {
      score += 1;
    }

    // Encourage longer passwords
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    // Check for character variety (not required, but increases score)
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;

    // Check for repetitive patterns
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password contains repetitive characters');
      score -= 1;
    }

    // Check for sequential characters
    if (this.hasSequentialChars(password)) {
      errors.push('Password contains sequential characters');
      score -= 1;
    }

    return {
      isValid: errors.length === 0,
      errors,
      score: Math.max(0, Math.min(5, score)), // Score 0-5
    };
  }

  /**
   * Hash a token (for refresh tokens, verification tokens, etc.)
   * Uses SHA256 for fast hashing since tokens are already high-entropy.
   */
  async hashToken(token: string): Promise<string> {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Verify a token against its hash.
   * Uses constant-time comparison.
   */
  async verifyToken(token: string, hash: string): Promise<boolean> {
    const tokenHash = await this.hashToken(token);
    if (tokenHash.length !== hash.length) {
      return false;
    }
    try {
      return timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hash));
    } catch {
      return false;
    }
  }

  private hasSequentialChars(password: string): boolean {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
    ];

    const lower = password.toLowerCase();

    for (const seq of sequences) {
      for (let i = 0; i <= seq.length - 3; i++) {
        if (lower.includes(seq.substring(i, i + 3))) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * Token Service for generating secure random tokens.
 */
@Injectable()
export class TokenService {
  /**
   * Generate a secure random token.
   *
   * @param length - Number of bytes (will be hex encoded, so string length = length * 2)
   * @returns Hex-encoded random token
   */
  generateToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate a prefixed API key.
   * Format: sk_<env>_<32 random hex chars>
   *
   * @param environment - 'live' or 'test'
   * @returns API key string and its hash
   */
  generateApiKey(environment: 'live' | 'test' = 'live'): {
    key: string;
    hash: string;
    prefix: string;
  } {
    const randomPart = this.generateToken(16); // 32 hex chars
    const key = `sk_${environment}_${randomPart}`;
    const hash = this.hashToken(key);
    const prefix = key.substring(0, 12); // sk_live_xxxx

    return { key, hash, prefix };
  }

  /**
   * Generate a runner API key.
   * Format: skr_<32 random hex chars>
   */
  generateRunnerKey(): { key: string; hash: string; prefix: string } {
    const randomPart = this.generateToken(16);
    const key = `skr_${randomPart}`;
    const hash = this.hashToken(key);
    const prefix = key.substring(0, 8);

    return { key, hash, prefix };
  }

  /**
   * Generate email verification token.
   * URL-safe base64, expires after specified time.
   */
  generateVerificationToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate password reset token.
   */
  generatePasswordResetToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate MFA backup codes.
   * Returns array of 10 codes in format XXXX-XXXX.
   */
  generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.substring(0, 4)}-${code.substring(4, 8)}`);
    }

    return codes;
  }

  /**
   * Generate a TOTP secret for MFA.
   * Returns base32-encoded secret.
   */
  generateTotpSecret(): string {
    const secret = randomBytes(20);
    return this.base32Encode(secret);
  }

  /**
   * Generate a secure random token for general use.
   * URL-safe base64 encoded.
   */
  generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Hash a token using SHA256.
   * Used for storing API keys and tokens securely.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Async version of hashToken for consistency with other services.
   */
  async hashTokenAsync(token: string): Promise<string> {
    return this.hashToken(token);
  }

  /**
   * Constant-time comparison of two tokens.
   * Prevents timing attacks.
   */
  compareTokens(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    try {
      return timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }

  /**
   * Generate a session ID.
   */
  generateSessionId(): string {
    return `sess_${this.generateToken(24)}`;
  }

  /**
   * Generate a request/correlation ID for tracing.
   */
  generateRequestId(): string {
    return `req_${this.generateToken(12)}`;
  }

  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;

    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31];
    }

    return result;
  }
}
