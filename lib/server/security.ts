import { createHash, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const DEFAULT_MAX_BODY_BYTES = 24_000;

type JsonObject = Record<string, unknown>;

let cachedServiceClient: SupabaseClient | null | undefined;
const secretCache = new Map<string, { value: string; expiresAt: number }>();

export function getServiceClient() {
  if (cachedServiceClient !== undefined) return cachedServiceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cachedServiceClient = null;
    return null;
  }

  cachedServiceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedServiceClient;
}

export function requestComesFromSameSite(request: NextRequest | Request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    return originUrl.host === requestUrl.host;
  } catch {
    return false;
  }
}

export async function readLimitedJson<T extends JsonObject>(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<T> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');

  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_JSON');
  }

  return parsed as T;
}

function clientAddress(request: NextRequest | Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function rateLimitKey(request: NextRequest | Request, bucket: string, identity = '') {
  const salt = process.env.API_RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'ceami';
  return createHash('sha256')
    .update(`${salt}|${bucket}|${clientAddress(request)}|${identity}`)
    .digest('hex');
}

export async function consumeRateLimit(
  request: NextRequest | Request,
  bucket: string,
  windowSeconds: number,
  maxRequests: number,
  identity = '',
) {
  const service = getServiceClient();
  if (!service) return false;

  const { data, error } = await service.rpc('consume_api_rate_limit', {
    p_key: rateLimitKey(request, bucket, identity),
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });

  if (error) {
    console.error('Rate limit check failed:', error.message);
    return false;
  }

  return data === true;
}

export async function getSecuritySecret(name: string) {
  const cached = secretCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const service = getServiceClient();
  if (!service) return '';

  const { data, error } = await service
    .from('api_security_secrets')
    .select('secret')
    .eq('name', name)
    .maybeSingle();

  if (error || !data?.secret) {
    console.error(`Security secret “${name}” unavailable:`, error?.message || 'not found');
    return '';
  }

  const value = String(data.secret);
  secretCache.set(name, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
  return value;
}

export function safeEqual(received: string, expected: string) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function hasValidBearer(request: Request, secretName: string) {
  const authorization = request.headers.get('authorization') || '';
  const received = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const expected = await getSecuritySecret(secretName);
  return safeEqual(received, expected);
}

export function publicErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
    return { message: 'Os dados enviados ultrapassam o limite permitido.', status: 413 };
  }
  if (error instanceof Error && error.message === 'INVALID_JSON') {
    return { message: 'Dados inválidos.', status: 400 };
  }
  return { message: 'Não foi possível concluir a solicitação.', status: 500 };
}
