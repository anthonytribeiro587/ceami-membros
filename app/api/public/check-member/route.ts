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
};

const HIDDEN_DEPARTMENTS = new Set(['comunicação', 'diaconato', 'dança', 'liderança', 'técnica']);

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function onlyDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
}

function abbreviatedNameMatches(input: string, stored: string) {
  const inputWords = normalize(input).split(' ').filter(word => word.length > 1);
  const storedWords = normalize(stored).split(' ').filter(word => word.length > 1);
  return inputWords.length > 0 && inputWords.every(word => storedWords.some(candidate => candidate === word || candidate.startsWith(word) || word.startsWith(candidate)));
}

function nameScore(input: string, stored: string) {
  const a = normalize(input).split(' ').filter(word => word.length > 1);
  const b = normalize(stored).split(' ').filter(word => word.length > 1);
  if (!a.length || !b.length) return 0;
  return a.filter(word => b.some(candidate => candidate === word || candidate.startsWith(word) || word.startsWith(candidate))).length / Math.max(a.length, b.length);
}

function maskName(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] || 'Membro localizado';
  return `${words[0]} ${words.slice(1).map(word => `${word.charAt(0).toUpperCase()}.`).join(' ')}`;
}

function sign(memberId: string, secret: string) {
  const expiresAt = Date.now() + 20 * 60 * 1000;
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
    const normalizedPhone = onlyDigits(phone);
    const validPhone = normalizedPhone.length >= 8;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (name.length < 3 || (!validBirthDate && !validPhone && !validEmail)) {
      return NextResponse.json({ found: false, error: 'Informe seu nome e pelo menos uma confirmação: nascimento, telefone ou e-mail.' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ found: false, error: 'Consulta temporariamente indisponível.' }, { status: 503 });

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data, error }, { data: departments }] = await Promise.all([
      supabase.from('members').select('id, full_name, birth_date, phone, email').limit(500),
      supabase.from('departments').select('name').order('name', { ascending: true }),
    ]);
    if (error) return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });

    const members = (data || []) as MemberCandidate[];
    const phoneMatches = validPhone ? members.filter(member => onlyDigits(member.phone || '') === normalizedPhone).length : 0;
    const emailMatches = validEmail ? members.filter(member => String(member.email || '').trim().toLowerCase() === email).length : 0;
    const normalizedName = normalize(name);

    const candidates = members.map(member => {
      const birthMatches = validBirthDate && member.birth_date === birthDate;
      const phoneMatchesMember = validPhone && onlyDigits(member.phone || '') === normalizedPhone;
      const emailMatchesMember = validEmail && String(member.email || '').trim().toLowerCase() === email;
      const confirmations = [birthMatches, phoneMatchesMember, emailMatchesMember].filter(Boolean).length;
      const exactName = normalize(member.full_name) === normalizedName;
      const uniqueContact = (phoneMatchesMember && phoneMatches === 1) || (emailMatchesMember && emailMatches === 1);
      return { member, confirmations, exactName, uniqueContact, abbreviatedMatch: abbreviatedNameMatches(name, member.full_name), score: nameScore(name, member.full_name) };
    }).filter(item => item.confirmations > 0 && (item.exactName || (item.uniqueContact && item.abbreviatedMatch) || (item.confirmations >= 2 && item.score >= 0.65)))
      .sort((a, b) => Number(b.exactName) - Number(a.exactName) || Number(b.uniqueContact) - Number(a.uniqueContact) || b.confirmations - a.confirmations || b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];
    if (!best || (second && best.exactName === second.exactName && best.uniqueContact === second.uniqueContact && best.confirmations === second.confirmations)) {
      return NextResponse.json({ found: false });
    }

    const ministryOptions = Array.from(new Set((departments || [])
      .map(item => String(item.name || '').trim())
      .filter(nameValue => nameValue && !HIDDEN_DEPARTMENTS.has(nameValue.toLocaleLowerCase('pt-BR')))));

    return NextResponse.json({
      found: true,
      token: sign(best.member.id, key),
      ministryOptions,
      member: { displayName: maskName(best.member.full_name) },
    });
  } catch {
    return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
  }
}
