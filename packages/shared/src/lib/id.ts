import type { IdPrefix } from '../constants/ids';

const CROCKFORD_BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';

const encodeTime = (timeMs: number, length: number): string => {
  let value = Math.floor(timeMs);
  let out = '';
  for (let i = 0; i < length; i++) {
    const mod = value % 32;
    out = CROCKFORD_BASE32[mod] + out;
    value = Math.floor(value / 32);
  }
  return out;
};

const encodeRandom = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += CROCKFORD_BASE32[byte & 31];
  }
  return out;
};

export const newId = (prefix: IdPrefix, nowMs: number = Date.now()): string => {
  const timePart = encodeTime(nowMs, 10);
  const randomPart = encodeRandom(16);
  return `${prefix}_${timePart}${randomPart}`;
};
