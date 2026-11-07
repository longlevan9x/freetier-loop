import crypto from 'node:crypto';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(input: { hash: string; password: string }): Promise<boolean>;
}

const SCRYPT_PARAMS: crypto.ScryptOptions = {
  N: 8192,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

const KEY_LENGTH_BYTES = 64;
const SALT_LENGTH_BYTES = 16;

export const createNativeScryptHasher = (): PasswordHasher => ({
  async hash(password: string): Promise<string> {
    const salt = crypto.randomBytes(SALT_LENGTH_BYTES);
    const derived = crypto.scryptSync(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH_BYTES,
      SCRYPT_PARAMS,
    );
    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  },

  async verify({ hash, password }): Promise<boolean> {
    const parts = hash.split(':');
    if (parts.length !== 2) return false;
    const [saltHex, keyHex] = parts;
    if (!saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const targetKey = Buffer.from(keyHex, 'hex');
    if (salt.length !== SALT_LENGTH_BYTES || targetKey.length !== KEY_LENGTH_BYTES) {
      return false;
    }

    const derived = crypto.scryptSync(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH_BYTES,
      SCRYPT_PARAMS,
    );
    return crypto.timingSafeEqual(derived, targetKey);
  },
});
