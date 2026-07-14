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

function cleanText(value: unknown, max = 500) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });

    const memberId = verifyToken(String(body?.token ?? ''), key);
    if (!memberId) return NextResponse.json({ error: 'Sua sessão expirou. Faça a consulta novamente.' }, { status: 401 });

    const proposedData = {
      birth_date: /^\d{4}-\d{2}-\d{2}$/.test(String(body.birthDate || '')) ? String(body.birthDate) : null,
      phone: cleanText(body.phone, 30),
      email: cleanText(body.email, 160),
      address: cleanText(body.address, 250),
      neighborhood: cleanText(body.neighborhood, 120),
      city: cleanText(body.city, 120),
      marital_status: cleanText(body.maritalStatus, 50),
      spouse_name: cleanText(body.spouseName, 180),
      has_children: body.hasChildren === '' || body.hasChildren == null ? null : Boolean(body.hasChildren),
      children_names: cleanText(body.childrenNames, 500),
      water_baptized: body.waterBaptized === '' || body.waterBaptized == null ? null : Boolean(body.waterBaptized),
      holy_spirit_baptized: body.holySpiritBaptized === '' || body.holySpiritBaptized == null ? null : Boolean(body.holySpiritBaptized),
      fundamentos_fe: body.fundamentosFe === '' || body.fundamentosFe == null ? null : Boolean(body.fundamentosFe),
      talents: cleanText(body.talents, 1000),
      ministry: Array.isArray(body.ministries)
        ? body.ministries.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 20)
        : [],
      notes: cleanText(body.notes, 1000),
    };

    const hasAnyProposal = Object.values(proposedData).some(value => Array.isArray(value) ? value.length > 0 : value !== null && value !== '');
    if (!hasAnyProposal) return NextResponse.json({ error: 'Informe ao menos um dado para atualização.' }, { status: 400 });

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: existing } = await supabase
      .from('member_update_requests')
      .select('id')
      .eq('member_id', memberId)
      .eq('status', 'pending')
      .maybeSingle();

    const query = existing
      ? supabase.from('member_update_requests').update({ proposed_data: proposedData, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : supabase.from('member_update_requests').insert({ member_id: memberId, proposed_data: proposedData, status: 'pending', source: 'public_lookup' });

    const { error } = await query;
    if (error) {
      console.error('Member update request error:', error.message);
      return NextResponse.json({ error: 'Não foi possível enviar sua solicitação.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pendingReview: true });
  } catch {
    return NextResponse.json({ error: 'Não foi possível enviar sua solicitação.' }, { status: 500 });
  }
}
