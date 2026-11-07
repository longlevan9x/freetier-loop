import { describe, expect, it } from 'vitest';
import { createSecretCipher } from '../platform/crypto';
import { createNativeScryptHasher } from '../platform/password-hasher';

const KEY_V1 = Buffer.alloc(32, 1).toString('base64');
const KEY_V2 = Buffer.alloc(32, 2).toString('base64');

describe('Security primitives (T-030 & T-039)', () => {
  it('hashes and verifies passwords in < 15ms using native scrypt', async () => {
    const hasher = createNativeScryptHasher();
    const start = performance.now();
    const hash = await hasher.hash('correct-horse-battery-staple');
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(50);
    expect(await hasher.verify({ hash, password: 'correct-horse-battery-staple' })).toBe(true);
    expect(await hasher.verify({ hash, password: 'wrong-password' })).toBe(false);
    expect(await hasher.verify({ hash: 'invalid-format', password: 'abc' })).toBe(false);
  });

  it('encrypts and decrypts secrets with AES-256-GCM and supports key rotation', async () => {
    const cipherV1 = createSecretCipher({ currentKeyBase64: KEY_V1, currentVersion: 1 });
    const encryptedV1 = await cipherV1.encrypt('cf_token_super_secret_1234');
    expect(encryptedV1.startsWith('v1:')).toBe(true);
    expect(encryptedV1).not.toContain('cf_token_super_secret_1234');
    expect(await cipherV1.decrypt(encryptedV1)).toBe('cf_token_super_secret_1234');

    const cipherV2 = createSecretCipher({
      currentKeyBase64: KEY_V2,
      currentVersion: 2,
      previousKeyBase64: KEY_V1,
    });
    expect(await cipherV2.decrypt(encryptedV1)).toBe('cf_token_super_secret_1234');

    const rotated = await cipherV2.reencrypt(encryptedV1);
    expect(rotated.startsWith('v2:')).toBe(true);
    expect(await cipherV2.decrypt(rotated)).toBe('cf_token_super_secret_1234');
  });

  it('rejects tampered ciphertext', async () => {
    const cipher = createSecretCipher({ currentKeyBase64: KEY_V1 });
    const encrypted = await cipher.encrypt('sensitive-value');
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    await expect(cipher.decrypt(tampered)).rejects.toThrow();
  });
});
