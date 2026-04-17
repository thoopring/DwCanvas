import type { JWTPayload } from '../types';

const encoder = new TextEncoder();

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: JWTPayload = { ...payload, iat: now, exp: now + 7 * 24 * 3600 }; // 7 days

  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) as Uint8Array);
  const body = base64url(encoder.encode(JSON.stringify(full)) as Uint8Array);
  const data = `${header}.${body}`;

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  return `${data}.${base64url(sig)}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const key = await getKey(secret);
  const data = `${parts[0]}.${parts[1]}`;
  const sig = base64urlDecode(parts[2]);

  const valid = await crypto.subtle.verify('HMAC', key, sig.buffer as ArrayBuffer, encoder.encode(data));
  if (!valid) return null;

  const decoded = base64urlDecode(parts[1]);
  const payload: JWTPayload = JSON.parse(new TextDecoder().decode(decoded.buffer as ArrayBuffer));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
