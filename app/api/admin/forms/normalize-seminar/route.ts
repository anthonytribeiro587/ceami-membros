import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getServiceClient, requestComesFromSameSite } from '@/lib/server/security';

const SLUG = 'seminario-apocalipse-2026';
const PHYSICAL = 'Sim — Física (R$ 35,00)';
const PDF = 'Sim — PDF (R$ 10,00)';
const NONE = 'Não — Sem custo';
const OPTIONS = [PHYSICAL, PDF, NONE];

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function canonicalChoice(value: unknown) {
  const normalized = normalize(value);
  if (!normalized) return '';
  if (normalized === 'sim' || normalized.includes('fisica')) return PHYSICAL;
  if (normalized.includes('pdf')) return PDF;
  if (normalized === 'nao' || normalized.includes('sem custo') || normalized.includes('nao quero')) return NONE;
  return String(value);
}

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  }

  const role = await getCurrentUiRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
  }

  const { data: form, error: formError } = await service
    .from('forms')
    .select('id, price')
    .eq('slug', SLUG)
    .maybeSingle();

  if (formError) return NextResponse.json({ error: formError.message }, { status: 500 });
  if (!form) return NextResponse.json({ ok: true, changed: false });

  let changed = false;

  if (form.price !== null) {
    const { error } = await service.from('forms').update({ price: null }).eq('id', form.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    changed = true;
  }

  const { data: field, error: fieldError } = await service
    .from('form_fields')
    .select('id, field_type, options')
    .eq('form_id', form.id)
    .eq('key', 'apostila')
    .maybeSingle();

  if (fieldError) return NextResponse.json({ error: fieldError.message }, { status: 500 });

  const currentOptions = Array.isArray(field?.options) ? field.options.map(String) : [];
  const fieldNeedsUpdate = Boolean(field) && (
    field?.field_type !== 'select'
    || JSON.stringify(currentOptions) !== JSON.stringify(OPTIONS)
  );

  if (field && fieldNeedsUpdate) {
    const { error } = await service
      .from('form_fields')
      .update({ field_type: 'select', options: OPTIONS })
      .eq('id', field.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    changed = true;
  }

  const { data: submissions, error: submissionsError } = await service
    .from('form_submissions')
    .select('id, answers')
    .eq('form_id', form.id);

  if (submissionsError) return NextResponse.json({ error: submissionsError.message }, { status: 500 });

  for (const submission of submissions || []) {
    const answers = submission.answers && typeof submission.answers === 'object' && !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};
    const current = String(answers.apostila ?? '');
    const canonical = canonicalChoice(current);
    if (!canonical || canonical === current) continue;

    const { error } = await service
      .from('form_submissions')
      .update({ answers: { ...answers, apostila: canonical } })
      .eq('id', submission.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    changed = true;
  }

  return NextResponse.json(
    { ok: true, changed },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
