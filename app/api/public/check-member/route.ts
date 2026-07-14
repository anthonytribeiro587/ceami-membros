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
  talents: string | null;
  ministry: string | null;
};

type SummaryStatus = 'filled' | 'partial' | 'missing';
type SummaryField = { value: string; status: SummaryStatus };

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
  const inputWords = normalize(input).split(' ').filter(word => word.length > 1);
  const storedWords = normalize(stored).split(' ').filter(word => word.length > 1);
  if (!inputWords.length || !storedWords.length) return 0;
  return inputWords.filter(word => storedWords.some(candidate => candidate === word || candidate.startsWith(word) || word.startsWith(candidate))).length / Math.max(inputWords.length, storedWords.length);
}

function maskName(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] || 'Membro localizado';
  return `${words[0]} ${words.slice(1).map(word => `${word.charAt(0).toUpperCase()}.`).join(' ')}`;
}

function maskPhone(phone: string | null): SummaryField {
  const digits = onlyDigits(phone || '');
  return digits.length >= 4
    ? { value: `Cadastrado • final ${digits.slice(-4)}`, status: 'filled' }
    : { value: 'Não informado', status: 'missing' };
}

function maskEmail(email: string | null): SummaryField {
  const clean = String(email || '').trim();
  const [local, domain] = clean.split('@');
  return local && domain
    ? { value: `${local.charAt(0)}***@${domain}`, status: 'filled' }
    : { value: 'Não informado', status: 'missing' };
}

function booleanSummary(value: boolean | null): SummaryField {
  if (value == null) return { value: 'Não informado', status: 'missing' };
  return { value: value ? 'Sim' : 'Não', status: 'filled' };
}

function addressSummary(member: MemberCandidate): SummaryField {
  const fields = [member.address, member.neighborhood, member.city];
  const completed = fields.filter(value => String(value || '').trim()).length;
  if (completed === 0) return { value: 'Não informado', status: 'missing' };
  if (completed === fields.length) return { value: 'Completo', status: 'filled' };
  const missing = ['endereço', 'bairro', 'cidade'].filter((_, index) => !String(fields[index] || '').trim());
  return { value: `Incompleto • falta ${missing.join(' e ')}`, status: 'partial' };
}

function familySummary(member: MemberCandidate): SummaryField {
  const parts: string[] = [];
  if (member.marital_status) parts.push(member.marital_status);
  if (member.spouse_name) parts.push('cônjuge cadastrado');
  if (member.has_children === false) parts.push('sem filhos');
  if (member.has_children === true) {
    const count = String(member.children_names || '').split(/\n|,|;/).map(item => item.trim()).filter(Boolean).length;
    parts.push(count > 0 ? `${count} ${count === 1 ? 'filho cadastrado' : 'filhos cadastrados'}` : 'filhos informados');
  }
  return parts.length
    ? { value: parts.join(' • '), status: 'filled' }
    : { value: 'Não informado', status: 'missing' };
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
      return NextResponse.json({ found: false, error: 'Informe seu nome e a data de nascimento. WhatsApp ou e-mail podem ser usados como alternativa.' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ found: false, error: 'Consulta temporariamente indisponível.' }, { status: 503 });

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data, error }, { data: departments }] = await Promise.all([
      supabase.from('members').select('id, full_name, birth_date, phone, email, address, neighborhood, city, marital_status, spouse_name, has_children, children_names, water_baptized, holy_spirit_baptized, fundamentos_fe, talents, ministry').limit(500),
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
      const abbreviatedMatch = abbreviatedNameMatches(name, member.full_name);
      const uniqueContact = (phoneMatchesMember && phoneMatches === 1) || (emailMatchesMember && emailMatches === 1);
      const birthAndNameMatch = Boolean(birthMatches && abbreviatedMatch);
      return { member, confirmations, exactName, abbreviatedMatch, uniqueContact, birthAndNameMatch, score: nameScore(name, member.full_name) };
    }).filter(item => item.confirmations > 0 && (
      item.exactName || item.birthAndNameMatch || (item.uniqueContact && item.abbreviatedMatch) || (item.confirmations >= 2 && item.score >= 0.65)
    )).sort((a, b) =>
      Number(b.exactName) - Number(a.exactName) || Number(b.birthAndNameMatch) - Number(a.birthAndNameMatch) || Number(b.uniqueContact) - Number(a.uniqueContact) || b.confirmations - a.confirmations || b.score - a.score
    );

    const best = candidates[0];
    const second = candidates[1];
    if (!best || (second && best.exactName === second.exactName && best.birthAndNameMatch === second.birthAndNameMatch && best.uniqueContact === second.uniqueContact && best.confirmations === second.confirmations)) {
      return NextResponse.json({ found: false });
    }

    const ministryOptions = Array.from(new Set((departments || [])
      .map(item => String(item.name || '').trim())
      .filter(nameValue => nameValue && !HIDDEN_DEPARTMENTS.has(nameValue.toLocaleLowerCase('pt-BR')))));

    const { data: links } = await supabase
      .from('member_functions')
      .select('ministry_functions(ministry_areas(departments(name)))')
      .eq('member_id', best.member.id)
      .eq('active', true);

    const importedMinistries = ((links || []) as any[])
      .map(link => link?.ministry_functions?.ministry_areas?.departments?.name)
      .filter(Boolean)
      .map(String);
    const manualMinistries = String(best.member.ministry || '').split(',').map(item => item.trim()).filter(Boolean);
    const currentMinistries = Array.from(new Set([...importedMinistries, ...manualMinistries]));

    const summary: Record<string, SummaryField> = {
      birthDate: best.member.birth_date ? { value: 'Cadastrada', status: 'filled' } : { value: 'Não informada', status: 'missing' },
      phone: maskPhone(best.member.phone),
      email: maskEmail(best.member.email),
      address: addressSummary(best.member),
      family: familySummary(best.member),
      waterBaptized: booleanSummary(best.member.water_baptized),
      holySpiritBaptized: booleanSummary(best.member.holy_spirit_baptized),
      fundamentosFe: booleanSummary(best.member.fundamentos_fe),
      talents: best.member.talents ? { value: 'Preenchido', status: 'filled' } : { value: 'Não informado', status: 'missing' },
      ministries: currentMinistries.length ? { value: currentMinistries.join(', '), status: 'filled' } : { value: 'Nenhum informado', status: 'missing' },
    };

    return NextResponse.json({
      found: true,
      token: sign(best.member.id, key),
      ministryOptions,
      currentMinistries,
      member: { displayName: maskName(best.member.full_name), summary },
    });
  } catch (error) {
    console.error('Public member lookup error:', error);
    return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
  }
}
