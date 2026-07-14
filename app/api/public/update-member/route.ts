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
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return memberId;
  } catch { return null; }
}
function blank(value: unknown) { return value == null || String(value).trim() === ''; }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
    const memberId = verifyToken(String(body?.token ?? ''), key);
    if (!memberId) return NextResponse.json({ error: 'Sua sessão expirou. Faça a consulta novamente.' }, { status: 401 });

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: current, error: readError } = await supabase.from('members').select('*').eq('id', memberId).single();
    if (readError || !current) return NextResponse.json({ error: 'Cadastro não localizado.' }, { status: 404 });

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fillIfBlank = (column: string, value: unknown) => { if (blank(current[column]) && !blank(value)) payload[column] = String(value).trim(); };
    fillIfBlank('birth_date', body.birthDate);
    fillIfBlank('phone', body.phone);
    fillIfBlank('email', body.email);
    fillIfBlank('address', body.address);
    fillIfBlank('neighborhood', body.neighborhood);
    fillIfBlank('city', body.city);
    fillIfBlank('marital_status', body.maritalStatus);
    fillIfBlank('spouse_name', body.spouseName);

    payload.has_children = Boolean(body.hasChildren);
    payload.children_names = Boolean(body.hasChildren) ? String(body.childrenNames || '').trim() || null : null;
    payload.water_baptized = Boolean(body.waterBaptized);
    payload.holy_spirit_baptized = Boolean(body.holySpiritBaptized);
    payload.fundamentos_fe = Boolean(body.fundamentosFe);
    payload.talents = String(body.talents || '').trim() || null;
    payload.ministry = String(body.ministry || '').trim() || current.ministry || null;
    if (payload.phone || current.phone) payload.whatsapp_consent = true;

    const { error } = await supabase.from('members').update(payload).eq('id', memberId);
    if (error) return NextResponse.json({ error: 'Não foi possível salvar sua atualização.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar sua atualização.' }, { status: 500 });
  }
}
