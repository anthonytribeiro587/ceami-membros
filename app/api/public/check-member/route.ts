import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const birthDate = String(body?.birthDate ?? '').trim();

    if (name.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return NextResponse.json(
        { found: false, error: 'Informe o nome completo e a data de nascimento.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { found: false, error: 'Consulta temporariamente indisponível.' },
        { status: 503 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const firstWord = name.split(/\s+/)[0];
    const { data, error } = await supabase
      .from('members')
      .select('id, full_name, birth_date, status')
      .eq('birth_date', birthDate)
      .ilike('full_name', `${firstWord}%`)
      .limit(25);

    if (error) {
      console.error('Public member lookup error:', error.message);
      return NextResponse.json(
        { found: false, error: 'Não foi possível consultar agora.' },
        { status: 500 }
      );
    }

    const normalizedName = normalize(name);
    const found = Boolean(
      data?.some((member) => normalize(String(member.full_name)) === normalizedName)
    );

    return NextResponse.json({ found });
  } catch {
    return NextResponse.json(
      { found: false, error: 'Não foi possível consultar agora.' },
      { status: 500 }
    );
  }
}
