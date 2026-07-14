import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function sign(memberId: string, secret: string) {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = `${memberId}.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.name ?? '').trim();
    const birthDate = String(body?.birthDate ?? '').trim();

    if (name.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return NextResponse.json({ found: false, error: 'Informe o nome completo e a data de nascimento.' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ found: false, error: 'Consulta temporariamente indisponível.' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const firstWord = name.split(/\s+/)[0];
    const { data, error } = await supabase
      .from('members')
      .select('id, full_name, birth_date, phone, email, address, neighborhood, city, marital_status, spouse_name, has_children, children_names, water_baptized, holy_spirit_baptized, fundamentos_fe, whatsapp_consent')
      .eq('birth_date', birthDate)
      .ilike('full_name', `${firstWord}%`)
      .limit(25);

    if (error) {
      console.error('Public member lookup error:', error.message);
      return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
    }

    const normalizedName = normalize(name);
    const member = data?.find(item => normalize(String(item.full_name)) === normalizedName);
    if (!member) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      token: sign(String(member.id), serviceRoleKey),
      member: {
        fullName: member.full_name || '', birthDate: member.birth_date || '', phone: member.phone || '', email: member.email || '',
        address: member.address || '', neighborhood: member.neighborhood || '', city: member.city || '', maritalStatus: member.marital_status || '',
        spouseName: member.spouse_name || '', hasChildren: Boolean(member.has_children), childrenNames: member.children_names || '',
        waterBaptized: Boolean(member.water_baptized), holySpiritBaptized: Boolean(member.holy_spirit_baptized),
        fundamentosFe: Boolean(member.fundamentos_fe), whatsappConsent: member.whatsapp_consent !== false,
      },
    });
  } catch {
    return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
  }
}
