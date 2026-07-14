import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { POST as sendBirthdayMessage } from '../test/route';

export const runtime = 'nodejs';
export const maxDuration = 60;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function brazilClock(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
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

export async function POST() {
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });

  const officialGroupId = process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID;
  if (!officialGroupId) {
    return NextResponse.json({ error: 'Configure EVOLUTION_GROUP_ID na Vercel.' }, { status: 503 });
  }

  process.env.EVOLUTION_TEST_GROUP_ID = officialGroupId;

  const { data: setting, error } = await supabase
    .from('birthday_automation_settings')
    .select('enabled,send_time,timezone,test_mode,test_member_id,last_sent_date,group_id')
    .eq('id', 'default')
    .maybeSingle();

  if (error || !setting) {
    return NextResponse.json({ error: 'Execute a migration da automação.', details: error?.message }, { status: 503 });
  }

  if (setting.group_id !== officialGroupId) {
    await supabase.from('birthday_automation_settings').update({ group_id: officialGroupId, updated_at: new Date().toISOString() }).eq('id', 'default');
  }

  if (!setting.enabled) return NextResponse.json({ ok: true, skipped: 'disabled' });

  const clock = brazilClock(setting.timezone);
  const [hour, minute] = String(setting.send_time).split(':').map(Number);
  const difference = clock.minutes - (hour * 60 + minute);

  if (difference < 0 || difference > 4) {
    return NextResponse.json({ ok: true, skipped: 'outside_window', now: clock.time, target: setting.send_time });
  }
  if (setting.last_sent_date === clock.date) {
    return NextResponse.json({ ok: true, skipped: 'already_sent' });
  }
  if (setting.test_mode && !setting.test_member_id) {
    return NextResponse.json({ error: 'Selecione o membro de teste em Ajustes.' }, { status: 400 });
  }

  const request = new Request('https://internal/api/birthdays/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: setting.test_mode ? 'simulation' : 'today',
      testMemberId: setting.test_member_id || undefined,
    }),
  });

  const result = await sendBirthdayMessage(request);
  let payload: Record<string, unknown> = {};
  try { payload = await result.clone().json(); } catch {}

  await supabase.from('birthday_automation_settings').update({
    last_sent_date: result.ok ? clock.date : null,
    last_sent_at: new Date().toISOString(),
    last_status: result.ok ? 'sent' : 'failed',
    last_error: result.ok ? null : String(payload.error || payload.details || 'Falha no envio'),
    updated_at: new Date().toISOString(),
  }).eq('id', 'default');

  return NextResponse.json({
    automatic: true,
    scheduledTime: setting.send_time,
    testMode: setting.test_mode,
    groupId: officialGroupId,
    result: payload,
  }, { status: result.status });
}

export async function GET() {
  return POST();
}
