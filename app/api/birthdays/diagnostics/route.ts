import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EvolutionGroup = {
  id?: string;
  jid?: string;
  remoteJid?: string;
  subject?: string;
  name?: string;
};

function groupJid(group: EvolutionGroup) {
  return group.id || group.remoteJid || group.jid || '';
}

function extractGroups(payload: unknown): EvolutionGroup[] {
  if (Array.isArray(payload)) return payload as EvolutionGroup[];
  if (!payload || typeof payload !== 'object') return [];

  const value = payload as {
    groups?: EvolutionGroup[];
    data?: EvolutionGroup[] | { groups?: EvolutionGroup[] };
    response?: EvolutionGroup[];
  };

  if (Array.isArray(value.groups)) return value.groups;
  if (Array.isArray(value.data)) return value.data;
  if (value.data && !Array.isArray(value.data) && Array.isArray(value.data.groups)) {
    return value.data.groups;
  }
  if (Array.isArray(value.response)) return value.response;
  return [];
}

export async function GET() {
  const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || '';
  const groupId = process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '';

  if (!apiUrl || !apiKey || !instance || !groupId) {
    return NextResponse.json(
      {
        ok: false,
        instance,
        groupId,
        apiConfigured: Boolean(apiUrl),
        apiKeyConfigured: Boolean(apiKey),
        error: 'Há variáveis da Evolution ausentes na Vercel.',
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `${apiUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`,
      {
        method: 'GET',
        headers: { apikey: apiKey },
        cache: 'no-store',
      },
    );

    const responseText = await response.text();
    let payload: unknown;

    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { raw: responseText.slice(0, 1000) };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          instance,
          groupId,
          apiConfigured: true,
          apiKeyConfigured: true,
          error: `A Evolution respondeu ${response.status} ao consultar a instância.`,
          details: payload,
        },
        { status: 502 },
      );
    }

    const groups = extractGroups(payload);
    const group = groups.find((item) => groupJid(item) === groupId);

    return NextResponse.json({
      ok: Boolean(group),
      instance,
      groupId,
      groupFound: Boolean(group),
      groupName: group?.subject || group?.name || '',
      groupsFound: groups.length,
      apiConfigured: true,
      apiKeyConfigured: true,
      error: group
        ? null
        : `A instância “${instance}” conectou na Evolution, mas não encontrou o grupo configurado.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        instance,
        groupId,
        apiConfigured: true,
        apiKeyConfigured: true,
        error: error instanceof Error ? error.message : 'Não foi possível validar a Evolution.',
      },
      { status: 500 },
    );
  }
}
