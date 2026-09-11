import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';
import { consumeRateLimit, getServiceClient, requestComesFromSameSite } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEMINAR_SLUG = 'seminario-apocalipse-2026';

type Candidate = {
  id: string;
  name: string;
  originalPhone: string;
  normalizedPhone: string;
  status: 'confirmed' | 'warning' | 'invalid';
  reason: string;
  whatsappExists: boolean | null;
};

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isPdfMaterial(value: unknown) {
  const normalized = normalizeText(value);
  return normalized.includes('pdf') || normalized.includes('digital');
}

function paymentStatus(answers: Record<string, unknown>) {
  const raw = answers.__payment;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  return String((raw as Record<string, unknown>).status || '');
}

function normalizeBrazilPhone(value: unknown) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 11) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function validatePhone(value: unknown) {
  const original = String(value ?? '').trim();
  const digits = normalizeBrazilPhone(original);

  if (!original) {
    return { original, normalized: '', status: 'invalid' as const, reason: 'Telefone não informado.' };
  }
  if (!digits.startsWith('55')) {
    return { original, normalized: digits, status: 'invalid' as const, reason: 'Número não está no padrão brasileiro (+55).' };
  }

  const national = digits.slice(2);
  if (national.length !== 10 && national.length !== 11) {
    return { original, normalized: digits, status: 'invalid' as const, reason: 'Quantidade de dígitos inválida.' };
  }

  const ddd = Number(national.slice(0, 2));
  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99 || national[0] === '0' || national[1] === '0') {
    return { original, normalized: digits, status: 'invalid' as const, reason: 'DDD inválido.' };
  }

  const local = national.slice(2);
  if (/^(\d)\1+$/.test(local)) {
    return { original, normalized: digits, status: 'invalid' as const, reason: 'Número local inválido.' };
  }

  if (national.length === 10) {
    return {
      original,
      normalized: digits,
      status: 'warning' as const,
      reason: 'Número com 8 dígitos locais. Revisar se deveria possuir o 9º dígito.',
    };
  }

  if (local[0] !== '9') {
    return {
      original,
      normalized: digits,
      status: 'warning' as const,
      reason: 'Número móvel de 9 dígitos não começa com 9. Revisar antes do envio.',
    };
  }

  return { original, normalized: digits, status: 'confirmed' as const, reason: 'Formato brasileiro válido.' };
}

function providerResults(payload: unknown) {
  const root = payload as Record<string, unknown> | null;
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data)
      ? root?.data
      : Array.isArray(root?.response)
        ? root?.response
        : [];

  const map = new Map<string, boolean>();
  for (const item of candidates as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const number = normalizeBrazilPhone(row.number || row.jid || row.remoteJid || '');
    if (!number) continue;
    const exists = row.exists === true || row.exists === 'true' || row.isWhatsapp === true || row.registered === true;
    map.set(number, exists);

    // A Evolution/WhatsApp pode devolver o JID brasileiro sem o 9º dígito.
    if (number.length === 12) map.set(`${number.slice(0, 4)}9${number.slice(4)}`, exists);
    if (number.length === 13 && number.charAt(4) === '9') map.set(`${number.slice(0, 4)}${number.slice(5)}`, exists);
  }
  return map;
}

async function verifyOnWhatsApp(numbers: string[]) {
  const config = getEvolutionConfig();
  if (!evolutionConfigured(config) || !numbers.length) return null;

  try {
    const response = await fetch(
      `${config.apiUrl}/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
        body: JSON.stringify({ numbers }),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) return null;
    return providerResults(await response.json());
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const role = await getCurrentUiRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  }

  const allowed = await consumeRateLimit(request, 'seminar_pdf_preflight', 60, 6);
  if (!allowed) return NextResponse.json({ error: 'Aguarde um minuto antes de conferir novamente.' }, { status: 429 });

  const service = getServiceClient();
  if (!service) return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });

  const { data: form } = await service.from('forms').select('id').eq('slug', SEMINAR_SLUG).maybeSingle();
  if (!form) return NextResponse.json({ error: 'Formulário do seminário não encontrado.' }, { status: 404 });

  const { data, error } = await service
    .from('form_submissions')
    .select('id, respondent_name, respondent_phone, answers, created_at')
    .eq('form_id', form.id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Não foi possível carregar as inscrições.' }, { status: 500 });

  const candidates: Candidate[] = [];
  for (const row of data || []) {
    const answers = row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? row.answers as Record<string, unknown>
      : {};
    if (paymentStatus(answers) !== 'paid' || !isPdfMaterial(answers.apostila)) continue;

    const phone = row.respondent_phone || answers.telefone || answers.whatsapp || answers.celular || '';
    const check = validatePhone(phone);
    candidates.push({
      id: row.id,
      name: String(row.respondent_name || answers.nome_completo || 'Não informado'),
      originalPhone: check.original,
      normalizedPhone: check.normalized,
      status: check.status,
      reason: check.reason,
      whatsappExists: null,
    });
  }

  const numbers = [...new Set(candidates.filter((item) => item.normalizedPhone).map((item) => item.normalizedPhone))];
  const provider = await verifyOnWhatsApp(numbers);

  for (const item of candidates) {
    if (!provider || !item.normalizedPhone || item.status === 'invalid') continue;
    const exists = provider.get(item.normalizedPhone);
    if (exists === undefined) continue;
    item.whatsappExists = exists;
    if (!exists) {
      item.status = 'invalid';
      item.reason = 'WhatsApp não confirmou este número como cadastrado.';
    } else if (item.status === 'confirmed') {
      item.reason = 'Formato válido e número confirmado no WhatsApp.';
    }
  }

  const summary = {
    total: candidates.length,
    confirmed: candidates.filter((item) => item.status === 'confirmed').length,
    warnings: candidates.filter((item) => item.status === 'warning').length,
    invalid: candidates.filter((item) => item.status === 'invalid').length,
    whatsappChecked: Boolean(provider),
    readyForBulk: candidates.length > 0 && candidates.every((item) => item.status === 'confirmed'),
  };

  return NextResponse.json({ ok: true, summary, recipients: candidates }, { headers: { 'Cache-Control': 'no-store' } });
}
