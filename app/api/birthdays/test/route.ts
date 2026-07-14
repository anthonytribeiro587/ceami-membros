import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DEFAULT_API_URL = 'http://147.15.89.173:8080';
const DEFAULT_INSTANCE = 'nextlead';
const DEFAULT_TEST_GROUP_ID = '120363427208796760@g.us';
const TIME_ZONE = 'America/Sao_Paulo';

type MemberRow = {
  id: string;
  full_name: string;
  birth_date: string | null;
  status: string | null;
};

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

function getBrazilDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return {
    date: `${year}-${month}-${day}`,
    monthDay: `${month}-${day}`,
    displayDate: `${day}/${month}/${year}`,
  };
}

function buildMessage(names: string[]) {
  if (names.length === 1) {
    return `🎉 *Hoje é dia de celebrar!*\n\nA CEAMI deseja um feliz aniversário para *${names[0]}*! 🥳\n\nQue Deus continue abençoando sua vida, sua família e sua caminhada. Que este novo ciclo seja cheio da presença de Deus, alegria e propósito.\n\nDeixe aqui sua mensagem de carinho! 🧡`;
  }

  const list = names.map((name) => `• *${name}*`).join('\n');
  return `🎉 *Hoje é dia de celebrar!*\n\nA CEAMI deseja um feliz aniversário aos nossos aniversariantes de hoje:\n\n${list}\n\nQue Deus continue abençoando cada vida, família e caminhada. Que este novo ciclo seja cheio da presença de Deus, alegria e propósito.\n\nDeixe aqui sua mensagem de carinho! 🧡`;
}

async function getAdminContext() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return { error: 'As variáveis do Supabase não estão configuradas.', status: 503 } as const;
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // A rota apenas valida a sessão atual; o middleware cuida da renovação.
      },
    },
  });

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return { error: 'Sessão expirada.', status: 401 } as const;

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return { error: 'Somente administradores podem enviar mensagens.', status: 403 } as const;
  }

  return { service, user } as const;
}

async function getTodayBirthdays(service: ReturnType<typeof createClient>) {
  const { monthDay } = getBrazilDate();
  const { data, error } = await service
    .from('members')
    .select('id, full_name, birth_date, status')
    .not('birth_date', 'is', null)
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as MemberRow[])
    .filter((member) => {
      const active = String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo';
      return active && member.birth_date?.slice(5) === monthDay;
    })
    .map((member) => ({ id: member.id, name: titleCase(member.full_name) }));
}

export async function GET() {
  const context = await getAdminContext();
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const birthdays = await getTodayBirthdays(context.service);
    const today = getBrazilDate();

    return NextResponse.json({
      date: today.date,
      displayDate: today.displayDate,
      birthdays,
      configuration: {
        apiUrl: process.env.EVOLUTION_API_URL || DEFAULT_API_URL,
        instance: process.env.EVOLUTION_INSTANCE || DEFAULT_INSTANCE,
        groupId: process.env.EVOLUTION_TEST_GROUP_ID || DEFAULT_TEST_GROUP_ID,
        apiKeyConfigured: Boolean(process.env.EVOLUTION_API_KEY),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível consultar os aniversariantes.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const context = await getAdminContext();
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const apiUrl = (process.env.EVOLUTION_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || DEFAULT_INSTANCE;
  const groupId = process.env.EVOLUTION_TEST_GROUP_ID || DEFAULT_TEST_GROUP_ID;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Cadastre EVOLUTION_API_KEY nas variáveis da Vercel antes do teste.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const mode = body?.mode === 'today' ? 'today' : 'simulation';
    const today = getBrazilDate();

    let members: Array<{ id: string; name: string }> = [];

    if (mode === 'today') {
      members = await getTodayBirthdays(context.service);
      if (!members.length) {
        return NextResponse.json(
          { error: 'Não há aniversariantes cadastrados para hoje.' },
          { status: 400 },
        );
      }

      const { data: previous } = await context.service
        .from('birthday_messages')
        .select('id, created_at')
        .eq('send_date', today.date)
        .eq('group_id', groupId)
        .in('message_type', ['today', 'automatic'])
        .eq('status', 'sent')
        .maybeSingle();

      if (previous) {
        return NextResponse.json(
          { error: 'A mensagem dos aniversariantes de hoje já foi enviada para este grupo.' },
          { status: 409 },
        );
      }
    } else {
      const testName = String(body?.testName || '').trim();
      if (testName.length < 3) {
        return NextResponse.json({ error: 'Informe o nome usado na simulação.' }, { status: 400 });
      }
      members = [{ id: '', name: titleCase(testName) }];
    }

    const names = members.map((member) => member.name);
    const message = buildMessage(names);

    const evolutionResponse = await fetch(
      `${apiUrl}/message/sendText/${encodeURIComponent(instance)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: groupId,
          text: message,
          delay: 1200,
          linkPreview: false,
        }),
        cache: 'no-store',
      },
    );

    const responseText = await evolutionResponse.text();
    let providerResponse: Record<string, unknown>;

    try {
      providerResponse = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      providerResponse = { raw: responseText.slice(0, 3000) };
    }

    const logBase = {
      send_date: today.date,
      group_id: groupId,
      group_name: 'Grupo de teste CEAMI',
      message_type: mode,
      member_ids: members.map((member) => member.id).filter(Boolean),
      member_names: names,
      message,
      provider_response: providerResponse,
      created_by: context.user.id,
    };

    if (!evolutionResponse.ok) {
      await context.service.from('birthday_messages').insert({
        ...logBase,
        status: 'failed',
        error_message: `Evolution respondeu ${evolutionResponse.status}`,
      });

      return NextResponse.json(
        {
          error: `A Evolution recusou o envio (${evolutionResponse.status}).`,
          details: providerResponse,
        },
        { status: 502 },
      );
    }

    const { error: logError } = await context.service.from('birthday_messages').insert({
      ...logBase,
      status: 'sent',
    });

    return NextResponse.json({
      ok: true,
      message,
      names,
      groupId,
      historySaved: !logError,
      historyError: logError?.message || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.' },
      { status: 500 },
    );
  }
}
