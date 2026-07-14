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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body?.token ?? '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });

    const memberId = verifyToken(token, serviceRoleKey);
    if (!memberId) return NextResponse.json({ error: 'Sua sessão expirou. Faça a consulta novamente.' }, { status: 401 });

    const payload = {
      phone: String(body.phone || '').trim() || null,
      email: String(body.email || '').trim() || null,
      address: String(body.address || '').trim() || null,
      neighborhood: String(body.neighborhood || '').trim() || null,
      city: String(body.city || '').trim() || null,
      marital_status: String(body.maritalStatus || '').trim() || null,
      spouse_name: String(body.spouseName || '').trim() || null,
      has_children: Boolean(body.hasChildren),
      children_names: String(body.childrenNames || '').trim() || null,
      water_baptized: Boolean(body.waterBaptized),
      holy_spirit_baptized: Boolean(body.holySpiritBaptized),
      fundamentos_fe: Boolean(body.fundamentosFe),
      whatsapp_consent: Boolean(body.whatsappConsent),
      updated_at: new Date().toISOString(),
    };

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
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
