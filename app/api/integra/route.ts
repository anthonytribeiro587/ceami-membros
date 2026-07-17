import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

type ExistingMember = {
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
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

function nameMatches(input: string, stored: string) {
  const inputWords = normalize(input).split(' ').filter(word => word.length > 1);
  const storedWords = normalize(stored).split(' ').filter(word => word.length > 1);
  return inputWords.length > 0 && inputWords.every(word =>
    storedWords.some(candidate => candidate === word || candidate.startsWith(word) || word.startsWith(candidate)),
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fullName = String(body.full_name || '').trim();

    if (!fullName) {
      return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRole) {
      return NextResponse.json({ error: 'Integração com o banco ainda não foi configurada.' }, { status: 500 });
    }

    const supabase = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const birthDate = String(body.birth_date || '').trim();
    const phoneDigits = onlyDigits(phone);

    const { data: currentMembers, error: lookupError } = await supabase
      .from('members')
      .select('full_name, phone, email, birth_date')
      .limit(1000);

    if (lookupError) {
      console.error('Erro ao conferir duplicidade no Integra:', lookupError);
      return NextResponse.json({ error: 'Não foi possível conferir se o cadastro já existe. Tente novamente.' }, { status: 500 });
    }

    const duplicate = ((currentMembers || []) as ExistingMember[]).find(member => {
      const samePhone = phoneDigits.length >= 8 && onlyDigits(member.phone || '') === phoneDigits;
      const sameEmail = email.length > 3 && String(member.email || '').trim().toLowerCase() === email;
      const sameBirthAndName = Boolean(
        birthDate && member.birth_date === birthDate && nameMatches(fullName, member.full_name),
      );
      return samePhone || sameEmail || sameBirthAndName;
    });

    if (duplicate) {
      return NextResponse.json({
        existing: true,
        error: 'Já existe um cadastro com esses dados. Use a página de consulta para conferir ou solicitar uma atualização.',
      }, { status: 409 });
    }

    const payload = {
      full_name: fullName,
      phone: phone || null,
      email: email || null,
      birth_date: birthDate || null,
      marital_status: body.marital_status || null,
      spouse_name: body.spouse_name || null,
      address: body.address || null,
      neighborhood: body.neighborhood || null,
      city: body.city || null,
      zip_code: body.zip_code || null,
      has_children: Boolean(body.has_children),
      children_names: body.children_names || null,
      previous_church: Boolean(body.previous_church),
      previous_church_name: body.previous_church_name || null,
      water_baptized: Boolean(body.water_baptized),
      baptism_church: body.baptism_church || null,
      baptism_date: body.baptism_date || null,
      holy_spirit_baptized: Boolean(body.holy_spirit_baptized),
      fundamentos_fe: Boolean(body.fundamentos_fe),
      fundamentos_fe_date: body.fundamentos_fe_date || null,
      talents: body.talents || null,
      ministry: body.ministry || 'Sem ministério',
      notes: body.notes || null,
      whatsapp_consent: Boolean(phone),
      status: 'ativo',
      joined_at: new Date().toISOString().slice(0, 10),
    };

    const { error } = await supabase.from('members').insert(payload);

    if (error) {
      console.error('Erro ao salvar ficha do Integra:', error);
      return NextResponse.json({ error: 'Não foi possível salvar a ficha. Tente novamente.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro inesperado no formulário Integra:', error);
    return NextResponse.json({ error: 'Ocorreu um erro inesperado.' }, { status: 500 });
  }
}
