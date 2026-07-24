import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { clockInTimezone, type AutomationRow } from '@/lib/server/automation-runner';
import { getEvolutionConfig, evolutionConfigured } from '@/lib/server/evolution';
import {
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdatePayload = {
  id?: string;
  enabled?: boolean;
  sendTime?: string;
  groupId?: string;
  messageTemplate?: string;
  name?: string;
  scheduleType?: string;
  weekdays?: unknown;
  dayOfMonth?: unknown;
};

type ReadingRow = { reading_date: string; reference: string };
type BirthdayMemberRow = { id: string; full_name: string; birth_date: string | null; status: string | null };

type CreatePayload = {
  name?: string;
  sendTime?: string;
  groupId?: string;
  messageTemplate?: string;
  scheduleType?: string;
  weekdays?: unknown;
  dayOfMonth?: unknown;
};

type ScheduleType = 'daily' | 'weekly' | 'monthly';

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validGroup(value: string) {
  return /^\d+@g\.us$/.test(value);
}

function normalizeSchedule(input: {
  scheduleType?: unknown;
  weekdays?: unknown;
  dayOfMonth?: unknown;
}) {
  const scheduleType = String(input.scheduleType || 'daily').trim() as ScheduleType;
  if (!['daily', 'weekly', 'monthly'].includes(scheduleType)) {
    throw new Error('Frequência inválida.');
  }

  if (scheduleType === 'weekly') {
    const rawWeekdays = Array.isArray(input.weekdays) ? input.weekdays : [];
    const weekdays = Array.from(
      new Set(
        rawWeekdays
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
      ),
    ).sort((left, right) => left - right);

    if (!weekdays.length) {
      throw new Error('Selecione pelo menos um dia da semana.');
    }

    return { scheduleType, weekdays, dayOfMonth: null };
  }

  if (scheduleType === 'monthly') {
    const dayOfMonth = Number(input.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      throw new Error('Selecione um dia válido do mês.');
    }
    return { scheduleType, weekdays: [] as number[], dayOfMonth };
  }

  return { scheduleType: 'daily' as const, weekdays: [] as number[], dayOfMonth: null };
}

function tomorrowFrom(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function normalizeAutomation(row: AutomationRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    sendTime: String(row.send_time).slice(0, 5),
    timezone: row.timezone,
    groupId: row.group_id,
    messageTemplate: row.message_template,
    scheduleType: row.schedule_type || 'daily',
    weekdays: Array.isArray(row.weekdays) ? row.weekdays : [],
    dayOfMonth: row.day_of_month,
    lastSentDate: row.last_sent_date,
    lastSentAt: row.last_sent_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    canDelete: row.type === 'custom',
  };
}

export async function GET() {
  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const clock = clockInTimezone('America/Sao_Paulo');
  const tomorrow = tomorrowFrom(clock.date);

  const [automationsResult, readingsResult, runsResult, membersResult] = await Promise.all([
    service.from('automations').select('*').order('created_at', { ascending: true }),
    service
      .from('reading_plan_entries')
      .select('reading_date,reference')
      .in('reading_date', [clock.date, tomorrow])
      .order('reading_date', { ascending: true }),
    service
      .from('automation_runs')
      .select(
        'id,automation_id,run_type,scheduled_date,status,message,destination_group_id,provider_status,error_message,metadata,created_at,completed_at',
      )
      .order('created_at', { ascending: false })
      .limit(100),
    service
      .from('members')
      .select('id,full_name,birth_date,status')
      .order('full_name', { ascending: true }),
  ]);

  const firstError =
    automationsResult.error || readingsResult.error || runsResult.error || membersResult.error;
  if (firstError) {
    return NextResponse.json(
      {
        error: 'Não foi possível carregar as automações.',
        details: firstError.message,
      },
      { status: 500 },
    );
  }

  const readings = new Map(
    ((readingsResult.data || []) as ReadingRow[]).map((entry) => [entry.reading_date, entry.reference]),
  );
  const birthdaysToday = ((membersResult.data || []) as BirthdayMemberRow[])
    .filter(
      (member) =>
        String(member.status || 'ativo').toLocaleLowerCase('pt-BR') !== 'inativo',
    )
    .filter((member) => member.birth_date?.slice(5) === clock.monthDay)
    .map((member) => ({ id: member.id, name: member.full_name }));

  const config = getEvolutionConfig();

  return NextResponse.json({
    automations: ((automationsResult.data || []) as AutomationRow[]).map(normalizeAutomation),
    today: {
      date: clock.date,
      displayDate: clock.displayDate,
      weekday: clock.weekday,
      birthdays: birthdaysToday,
      reading: readings.get(clock.date) || '',
    },
    tomorrow: {
      date: tomorrow,
      reading: readings.get(tomorrow) || '',
    },
    history: runsResult.data || [],
    evolution: {
      configured: evolutionConfigured(config),
      instance: config.instance,
      defaultGroupId: config.defaultGroupId,
    },
  });
}

export async function PATCH(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  try {
    const body = await readLimitedJson<UpdatePayload>(request, 12_000);
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Automação não informada.' }, { status: 400 });

    const { data: existingAutomation, error: lookupError } = await service
      .from('automations')
      .select('id,type')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);
    if (!existingAutomation) {
      return NextResponse.json({ error: 'Automação não encontrada.' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;

    if (body.sendTime !== undefined) {
      const sendTime = String(body.sendTime).trim();
      if (!validTime(sendTime)) {
        return NextResponse.json({ error: 'Horário inválido.' }, { status: 400 });
      }
      updates.send_time = `${sendTime}:00`;
    }

    if (body.groupId !== undefined) {
      const groupId = String(body.groupId).trim();
      if (!validGroup(groupId)) {
        return NextResponse.json(
          { error: 'O ID do grupo deve terminar em @g.us.' },
          { status: 400 },
        );
      }
      updates.group_id = groupId;
    }

    if (body.messageTemplate !== undefined) {
      const template = String(body.messageTemplate).trim();
      if (!template || template.length > 4_000) {
        return NextResponse.json(
          { error: 'A mensagem precisa ter entre 1 e 4.000 caracteres.' },
          { status: 400 },
        );
      }
      updates.message_template = template;
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 3 || name.length > 80) {
        return NextResponse.json(
          { error: 'O nome precisa ter entre 3 e 80 caracteres.' },
          { status: 400 },
        );
      }
      updates.name = name;
    }

    if (
      body.scheduleType !== undefined ||
      body.weekdays !== undefined ||
      body.dayOfMonth !== undefined
    ) {
      let schedule: ReturnType<typeof normalizeSchedule>;
      try {
        schedule = normalizeSchedule(body);
      } catch (scheduleError) {
        return NextResponse.json(
          {
            error:
              scheduleError instanceof Error
                ? scheduleError.message
                : 'Frequência inválida.',
          },
          { status: 400 },
        );
      }
      if (existingAutomation.type !== 'custom' && schedule.scheduleType !== 'daily') {
        return NextResponse.json(
          {
            error:
              'Aniversários e Plano de leitura são automações diárias. Altere somente o horário ou pause o envio.',
          },
          { status: 409 },
        );
      }
      updates.schedule_type = schedule.scheduleType;
      updates.weekdays = schedule.weekdays;
      updates.day_of_month = schedule.dayOfMonth;
    }

    const { data, error } = await service
      .from('automations')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Automação não encontrada.' }, { status: 404 });

    return NextResponse.json({ ok: true, automation: normalizeAutomation(data as AutomationRow) });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  try {
    const body = await readLimitedJson<CreatePayload>(request, 12_000);
    const name = String(body.name || '').trim();
    const sendTime = String(body.sendTime || '').trim();
    const groupId = String(body.groupId || '').trim();
    const messageTemplate = String(body.messageTemplate || '').trim();
    let schedule: ReturnType<typeof normalizeSchedule>;
    try {
      schedule = normalizeSchedule(body);
    } catch (scheduleError) {
      return NextResponse.json(
        {
          error:
            scheduleError instanceof Error
              ? scheduleError.message
              : 'Frequência inválida.',
        },
        { status: 400 },
      );
    }

    if (name.length < 3 || name.length > 80) {
      return NextResponse.json(
        { error: 'O nome precisa ter entre 3 e 80 caracteres.' },
        { status: 400 },
      );
    }
    if (!validTime(sendTime)) {
      return NextResponse.json({ error: 'Horário inválido.' }, { status: 400 });
    }
    if (!validGroup(groupId)) {
      return NextResponse.json(
        { error: 'O ID do grupo deve terminar em @g.us.' },
        { status: 400 },
      );
    }
    if (!messageTemplate || messageTemplate.length > 4_000) {
      return NextResponse.json(
        { error: 'A mensagem precisa ter entre 1 e 4.000 caracteres.' },
        { status: 400 },
      );
    }

    const { data, error } = await service
      .from('automations')
      .insert({
        id: `custom-${randomUUID()}`,
        name,
        type: 'custom',
        enabled: false,
        send_time: `${sendTime}:00`,
        timezone: 'America/Sao_Paulo',
        group_id: groupId,
        message_template: messageTemplate,
        schedule_type: schedule.scheduleType,
        weekdays: schedule.weekdays,
        day_of_month: schedule.dayOfMonth,
        config: {},
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(
      { ok: true, automation: normalizeAutomation(data as AutomationRow) },
      { status: 201 },
    );
  } catch (error) {
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  try {
    const body = await readLimitedJson<{ id?: string }>(request, 2_000);
    const id = String(body.id || '').trim();
    const { data: automation, error: lookupError } = await service
      .from('automations')
      .select('id,type')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);
    if (!automation) return NextResponse.json({ error: 'Automação não encontrada.' }, { status: 404 });
    if (automation.type !== 'custom') {
      return NextResponse.json(
        { error: 'As automações principais da CEAMI não podem ser excluídas.' },
        { status: 409 },
      );
    }

    const { error } = await service.from('automations').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
