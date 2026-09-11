import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getEvolutionConnectionState } from '@/lib/server/evolution-guard';
import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';
import { consumeRateLimit, getServiceClient, requestComesFromSameSite } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SEMINAR_SLUG = 'seminario-apocalipse-2026';
const TEST_PHONE = '5551995092781';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_RECIPIENTS = 80;
const EXPECTED_FILE_NAME = 'O FIM PERTENCE A CRISTO.pdf';

type Recipient = { id: string; name: string; phone: string };

function normalizeText(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function phoneLooksValid(value: unknown) {
  const digits = normalizeBrazilPhone(value);
  if (!digits.startsWith('55')) return false;
  const national = digits.slice(2);
  if (national.length !== 11) return false;
  const ddd = Number(national.slice(0, 2));
  if (!Number.isInteger(ddd) || ddd < 11 || ddd > 99) return false;
  return national.slice(2).startsWith('9');
}

function readEnvelope(payload: unknown) {
  const data = (payload || {}) as Record<string, unknown>;
  const response = data.response && typeof data.response === 'object' ? data.response as Record<string, unknown> : data;
  const nestedMessage = response.message && typeof response.message === 'object' ? response.message as Record<string, unknown> : null;
  const responseKey = response.key && typeof response.key === 'object' ? response.key as Record<string, unknown> : null;
  const messageKey = nestedMessage?.key && typeof nestedMessage.key === 'object' ? nestedMessage.key as Record<string, unknown> : null;
  const dataNode = data.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : null;
  const dataKey = dataNode?.key && typeof dataNode.key === 'object' ? dataNode.key as Record<string, unknown> : null;
  const key = responseKey || messageKey || dataKey || {};
  return {
    id: String(key.id || ''),
    remoteJid: String(key.remoteJid || ''),
    status: String(response.status || nestedMessage?.status || dataNode?.status || data.status || 'UNKNOWN').toUpperCase(),
  };
}

function acceptedBrazilJids(phone: string) {
  const variants = new Set<string>([`${phone}@s.whatsapp.net`]);
  if (phone.startsWith('55') && phone.length === 13 && phone.charAt(4) === '9') {
    variants.add(`${phone.slice(0, 4)}${phone.slice(5)}@s.whatsapp.net`);
  }
  return variants;
}

async function sendMirrorCopy(input: { media: string; recipient: Recipient; index: number; total: number }) {
  const config = getEvolutionConfig();
  const response = await fetch(`${config.apiUrl}/message/sendMedia/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({
      number: TEST_PHONE,
      mediatype: 'document',
      mimetype: 'application/pdf',
      caption: `🧪 TESTE ESPELHO ${input.index}/${input.total}\nDestinatário real: ${input.recipient.name}\nWhatsApp cadastrado: ${input.recipient.phone}\n\nOlá! Segue a apostila digital do Seminário O Fim Pertence a Cristo. 🙏`,
      media: input.media,
      fileName: EXPECTED_FILE_NAME,
      delay: 600,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let payload: unknown = { raw: text.slice(0, 800) };
  try { payload = JSON.parse(text) as unknown; } catch { /* resposta não JSON */ }
  const envelope = readEnvelope(payload);
  const rejected = ['ERROR', 'FAILED', 'CANCELED', 'CANCELLED'].includes(envelope.status);
  const destinationOk = !envelope.remoteJid || acceptedBrazilJids(TEST_PHONE).has(envelope.remoteJid);
  return response.ok && Boolean(envelope.id) && destinationOk && !rejected;
}

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const role = await getCurrentUiRole();
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });

  const allowed = await consumeRateLimit(request, 'seminar_pdf_bulk_mirror_test', 600, 1);
  if (!allowed) return NextResponse.json({ error: 'O teste geral já foi executado recentemente. Aguarde alguns minutos.' }, { status: 429 });

  const connection = await getEvolutionConnectionState();
  if (!connection.open) return NextResponse.json({ error: 'O WhatsApp da CEAMI não está conectado.' }, { status: 409 });

  const config = getEvolutionConfig();
  if (!evolutionConfigured(config)) return NextResponse.json({ error: 'Evolution API não configurada.' }, { status: 503 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Selecione o PDF do seminário.' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'O PDF deve ter no máximo 8 MB.' }, { status: 400 });
  }

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

  const recipients: Recipient[] = [];
  const blocked: string[] = [];
  for (const row of data || []) {
    const answers = row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? row.answers as Record<string, unknown>
      : {};
    if (paymentStatus(answers) !== 'paid' || !isPdfMaterial(answers.apostila)) continue;
    const rawPhone = row.respondent_phone || answers.telefone || answers.whatsapp || answers.celular || '';
    const name = String(row.respondent_name || answers.nome_completo || 'Não informado');
    if (!phoneLooksValid(rawPhone)) {
      blocked.push(name);
      continue;
    }
    recipients.push({ id: row.id, name, phone: normalizeBrazilPhone(rawPhone) });
  }

  if (blocked.length) {
    return NextResponse.json({ error: `Existem ${blocked.length} número(s) para revisar antes do teste geral.`, blocked }, { status: 409 });
  }
  if (!recipients.length) return NextResponse.json({ error: 'Nenhum inscrito pago com apostila PDF foi encontrado.' }, { status: 409 });
  if (recipients.length > MAX_RECIPIENTS) return NextResponse.json({ error: `Há ${recipients.length} destinatários. O teste espelho suporta até ${MAX_RECIPIENTS} por vez.` }, { status: 409 });

  const media = Buffer.from(await file.arrayBuffer()).toString('base64');
  let sent = 0;
  const failed: string[] = [];

  for (let i = 0; i < recipients.length; i += 1) {
    try {
      const ok = await sendMirrorCopy({ media, recipient: recipients[i], index: i + 1, total: recipients.length });
      if (ok) sent += 1;
      else failed.push(recipients[i].name);
    } catch {
      failed.push(recipients[i].name);
    }
  }

  if (failed.length) {
    return NextResponse.json({
      error: `O teste espelho enviou ${sent} de ${recipients.length} cópias. ${failed.length} falharam.`,
      sent,
      total: recipients.length,
      failed,
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sent,
    total: recipients.length,
    destination: '(51) 99509-2781',
    recipients: recipients.map(({ name, phone }) => ({ name, phone })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
