import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const TIME_ZONE = 'America/Sao_Paulo';

type MemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  status: string | null;
};

type BirthdayMember = {
  id: string;
  name: string;
  phone: string;
  mentionJid: string | null;
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function titleCase(value: string) {
  const lowerWords = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && lowerWords.has(word)
        ? word
        : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1),
    )
    .join(' ');
}

function normalizeBrazilPhone(value: string | null) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 13 ? digits : '';
}

function toBirthdayMember(member: MemberRow): BirthdayMember {
  const phone = normalizeBrazilPhone(member.phone);
  return {
    id: member.id,
    name: titleCase(member.full_name),
    phone,
    mentionJid: phone ? `${phone}@s.whatsapp.net` : null,
  };
}

function isActive(member: MemberRow) {
  return String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo';
}

function getBrazilDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';

  return {
    date: `${year}-${month}-${day}`,
    monthDay: `${month}-${day}`,
    displayDate: `${day}/${month}/${year}`,
  };
}

function memberLine(member: BirthdayMember) {
  return member.phone ? `*${member.name}* — @${member.phone}` : `*${member.name}*`;
}

function buildMessage(members: BirthdayMember[]) {
  if (members.length === 1) {
    return `🎉 *Hoje é dia de celebrar!*\n\nA CEAMI deseja um feliz aniversário para ${memberLine(members[0])}! 🥳\n\nQue Deus continue abençoando sua vida, sua família e sua caminhada. Que este novo ciclo seja cheio da presença de Deus, alegria e propósito.\n\nDeixe aqui sua mensagem de carinho! 🧡`;
  }

  const list = members.map((member) => `• ${memberLine(member)}`).join('\n');
  return `🎉 *Hoje é dia de celebrar!*\n\nA CEAMI deseja um feliz aniversário aos nossos aniversariantes de hoje:\n\n${list}\n\nQue Deus continue abençoando cada vida, família e caminhada. Que este novo ciclo seja cheio da presença de Deus, alegria e propósito.\n\nDeixe aqui sua mensagem de carinho! 🧡`;
}

async function loadMembers(service: SupabaseClient) {
  const { data, error } = await service
    .from('members')
    .select('id, full_name, phone, birth_date, status')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data || []) as MemberRow[]).filter(isActive);
}

async function getTodayBirthdays(service: SupabaseClient) {
  const { monthDay } = getBrazilDate();
  const members = await loadMembers(service);
  return members
    .filter((member) => member.birth_date?.slice(5) === monthDay)
    .map(toBirthdayMember);
}

async function getSimulationMembers(service: SupabaseClient) {
  const members = await loadMembers(service);
  return members
    .map(toBirthdayMember)
    .filter((member) => Boolean(member.phone))
    .map(({ id, name, phone }) => ({ id, name, phone }));
}

export async function GET() {
  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  try {
    const [birthdays, simulationMembers] = await Promise.all([
      getTodayBirthdays(service),
      getSimulationMembers(service),
    ]);
    const today = getBrazilDate();

    return NextResponse.json({
      date: today.date,
      displayDate: today.displayDate,
      birthdays: birthdays.map(({ id, name, phone }) => ({ id, name, phone })),
      simulationMembers,
      configuration: {
        apiUrlConfigured: Boolean(process.env.EVOLUTION_API_URL),
        instance: process.env.EVOLUTION_INSTANCE || '',
        groupId: process.env.EVOLUTION_TEST_GROUP_ID || '',
        apiKeyConfigured: Boolean(process.env.EVOLUTION_API_KEY),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao consultar aniversariantes.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  const groupId = process.env.EVOLUTION_TEST_GROUP_ID;

  if (!apiUrl || !apiKey || !instance || !groupId) {
    return NextResponse.json(
      { error: 'Configure as quatro variáveis da Evolution na Vercel.' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { mode?: string; testMemberId?: string };
    const mode: 'today' | 'simulation' = body.mode === 'today' ? 'today' : 'simulation';
    const today = getBrazilDate();
    let members: BirthdayMember[];

    if (mode === 'today') {
      members = await getTodayBirthdays(service);
      if (!members.length) {
        return NextResponse.json({ error: 'Não há aniversariantes hoje.' }, { status: 400 });
      }

      const { data: previous, error: lookupError } = await service
        .from('birthday_messages')
        .select('id')
        .eq('send_date', today.date)
        .eq('group_id', groupId)
        .in('message_type', ['today', 'automatic'])
        .eq('status', 'sent')
        .limit(1);

      if (lookupError) {
        return NextResponse.json(
          {
            error: 'O histórico ainda não está atualizado. Execute a migration de correção antes do envio oficial.',
            details: lookupError.message,
          },
          { status: 503 },
        );
      }

      if (previous && previous.length > 0) {
        return NextResponse.json({ error: 'A mensagem de hoje já foi enviada.' }, { status: 409 });
      }
    } else {
      const testMemberId = String(body.testMemberId || '').trim();
      if (!testMemberId) {
        return NextResponse.json({ error: 'Selecione o membro usado na simulação.' }, { status: 400 });
      }

      const { data, error } = await service
        .from('members')
        .select('id, full_name, phone, birth_date, status')
        .eq('id', testMemberId)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
      }

      const member = toBirthdayMember(data as MemberRow);
      if (!member.phone || !member.mentionJid) {
        return NextResponse.json(
          { error: 'Esse membro não possui um WhatsApp válido para ser mencionado.' },
          { status: 400 },
        );
      }

      members = [member];
    }

    const names = members.map((member) => member.name);
    const mentioned = members
      .map((member) => member.mentionJid)
      .filter((jid): jid is string => Boolean(jid));
    const message = buildMessage(members);

    const response = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        number: groupId,
        text: message,
        delay: 1200,
        linkPreview: false,
        mentionsEveryOne: false,
        mentioned,
      }),
      cache: 'no-store',
    });

    const responseText = await response.text();
    let providerResponse: unknown;
    try {
      providerResponse = JSON.parse(responseText);
    } catch {
      providerResponse = { raw: responseText.slice(0, 3000) };
    }

    const logBase = {
      send_date: today.date,
      group_id: groupId,
      group_name: 'Grupo de teste CEAMI',
      message_type: mode,
      member_ids: members.map((member) => member.id),
      member_names: names,
      message,
      provider_response: providerResponse,
    };

    if (!response.ok) {
      await service.from('birthday_messages').insert({
        ...logBase,
        status: 'failed',
        error_message: `Evolution respondeu ${response.status}`,
      });
      return NextResponse.json(
        { error: `Evolution respondeu ${response.status}.`, details: providerResponse },
        { status: 502 },
      );
    }

    const { error: logError } = await service.from('birthday_messages').insert({
      ...logBase,
      status: 'sent',
    });

    return NextResponse.json({
      ok: true,
      message,
      names,
      mentioned,
      groupId,
      historySaved: !logError,
      historyError: logError?.message || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível enviar.' },
      { status: 500 },
    );
  }
}
