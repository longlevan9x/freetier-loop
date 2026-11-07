import { AppError, ERROR_CODE } from '@freetier-loop/shared';

export interface SecretCipher {
  encrypt(plaintext: string): Promise<string>;
  decrypt(payload: string): Promise<string>;
  reencrypt(payload: string): Promise<string>;
}

const IV_BYTES = 12;
const KEY_BYTES = 32;

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(Buffer.from(b64, 'base64'));

const importAesKey = async (base64Key: string): Promise<CryptoKey> => {
  const raw = fromBase64(base64Key);
  if (raw.byteLength !== KEY_BYTES) {
    throw new AppError(
      ERROR_CODE.CRYPTO_DECRYPT_FAILED,
      `Encryption key must decode to ${KEY_BYTES} bytes (got ${raw.byteLength})`,
    );
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export type SecretCipherOptions = {
  currentKeyBase64: string;
  currentVersion?: number;
  previousKeyBase64?: string;
};

export const createSecretCipher = (options: SecretCipherOptions): SecretCipher => {
  const currentVersion = options.currentVersion ?? 1;
  const previousVersion = Math.max(1, currentVersion - 1);

  let currentKeyPromise: Promise<CryptoKey> | null = null;
  let previousKeyPromise: Promise<CryptoKey> | null = null;

  const getCurrentKey = () => {
    if (!currentKeyPromise) {
      currentKeyPromise = importAesKey(options.currentKeyBase64);
    }
    return currentKeyPromise;
  };

  const getPreviousKey = () => {
    if (!options.previousKeyBase64) return null;
    if (!previousKeyPromise) {
      previousKeyPromise = importAesKey(options.previousKeyBase64);
    }
    return previousKeyPromise;
  };

  const encrypt = async (plaintext: string): Promise<string> => {
    const key = await getCurrentKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return `v${currentVersion}:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
  };

  const decryptWithKey = async (key: CryptoKey, ivB64: string, ctB64: string): Promise<string> => {
    const iv = fromBase64(ivB64);
    const ct = fromBase64(ctB64);
    if (iv.byteLength !== IV_BYTES) {
      throw new AppError(ERROR_CODE.CRYPTO_DECRYPT_FAILED, 'Invalid IV length');
    }
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(decrypted);
  };

  const decrypt = async (payload: string): Promise<string> => {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new AppError(ERROR_CODE.CRYPTO_DECRYPT_FAILED, 'Invalid ciphertext format');
    }
    const [versionTag, ivB64, ctB64] = parts;
    if (!versionTag || !ivB64 || !ctB64 || !versionTag.startsWith('v')) {
      throw new AppError(ERROR_CODE.CRYPTO_DECRYPT_FAILED, 'Malformed ciphertext header');
    }

    const version = Number.parseInt(versionTag.slice(1), 10);
    try {
      if (version === currentVersion) {
        const key = await getCurrentKey();
        return await decryptWithKey(key, ivB64, ctB64);
      }
      const prevKeyPromise = getPreviousKey();
      if (prevKeyPromise && version === previousVersion) {
        const prevKey = await prevKeyPromise;
        return await decryptWithKey(prevKey, ivB64, ctB64);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(ERROR_CODE.CRYPTO_DECRYPT_FAILED, 'Failed to decrypt secret payload', {
        cause: err,
      });
    }

    try {
      const currentKey = await getCurrentKey();
      return await decryptWithKey(currentKey, ivB64, ctB64);
    } catch {
      const prevKeyPromise = getPreviousKey();
      if (prevKeyPromise) {
        try {
          const prevKey = await prevKeyPromise;
          return await decryptWithKey(prevKey, ivB64, ctB64);
        } catch (err) {
          throw new AppError(
            ERROR_CODE.CRYPTO_DECRYPT_FAILED,
            'Failed to decrypt with current or previous key',
            { cause: err },
          );
        }
      }
      throw new AppError(ERROR_CODE.CRYPTO_DECRYPT_FAILED, 'Unsupported key version');
    }
  };

  const reencrypt = async (payload: string): Promise<string> => {
    const plain = await decrypt(payload);
    return encrypt(plain);
  };

  return { encrypt, decrypt, reencrypt };
};
