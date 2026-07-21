import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { POST as sendOfficialBirthdayMessage } from '../official/route';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const OFFICIAL_INSTANCE = 'ceamirs';
const OFFICIAL_GROUP_ID = '120363148206200208@g.us';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function brazilClock(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const hour = get('hour');
  const minute = get('minute');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${minute}`,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

function dateInTimezone(value: string | null, timezone: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function POST() {
  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const configuredInstance = process.env.EVOLUTION_INSTANCE || '';
  const configuredGroupId = process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '';

  if (configuredInstance !== OFFICIAL_INSTANCE || configuredGroupId !== OFFICIAL_GROUP_ID) {
    return NextResponse.json(
      {
        ok: false,
        skipped: 'invalid_destination',
        error: 'Envio bloqueado: a instância ou o grupo da Vercel não correspondem à CEAMI.',
      },
      { status: 503 },
    );
  }

  const { data: setting, error } = await supabase
    .from('birthday_automation_settings')
    .select('enabled,send_time,timezone,test_mode,last_sent_date,last_sent_at,last_status,group_id')
    .eq('id', 'default')
    .maybeSingle();

  if (error || !setting) {
    return NextResponse.json(
      { error: 'Execute a migration da automação.', details: error?.message },
      { status: 503 },
    );
  }

  if (setting.group_id !== OFFICIAL_GROUP_ID) {
    await supabase
      .from('birthday_automation_settings')
      .update({ group_id: OFFICIAL_GROUP_ID, updated_at: new Date().toISOString() })
      .eq('id', 'default');
  }

  if (!setting.enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled' });
  }

  if (setting.test_mode) {
    return NextResponse.json({
      ok: true,
      skipped: 'test_mode',
      message: 'O modo de teste não dispara automaticamente no grupo oficial.',
    });
  }

  const clock = brazilClock(setting.timezone);
  const [hour, minute] = String(setting.send_time).split(':').map(Number);
  const difference = clock.minutes - (hour * 60 + minute);

  if (difference < 0 || difference > 4) {
    return NextResponse.json({
      ok: true,
      skipped: 'outside_window',
      now: clock.time,
      target: setting.send_time,
    });
  }

  if (setting.last_sent_date === clock.date) {
    return NextResponse.json({ ok: true, skipped: 'already_processed' });
  }

  const failedToday = setting.last_status === 'failed'
    && dateInTimezone(setting.last_sent_at, setting.timezone) === clock.date;
  if (failedToday) {
    return NextResponse.json({
      ok: true,
      skipped: 'failed_today',
      message: 'A tentativa de hoje falhou e não será repetida automaticamente. A próxima execução será amanhã.',
    });
  }

  const request = new Request('https://internal/api/birthdays/official', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'automatic', force: false }),
  });

  const result = await sendOfficialBirthdayMessage(request);
  let payload: Record<string, unknown> = {};
  try {
    payload = await result.clone().json();
  } catch {}

  return NextResponse.json(
    {
      automatic: true,
      scheduledTime: setting.send_time,
      groupId: OFFICIAL_GROUP_ID,
      instance: OFFICIAL_INSTANCE,
      result: payload,
    },
    { status: result.status },
  );
}

export async function GET() {
  return POST();
}
