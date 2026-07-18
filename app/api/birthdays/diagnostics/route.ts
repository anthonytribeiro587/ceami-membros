import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OFFICIAL_INSTANCE = 'ceamirs';
const OFFICIAL_GROUP_ID = '120363148206200208@g.us';

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
  const configuredInstance = process.env.EVOLUTION_INSTANCE || '';
  const configuredGroupId = process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '';

  if (configuredInstance !== OFFICIAL_INSTANCE) {
    return NextResponse.json(
      {
        ok: false,
        instance: configuredInstance,
        expectedInstance: OFFICIAL_INSTANCE,
        groupId: configuredGroupId || OFFICIAL_GROUP_ID,
        apiConfigured: Boolean(apiUrl),
        apiKeyConfigured: Boolean(apiKey),
        error: `Envio bloqueado: EVOLUTION_INSTANCE está como “${configuredInstance || 'não configurada'}”. A instância oficial deve ser “${OFFICIAL_INSTANCE}”. Nenhuma mensagem foi enviada.`,
      },
      { status: 409 },
    );
  }

  if (configuredGroupId !== OFFICIAL_GROUP_ID) {
    return NextResponse.json(
      {
        ok: false,
        instance: configuredInstance,
        expectedInstance: OFFICIAL_INSTANCE,
        groupId: configuredGroupId,
        expectedGroupId: OFFICIAL_GROUP_ID,
        apiConfigured: Boolean(apiUrl),
        apiKeyConfigured: Boolean(apiKey),
        error: `Envio bloqueado: EVOLUTION_GROUP_ID deve ser “${OFFICIAL_GROUP_ID}”. Nenhuma mensagem foi enviada.`,
      },
      { status: 409 },
    );
  }

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        instance: configuredInstance,
        expectedInstance: OFFICIAL_INSTANCE,
        groupId: configuredGroupId,
        apiConfigured: Boolean(apiUrl),
        apiKeyConfigured: Boolean(apiKey),
        error: 'A URL ou a chave da Evolution ainda não está configurada na Vercel.',
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      `${apiUrl}/group/fetchAllGroups/${encodeURIComponent(OFFICIAL_INSTANCE)}?getParticipants=false`,
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
          instance: OFFICIAL_INSTANCE,
          expectedInstance: OFFICIAL_INSTANCE,
          groupId: OFFICIAL_GROUP_ID,
          apiConfigured: true,
          apiKeyConfigured: true,
          error: `A Evolution respondeu ${response.status} ao validar “${OFFICIAL_INSTANCE}”. Confira se EVOLUTION_API_KEY pertence à instância CEAMI. Nenhuma mensagem foi enviada.`,
          details: payload,
        },
        { status: 502 },
      );
    }

    const groups = extractGroups(payload);
    const group = groups.find((item) => groupJid(item) === OFFICIAL_GROUP_ID);

    return NextResponse.json({
      ok: Boolean(group),
      instance: OFFICIAL_INSTANCE,
      expectedInstance: OFFICIAL_INSTANCE,
      groupId: OFFICIAL_GROUP_ID,
      groupFound: Boolean(group),
      groupName: group?.subject || group?.name || '',
      groupsFound: groups.length,
      apiConfigured: true,
      apiKeyConfigured: true,
      error: group
        ? null
        : `A instância “${OFFICIAL_INSTANCE}” conectou na Evolution, mas não encontrou o CEAMI GRUPO. Nenhuma mensagem foi enviada.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        instance: OFFICIAL_INSTANCE,
        expectedInstance: OFFICIAL_INSTANCE,
        groupId: OFFICIAL_GROUP_ID,
        apiConfigured: true,
        apiKeyConfigured: true,
        error: error instanceof Error ? error.message : 'Não foi possível validar a Evolution.',
      },
      { status: 500 },
    );
  }
}
