const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buffer: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i] ?? 0;
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

export const base32Decode = (input: string): Uint8Array => {
  const cleanInput = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i];
    const index = char ? BASE32_ALPHABET.indexOf(char) : -1;
    if (index === -1) {
      continue;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
};

export const generateTotpSecret = (byteLength = 20): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
};

export const generateTotpCode = async (
  secret: string,
  timestampSeconds = Math.floor(Date.now() / 1000),
  stepSeconds = 30,
): Promise<string> => {
  const counter = Math.floor(timestampSeconds / stepSeconds);
  const keyBytes = base32Decode(secret);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const counterBuffer = new ArrayBuffer(8);
  const dataView = new DataView(counterBuffer);
  // Big-endian 64-bit integer
  dataView.setUint32(0, Math.floor(counter / 0x100000000), false);
  dataView.setUint32(4, counter >>> 0, false);

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signature);

  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
};

export const verifyTotpCode = async (
  secret: string,
  code: string,
  timestampSeconds = Math.floor(Date.now() / 1000),
  window = 1,
  stepSeconds = 30,
): Promise<boolean> => {
  const cleanCode = code.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return false;
  }

  for (let w = -window; w <= window; w++) {
    const expected = await generateTotpCode(
      secret,
      timestampSeconds + w * stepSeconds,
      stepSeconds,
    );
    if (expected === cleanCode) {
      return true;
    }
  }

  return false;
};

export const generateOtpAuthUri = (
  email: string,
  secret: string,
  issuer = 'freetier-loop',
): string => {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
};
