import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validMonth(value: string) {
  return /^2026-(0[1-9]|1[0-2])$/.test(value);
}

function validDate(value: string) {
  if (!/^2026-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const month = request.nextUrl.searchParams.get('month') || '2026-01';
  if (!validMonth(month)) {
    return NextResponse.json({ error: 'Mês inválido.' }, { status: 400 });
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);

  const { data, error } = await service
    .from('reading_plan_entries')
    .select('reading_date,reference')
    .gte('reading_date', `${month}-01`)
    .lt('reading_date', `${nextMonth}-01`)
    .order('reading_date', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar o plano.', details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ month, entries: data || [] });
}

export async function PATCH(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  try {
    const body = await readLimitedJson<{ date?: string; reference?: string }>(request, 4_000);
    const date = String(body.date || '').trim();
    const reference = String(body.reference || '').trim();

    if (!validDate(date)) {
      return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });
    }
    if (reference.length < 2 || reference.length > 180) {
      return NextResponse.json(
        { error: 'A leitura precisa ter entre 2 e 180 caracteres.' },
        { status: 400 },
      );
    }

    const { data, error } = await service
      .from('reading_plan_entries')
      .upsert(
        {
          reading_date: date,
          reference,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'reading_date' },
      )
      .select('reading_date,reference')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, entry: data });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
