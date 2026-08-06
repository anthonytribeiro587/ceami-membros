import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  consumeRateLimit,
  getSecuritySecret,
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  status: string | null;
};

type SummaryStatus = 'filled' | 'partial' | 'missing';
type SummaryField = { value: string; status: SummaryStatus };
type LookupBody = Record<string, unknown>;

const HIDDEN_DEPARTMENTS = new Set(['comunicação', 'diaconato', 'dança', 'liderança', 'técnica']);

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function onlyDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
}

function memberNameMatches(fullName: string, lookupName: string) {
  const normalizedFullName = normalize(fullName);
  if (!normalizedFullName || !lookupName) return false;
  if (normalizedFullName === lookupName) return true;

  const lookupWords = lookupName.split(' ').filter(Boolean);
  const memberWords = normalizedFullName.split(' ').filter(Boolean);

  if (lookupWords.length === 1) return memberWords[0] === lookupWords[0];
  return memberWords.slice(0, lookupWords.length).join(' ') === lookupName;
}

function normalizeDateInput(value: string) {
  const raw = value.trim();
  let iso = '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    iso = raw;
  } else {
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!br) return '';
    iso = `${br[3]}-${br[2]}-${br[1]}`;
  }

  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return '';
  return iso;
}

function formatDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Não informado';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function textSummary(value: string | null, empty = 'Não informado'): SummaryField {
  const clean = String(value || '').trim();
  return clean ? { value: clean, status: 'filled' } : { value: empty, status: 'missing' };
}

function booleanSummary(value: boolean | null): SummaryField {
  if (value == null) return { value: 'Não informado', status: 'missing' };
  return { value: value ? 'Sim' : 'Não', status: 'filled' };
}

function addressSummary(member: MemberCandidate): SummaryField {
  const pieces = [member.address, member.neighborhood, member.city]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!pieces.length) return { value: 'Não informado', status: 'missing' };
  const completed = [member.address, member.neighborhood, member.city].filter((value) => String(value || '').trim()).length;
  return { value: pieces.join(' • '), status: completed === 3 ? 'filled' : 'partial' };
}

function familySummary(member: MemberCandidate): SummaryField {
  const parts: string[] = [];
  if (member.marital_status) parts.push(member.marital_status);
  if (member.spouse_name) parts.push(`Cônjuge: ${member.spouse_name}`);
  if (member.has_children === false) parts.push('Sem filhos');
  if (member.has_children === true) {
    const children = String(member.children_names || '').trim();
    parts.push(children ? `Filhos: ${children.replace(/\n+/g, ', ')}` : 'Tem filhos');
  }
  return parts.length ? { value: parts.join(' • '), status: 'filled' } : { value: 'Não informado', status: 'missing' };
}

