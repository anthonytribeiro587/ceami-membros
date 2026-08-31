import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { getServiceClient, requestComesFromSameSite } from '@/lib/server/security';

const SLUG = 'seminario-apocalipse-2026';

function repairOptions(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const result: string[] = [];
  for (const raw of value.map((item) => String(item).trim()).filter(Boolean)) {
    const previous = result[result.length - 1];
    if (/^\d{2}\)\s*$/.test(raw) && previous && /R\$\s*\d+\s*$/.test(previous)) {
      result[result.length - 1] = `${previous},${raw}`;
    } else {
      result.push(raw);
    }
  }
  return result;
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
    .select('id')
    .eq('slug', SLUG)
    .maybeSingle();

  if (formError) return NextResponse.json({ error: formError.message }, { status: 500 });
  if (!form) return NextResponse.json({ ok: true, changed: false });

  const { data: field, error: fieldError } = await service
    .from('form_fields')
    .select('id, field_type, options')
    .eq('form_id', form.id)
    .eq('key', 'apostila')
    .maybeSingle();

  if (fieldError) return NextResponse.json({ error: fieldError.message }, { status: 500 });
  if (!field) return NextResponse.json({ ok: true, changed: false });

  const currentOptions = Array.isArray(field.options) ? field.options.map(String) : [];
  const repairedOptions = repairOptions(currentOptions);
  const changed = field.field_type !== 'select'
    || JSON.stringify(currentOptions) !== JSON.stringify(repairedOptions);

  if (changed) {
    const { error } = await service
      .from('form_fields')
      .update({ field_type: 'select', options: repairedOptions })
      .eq('id', field.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, changed },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
