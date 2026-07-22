import { NextRequest, NextResponse } from 'next/server';
import {
  consumeRateLimit,
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

type ExistingMember = {
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
};

type IntegraBody = Record<string, unknown>;

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

function cleanText(value: unknown, max: number) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function nameMatches(input: string, stored: string) {
  const inputWords = normalize(input).split(' ').filter((word) => word.length > 1);
  const storedWords = normalize(stored).split(' ').filter((word) => word.length > 1);
  return inputWords.length > 0 && inputWords.every((word) =>
    storedWords.some((candidate) => candidate === word || candidate.startsWith(word) || word.startsWith(candidate)),
  );
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isFutureDate(value: string) {
  return new Date(`${value}T23:59:59`).getTime() > Date.now();
}

export async function POST(request: NextRequest) {
  try {
    if (!requestComesFromSameSite(request)) {
      return NextResponse.json({ error: 'Origem da solicitação não permitida.' }, { status: 403 });
    }

    const allowed = await consumeRateLimit(request, 'integra-submit', 15 * 60, 6);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const body = await readLimitedJson<IntegraBody>(request, 20_000);

    if (body.privacy_accepted !== true) {
      return NextResponse.json(
        { error: 'Confirme o aviso de privacidade antes de enviar.' },
        { status: 400 },
      );
    }

    const fullName = String(body.full_name || '').trim().replace(/\s+/g, ' ').slice(0, 180);
    const integraDate = String(body.integra_date || '').trim();

    if (fullName.length < 3) {
      return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 });
    }

    if (!validDate(integraDate) || isFutureDate(integraDate)) {
      return NextResponse.json({ error: 'Informe uma data válida para o Integra.' }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Integração com o banco ainda não foi configurada.' }, { status: 503 });
    }

    const phone = String(body.phone || '').trim().slice(0, 30);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 160);
    const birthDate = String(body.birth_date || '').trim();
    const phoneDigits = onlyDigits(phone);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }

    if (birthDate && (!validDate(birthDate) || isFutureDate(birthDate))) {
      return NextResponse.json({ error: 'Informe uma data de nascimento válida.' }, { status: 400 });
    }

    if (!birthDate && phoneDigits.length < 10 && !email) {
      return NextResponse.json(
        { error: 'Informe a data de nascimento, o WhatsApp com DDD ou o e-mail.' },
        { status: 400 },
      );
    }

    const identity = phoneDigits || email || `${normalize(fullName)}|${birthDate}`;
    const identityAllowed = await consumeRateLimit(request, 'integra-identity', 60 * 60, 3, identity);
    if (!identityAllowed) {
      return NextResponse.json(
        { error: 'Esta ficha já foi tentada recentemente. Aguarde antes de reenviar.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    const { data: currentMembers, error: lookupError } = await supabase
      .from('members')
      .select('full_name, phone, email, birth_date')
      .limit(2000);

    if (lookupError) {
      console.error('Erro ao conferir duplicidade no Integra:', lookupError.message);
      return NextResponse.json({ error: 'Não foi possível conferir se o cadastro já existe. Tente novamente.' }, { status: 500 });
    }

    const duplicate = ((currentMembers || []) as ExistingMember[]).find((member) => {
      const samePhone = phoneDigits.length >= 10 && onlyDigits(member.phone || '') === phoneDigits;
      const sameEmail = email.length > 3 && String(member.email || '').trim().toLowerCase() === email;
      const sameBirthAndName = Boolean(
        birthDate && member.birth_date === birthDate && nameMatches(fullName, member.full_name),
      );
      return samePhone || sameEmail || sameBirthAndName;
    });

    if (duplicate) {
      return NextResponse.json({
        existing: true,
        error: 'Já existe um cadastro compatível. Use a página de consulta para conferir ou solicitar uma atualização.',
      }, { status: 409 });
    }

    const hasSkills = body.has_skills === true;
    const now = new Date().toISOString();
    const payload = {
      full_name: fullName,
      phone: phone || null,
      email: email || null,
      birth_date: birthDate || null,
      integra_date: integraDate,
      marital_status: cleanText(body.marital_status, 50),
      spouse_name: cleanText(body.spouse_name, 180),
      address: cleanText(body.address, 250),
      neighborhood: cleanText(body.neighborhood, 120),
      city: cleanText(body.city, 120),
      zip_code: cleanText(body.zip_code, 20),
      has_children: body.has_children === true,
      children_names: cleanText(body.children_names, 1000),
      previous_church: body.previous_church === true,
      previous_church_name: cleanText(body.previous_church_name, 180),
      water_baptized: body.water_baptized === true,
      baptism_church: cleanText(body.baptism_church, 180),
      baptism_date: cleanText(body.baptism_date, 10),
      holy_spirit_baptized: body.holy_spirit_baptized === true,
      fundamentos_fe: body.fundamentos_fe === true,
      fundamentos_fe_date: cleanText(body.fundamentos_fe_date, 10),
      talents: hasSkills ? cleanText(body.talents, 1000) : null,
      ministry: 'Sem ministério',
      notes: cleanText(body.notes, 1000),
      whatsapp_consent: Boolean(phone),
      status: 'ativo',
      joined_at: new Date().toISOString().slice(0, 10),
      privacy_notice_version: '2026-07-22-v1',
      privacy_notice_accepted_at: now,
      privacy_notice_source: 'integra_publico',
    };

    const { error } = await supabase.from('members').insert(payload);

    if (error) {
      console.error('Erro ao salvar ficha do Integra:', error.message);
      return NextResponse.json({ error: 'Não foi possível salvar a ficha. Tente novamente.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    console.error('Erro inesperado no formulário Integra:', error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
