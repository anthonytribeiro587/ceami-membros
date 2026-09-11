import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TOKEN = 'missing-pdf-list-2026-09-11';
const SEMINAR_SLUG = 'seminario-apocalipse-2026';

function text(v: unknown) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function material(v: unknown) {
  const s = text(v);
  if (s.includes('pdf') || s.includes('digital')) return 'PDF';
  if (s.includes('fisic')) return 'Física';
  return '';
}
function paymentStatus(a: Record<string, unknown>) {
  const p = a.__payment;
  return p && typeof p === 'object' && !Array.isArray(p)
    ? String((p as Record<string, unknown>).status || '')
    : '';
}
function alreadyDelivered(a: Record<string, unknown>) {
  const d = a.__seminar_pdf_delivery;
  return !!d && typeof d === 'object' && !Array.isArray(d) && String((d as Record<string, unknown>).status || '') === 'sent';
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const service = getServiceClient();
  if (!service) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const { data: form } = await service.from('forms').select('id').eq('slug', SEMINAR_SLUG).maybeSingle();
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const { data, error } = await service
    .from('form_submissions')
    .select('id, respondent_name, respondent_phone, answers, created_at')
    .eq('form_id', form.id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [] as Array<{name:string; phone:string; material:string}>;
  let alreadySent = 0;
  for (const row of data || []) {
    const a = row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? row.answers as Record<string, unknown>
      : {};
    const m = material(a.apostila);
    if (paymentStatus(a) !== 'paid' || !m) continue;
    if (alreadyDelivered(a)) { alreadySent++; continue; }
    rows.push({
      name: String(row.respondent_name || a.nome_completo || 'Não informado'),
      phone: String(row.respondent_phone || a.telefone || a.whatsapp || a.celular || ''),
      material: m,
    });
  }

  return NextResponse.json({ ok: true, count: rows.length, alreadySent, rows }, { headers: { 'Cache-Control': 'no-store' } });
}
