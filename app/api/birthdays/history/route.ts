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

type AutomationRunRow = {
  id: string;
  scheduled_date: string;
  destination_group_id: string;
  run_type: string;
  message: string | null;
  status: string;
  error_message: string | null;
  metadata: { memberIds?: string[]; memberNames?: string[] } | null;
  created_at: string;
};

export async function GET() {
  const client = getServiceClient();
  if (!client) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const [legacyResult, automationResult] = await Promise.all([
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
        'id, scheduled_date, destination_group_id, run_type, message, status, error_message, metadata, created_at',
      )
      .eq('automation_id', 'birthdays')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (legacyResult.error) {
    return NextResponse.json(
      {
        error: 'Não foi possível carregar o histórico.',
        details: legacyResult.error.message,
      },
      { status: 500 },
    );
  }

  const legacy = ((legacyResult.data || []) as LegacyRow[]).map((row) => ({
    id: row.id,
    sendDate: row.send_date,
    groupId: row.group_id || '',
    groupName: row.group_name || 'Grupo não identificado',
    type: row.message_type || 'simulation',
    memberIds: row.member_ids || [],
    memberNames: row.member_names || [],
    message: row.message || '',
    status: row.status || 'sent',
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
  }));

  const recent = automationResult.error
    ? []
    : ((automationResult.data || []) as AutomationRunRow[]).map((row) => ({
        id: row.id,
        sendDate: row.scheduled_date,
        groupId: row.destination_group_id,
        groupName: 'Comunidade CEAMI',
        type: row.run_type === 'manual' ? 'manual' : 'automatic',
        memberIds: row.metadata?.memberIds || [],
        memberNames: row.metadata?.memberNames || [],
        message: row.message || '',
        status: row.status,
        errorMessage: row.error_message || '',
        createdAt: row.created_at,
      }));

  const history = [...recent, ...legacy]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 100);

  return NextResponse.json({ history });
}
