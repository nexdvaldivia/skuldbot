import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENCRYPTED_PREFIX = 'enc';

export function hashSecretSha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function encryptSecretAes256Gcm(value: string, seed: string): string {
  const iv = randomBytes(12);
  const key = deriveAesKey(seed);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}:${iv.toString('base64url')}:${authTag.toString('base64url')}:${encrypted.toString(
    'base64url',
  )}`;
}

export function decryptSecretAes256Gcm(value: string, seed: string): string {
  if (!isEncryptedSecret(value)) {
    return value;
  }

  const [, ivEncoded, tagEncoded, encryptedEncoded] = value.split(':');
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error('Invalid encrypted secret format');
  }

  const key = deriveAesKey(seed);
  const iv = Buffer.from(ivEncoded, 'base64url');
  const authTag = Buffer.from(tagEncoded, 'base64url');
  const encrypted = Buffer.from(encryptedEncoded, 'base64url');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

export function maskSecret(value: string, visiblePrefix = 4, visibleSuffix = 4): string {
  if (value.length <= visiblePrefix) {
    return `${value}...`;
  }
  const prefix = value.slice(0, visiblePrefix);
  const suffix = value.length > visiblePrefix + visibleSuffix ? value.slice(-visibleSuffix) : '';
  return `${prefix}...${suffix}`;
}

function deriveAesKey(seed: string): Buffer {
  return createHash('sha256').update(seed, 'utf8').digest();
}
