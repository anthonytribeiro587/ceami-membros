import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LegacyRow = {
  id: string;
  send_date: string | null;
  group_id: string | null;
  group_name: string | null;
  message_type: string | null;
  member_ids: string[] | null;
  member_names: string[] | null;
  message: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string | null;
};

type AutomationRow = {
  id: string;
  name: string;
  type: 'birthday' | 'reading_plan' | 'custom';
};

type AutomationRunRow = {
  id: string;
  automation_id: string;
  scheduled_date: string;
  destination_group_id: string;
  run_type: 'automatic' | 'manual';
  message: string | null;
  status: string;
  error_message: string | null;
  metadata: {
    memberIds?: string[];
    memberNames?: string[];
    reference?: string;
    simulation?: boolean;
  } | null;
  created_at: string;
};

function displayTitle(
  automation: AutomationRow | undefined,
  metadata: AutomationRunRow['metadata'],
) {
  if (automation?.type === 'birthday' && metadata?.memberNames?.length) {
    return metadata.memberNames.join(', ');
  }
  if (automation?.type === 'reading_plan' && metadata?.reference) {
    return `${automation.name} · ${metadata.reference}`;
  }
  return automation?.name || 'Automação';
}

export async function GET() {
  const client = getServiceClient();
  if (!client) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const [legacyResult, runsResult, automationsResult] = await Promise.all([
    client
      .from('birthday_messages')
      .select(
        'id, send_date, group_id, group_name, message_type, member_ids, member_names, message, status, error_message, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('automation_runs')
      .select(
        'id, automation_id, scheduled_date, destination_group_id, run_type, message, status, error_message, metadata, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(200),
    client.from('automations').select('id,name,type'),
  ]);

  if (runsResult.error || automationsResult.error) {
    return NextResponse.json(
      {
        error: 'Não foi possível carregar o histórico de mensagens.',
        details: runsResult.error?.message || automationsResult.error?.message,
      },
      { status: 500 },
    );
  }

  const automationMap = new Map(
    ((automationsResult.data || []) as AutomationRow[]).map((automation) => [
      automation.id,
      automation,
    ]),
  );

  const recent = ((runsResult.data || []) as AutomationRunRow[]).map((row) => {
    const automation = automationMap.get(row.automation_id);
    const simulation = Boolean(row.metadata?.simulation);
    return {
      id: row.id,
      automationId: row.automation_id,
      automationName: automation?.name || 'Automação',
      automationType: automation?.type || 'custom',
      title: displayTitle(automation, row.metadata),
      sendDate: row.scheduled_date,
      groupId: row.destination_group_id,
      groupName: 'Comunidade CEAMI',
      runType: simulation ? 'simulation' : row.run_type,
      message: row.message || '',
      status: row.status,
      errorMessage: row.error_message || '',
      createdAt: row.created_at,
    };
  });

  const legacy = legacyResult.error
    ? []
    : ((legacyResult.data || []) as LegacyRow[]).map((row) => ({
        id: `legacy-${row.id}`,
        automationId: 'birthdays',
        automationName: 'Aniversários',
        automationType: 'birthday',
        title: row.member_names?.length ? row.member_names.join(', ') : 'Aniversários',
        sendDate: row.send_date,
        groupId: row.group_id || '',
        groupName: row.group_name || 'Comunidade CEAMI',
        runType:
          row.message_type === 'automatic' || row.message_type === 'today'
            ? 'automatic'
            : 'simulation',
        message: row.message || '',
        status: row.status || 'sent',
        errorMessage: row.error_message || '',
        createdAt: row.created_at,
      }));

  const history = [...recent, ...legacy]
    .sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || '')),
    )
    .slice(0, 200);

  return NextResponse.json({ history });
}
