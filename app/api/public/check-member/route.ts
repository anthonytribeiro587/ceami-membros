import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type MemberCandidate = {
  id: string;
  full_name: string;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  marital_status: string | null;
  spouse_name: string | null;
  has_children: boolean | null;
  children_names: string | null;
  water_baptized: boolean | null;
  holy_spirit_baptized: boolean | null;
  fundamentos_fe: boolean | null;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function onlyDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
}

function nameScore(input: string, stored: string) {
  const inputWords = normalize(input).split(' ').filter(word => word.length > 1);
  const storedWords = normalize(stored).split(' ').filter(word => word.length > 1);
  if (!inputWords.length || !storedWords.length) return 0;

  const exact = inputWords.filter(word => storedWords.includes(word)).length;
  const partial = inputWords.filter(word => storedWords.some(candidate => candidate.startsWith(word) || word.startsWith(candidate))).length;
  return Math.max(exact / inputWords.length, partial / inputWords.length * 0.9);
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
    const phone = String(body?.phone ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();

    const validBirthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
    const validPhone = onlyDigits(phone).length >= 8;
    const validEmail = email.includes('@') && email.includes('.');

    if (name.length < 3 || (!validBirthDate && !validPhone && !validEmail)) {
      return NextResponse.json(
        { found: false, error: 'Informe seu nome e pelo menos uma confirmação: nascimento, telefone ou e-mail.' },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ found: false, error: 'Consulta temporariamente indisponível.' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('members')
      .select('id, full_name, birth_date, phone, email, address, neighborhood, city, marital_status, spouse_name, has_children, children_names, water_baptized, holy_spirit_baptized, fundamentos_fe')
      .limit(500);

    if (error) {
      console.error('Public member lookup error:', error.message);
      return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
    }

    const candidates = ((data || []) as MemberCandidate[])
      .map(member => {
        const confirmationMatches = [
          validBirthDate && member.birth_date === birthDate,
          validPhone && onlyDigits(member.phone || '') === onlyDigits(phone),
          validEmail && String(member.email || '').trim().toLowerCase() === email,
        ].filter(Boolean).length;

        return {
          member,
          confirmationMatches,
          score: nameScore(name, member.full_name),
        };
      })
      .filter(candidate => candidate.confirmationMatches > 0 && candidate.score >= 0.55)
      .sort((a, b) => b.confirmationMatches - a.confirmationMatches || b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];
    if (!best || (second && best.confirmationMatches === second.confirmationMatches && Math.abs(best.score - second.score) < 0.08)) {
      return NextResponse.json({ found: false });
    }

    const member = best.member;
    return NextResponse.json({
      found: true,
      token: sign(member.id, serviceRoleKey),
      member: {
        fullName: member.full_name || '',
        birthDate: member.birth_date || '',
        phone: member.phone || '',
        email: member.email || '',
        address: member.address || '',
        neighborhood: member.neighborhood || '',
        city: member.city || '',
        maritalStatus: member.marital_status || '',
        spouseName: member.spouse_name || '',
        hasChildren: Boolean(member.has_children),
        childrenNames: member.children_names || '',
        waterBaptized: Boolean(member.water_baptized),
        holySpiritBaptized: Boolean(member.holy_spirit_baptized),
        fundamentosFe: Boolean(member.fundamentos_fe),
      },
    });
  } catch {
    return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
  }
}
