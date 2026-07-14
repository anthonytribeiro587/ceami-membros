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
  const matched = inputWords.filter(word => storedWords.some(candidate => candidate === word || candidate.startsWith(word) || word.startsWith(candidate))).length;
  return matched / Math.max(inputWords.length, storedWords.length);
}

function sign(memberId: string, secret: string) {
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const payload = `${memberId}.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

function isBlank(value: unknown) {
  return value == null || String(value).trim() === '';
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
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (name.length < 5 || (!validBirthDate && !validPhone && !validEmail)) {
      return NextResponse.json(
        { found: false, error: 'Informe seu nome completo e pelo menos uma confirmação: nascimento, telefone ou e-mail.' },
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
      .select('id, full_name, birth_date, phone, email, address, neighborhood, city, marital_status, spouse_name')
      .limit(500);

    if (error) {
      console.error('Public member lookup error:', error.message);
      return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
    }

    const normalizedInputName = normalize(name);
    const candidates = ((data || []) as MemberCandidate[])
      .map(member => {
        const confirmationMatches = [
          validBirthDate && member.birth_date === birthDate,
          validPhone && onlyDigits(member.phone || '') === onlyDigits(phone),
          validEmail && String(member.email || '').trim().toLowerCase() === email,
        ].filter(Boolean).length;
        const exactName = normalize(member.full_name) === normalizedInputName;
        return { member, confirmationMatches, exactName, score: nameScore(name, member.full_name) };
      })
      .filter(candidate =>
        candidate.confirmationMatches > 0 &&
        (candidate.exactName || (candidate.confirmationMatches >= 2 && candidate.score >= 0.65)),
      )
      .sort((a, b) => Number(b.exactName) - Number(a.exactName) || b.confirmationMatches - a.confirmationMatches || b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];
    if (!best || (second && best.exactName === second.exactName && best.confirmationMatches === second.confirmationMatches)) {
      return NextResponse.json({ found: false });
    }

    const member = best.member;
    return NextResponse.json({
      found: true,
      token: sign(member.id, serviceRoleKey),
      member: {
        fullName: member.full_name,
        missing: {
          birthDate: isBlank(member.birth_date),
          phone: isBlank(member.phone),
          email: isBlank(member.email),
          address: isBlank(member.address),
          neighborhood: isBlank(member.neighborhood),
          city: isBlank(member.city),
          maritalStatus: isBlank(member.marital_status),
          spouseName: isBlank(member.spouse_name),
        },
      },
    });
  } catch {
    return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
  }
}
