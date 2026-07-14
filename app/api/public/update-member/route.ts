import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function verifyToken(token: string, secret: string) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [memberId, expiresText, signature] = decoded.split('.');
    const expiresAt = Number(expiresText);
    if (!memberId || !expiresAt || !signature || Date.now() > expiresAt) return null;
    const expected = createHmac('sha256', secret).update(`${memberId}.${expiresAt}`).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return memberId;
  } catch {
    return null;
  }
}

function isBlank(value: unknown) {
  return value == null || String(value).trim() === '';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body?.token ?? '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
    }

    const memberId = verifyToken(token, serviceRoleKey);
    if (!memberId) {
      return NextResponse.json({ error: 'Sua sessão expirou. Faça a consulta novamente.' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: current, error: readError } = await supabase
      .from('members')
      .select('birth_date, phone, email, address, neighborhood, city, marital_status, spouse_name')
      .eq('id', memberId)
      .single();

    if (readError || !current) {
      return NextResponse.json({ error: 'Cadastro não localizado.' }, { status: 404 });
    }

    const payload: Record<string, string | boolean | null> = {};
    const birthDate = String(body.birthDate || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    const address = String(body.address || '').trim();
    const neighborhood = String(body.neighborhood || '').trim();
    const city = String(body.city || '').trim();
    const maritalStatus = String(body.maritalStatus || '').trim();
    const spouseName = String(body.spouseName || '').trim();

    if (isBlank(current.birth_date) && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) payload.birth_date = birthDate;
    if (isBlank(current.phone) && phone) {
      payload.phone = phone;
      payload.whatsapp_consent = true;
    }
    if (isBlank(current.email) && email) payload.email = email;
    if (isBlank(current.address) && address) payload.address = address;
    if (isBlank(current.neighborhood) && neighborhood) payload.neighborhood = neighborhood;
    if (isBlank(current.city) && city) payload.city = city;
    if (isBlank(current.marital_status) && maritalStatus) payload.marital_status = maritalStatus;
    if (isBlank(current.spouse_name) && spouseName) payload.spouse_name = spouseName;

    if (!Object.keys(payload).length) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    payload.updated_at = new Date().toISOString();
    const { error } = await supabase.from('members').update(payload).eq('id', memberId);
    if (error) {
      console.error('Public member update error:', error.message);
      return NextResponse.json({ error: 'Não foi possível salvar sua atualização.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar sua atualização.' }, { status: 500 });
  }
}