function sign(memberId: string, secret: string) {
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const payload = `${memberId}.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

export async function POST(request: NextRequest) {
  try {
    if (!requestComesFromSameSite(request)) {
      return NextResponse.json({ found: false, error: 'Origem da solicitação não permitida.' }, { status: 403 });
    }

    const allowed = await consumeRateLimit(request, 'member-lookup', 15 * 60, 8);
    if (!allowed) {
      return NextResponse.json(
        { found: false, error: 'Muitas consultas. Aguarde alguns minutos.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const body = await readLimitedJson<LookupBody>(request, 8_000);
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
    const birthDateInput = String(body.birthDate ?? '').trim();
    const phone = String(body.phone ?? '').trim().slice(0, 30);
    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 160);
    const normalizedName = normalize(name);
    const normalizedPhone = onlyDigits(phone);
    const birthDate = normalizeDateInput(birthDateInput);
    const validBirthDate = Boolean(birthDate);
    const validPhone = normalizedPhone.length >= 10;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (normalizedName.length < 3 || (!validBirthDate && !validPhone && !validEmail)) {
      return NextResponse.json(
        { found: false, error: 'Informe seu nome e uma data de nascimento válida, WhatsApp ou e-mail.' },
        { status: 400 },
      );
    }

    const identity = `${normalizedName}|${birthDate}|${validPhone ? normalizedPhone : ''}|${validEmail ? email : ''}`;
    const identityAllowed = await consumeRateLimit(request, 'member-lookup-identity', 60 * 60, 5, identity);
    if (!identityAllowed) {
      return NextResponse.json(
        { found: false, error: 'Limite de consultas para estes dados atingido. Tente mais tarde.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    const service = getServiceClient();
    const signingSecret = await getSecuritySecret('public_lookup_signing');
    if (!service || !signingSecret) {
      return NextResponse.json({ found: false, error: 'Consulta temporariamente indisponível.' }, { status: 503 });
    }

    const [{ data, error }, { data: departments }] = await Promise.all([
      service.from('members').select('id, full_name, birth_date, phone, email, address, neighborhood, city, marital_status, spouse_name, has_children, children_names, water_baptized, holy_spirit_baptized, fundamentos_fe, talents, ministry, status').limit(2000),
      service.from('departments').select('name').order('name', { ascending: true }),
    ]);

    if (error) {
      console.error('Public member lookup failed:', error.message);
      return NextResponse.json({ found: false, error: 'Não foi possível consultar agora.' }, { status: 500 });
    }

    const members = ((data || []) as MemberCandidate[]).filter(
      (member) => String(member.status || 'ativo').trim().toLocaleLowerCase('pt-BR') !== 'inativo',
    );
    const phoneMatches = validPhone ? members.filter((member) => onlyDigits(member.phone || '') === normalizedPhone).length : 0;
    const emailMatches = validEmail ? members.filter((member) => String(member.email || '').trim().toLowerCase() === email).length : 0;

    const candidates = members.filter((member) => {
      if (!memberNameMatches(member.full_name, normalizedName)) return false;

      const birthMatches = validBirthDate && member.birth_date === birthDate;
      const uniquePhoneMatches = validPhone && phoneMatches === 1 && onlyDigits(member.phone || '') === normalizedPhone;
      const uniqueEmailMatches = validEmail && emailMatches === 1 && String(member.email || '').trim().toLowerCase() === email;
      return birthMatches || uniquePhoneMatches || uniqueEmailMatches;
    });

    if (candidates.length !== 1) {
      return NextResponse.json({ found: false }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const member = candidates[0];
    const ministryOptions = Array.from(new Set((departments || [])
      .map((item) => String(item.name || '').trim())
      .filter((nameValue) => nameValue && !HIDDEN_DEPARTMENTS.has(nameValue.toLocaleLowerCase('pt-BR')))));

    const { data: links } = await service
      .from('member_functions')
      .select('ministry_functions(ministry_areas(departments(name)))')
      .eq('member_id', member.id)
      .eq('active', true);

    const importedMinistries = ((links || []) as Array<Record<string, any>>)
      .map((link) => link?.ministry_functions?.ministry_areas?.departments?.name)
      .filter(Boolean)
      .map(String);
    const manualMinistries = String(member.ministry || '').split(',').map((item) => item.trim()).filter(Boolean);
    const currentMinistries = Array.from(new Set([...importedMinistries, ...manualMinistries]));

    const summary: Record<string, SummaryField> = {
      birthDate: member.birth_date ? { value: formatDate(member.birth_date), status: 'filled' } : { value: 'Não informado', status: 'missing' },
      phone: textSummary(member.phone),
      email: textSummary(member.email),
      address: addressSummary(member),
      family: familySummary(member),
      waterBaptized: booleanSummary(member.water_baptized),
      holySpiritBaptized: booleanSummary(member.holy_spirit_baptized),
      fundamentosFe: booleanSummary(member.fundamentos_fe),
      talents: textSummary(member.talents),
      ministries: currentMinistries.length ? { value: currentMinistries.join(', '), status: 'filled' } : { value: 'Nenhum informado', status: 'missing' },
    };

    const yesNoValue = (value: boolean | null) => value == null ? '' : value ? 'yes' : 'no';

    return NextResponse.json({
      found: true,
      token: sign(member.id, signingSecret),
      ministryOptions,
      currentMinistries,
      member: {
        displayName: member.full_name,
        summary,
        current: {
          birthDate: member.birth_date || '',
          phone: member.phone || '',
          email: member.email || '',
          address: member.address || '',
          neighborhood: member.neighborhood || '',
          city: member.city || '',
          maritalStatus: member.marital_status || '',
          spouseName: member.spouse_name || '',
          hasChildren: yesNoValue(member.has_children),
          childrenNames: member.children_names || '',
          waterBaptized: yesNoValue(member.water_baptized),
          holySpiritBaptized: yesNoValue(member.holy_spirit_baptized),
          fundamentosFe: yesNoValue(member.fundamentos_fe),
          talents: member.talents || '',
          ministries: currentMinistries,
        },
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    console.error('Public member lookup error:', error);
    return NextResponse.json({ found: false, error: publicError.message }, { status: publicError.status });
  }
}
