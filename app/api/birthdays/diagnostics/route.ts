import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OFFICIAL_INSTANCE = 'ceamirs';
const OFFICIAL_GROUP_ID = '120363148206200208@g.us';

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 2000) };
  }
}

function findGroupData(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const candidate = value.group || value.data || value.response || value;
  return candidate && typeof candidate === 'object'
    ? (candidate as Record<string, unknown>)
    : null;
}

function extractGroupId(group: Record<string, unknown> | null) {
  if (!group) return '';
  const rawId = group.id || group.jid || group.remoteJid;
  if (typeof rawId === 'string') return rawId;
  if (rawId && typeof rawId === 'object') {
    const objectId = rawId as Record<string, unknown>;
    if (typeof objectId._serialized === 'string') return objectId._serialized;
  }
  return '';
}

export async function GET() {
  const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY || '';
  const configuredInstance = process.env.EVOLUTION_INSTANCE || '';
  const configuredGroupId = process.env.EVOLUTION_GROUP_ID || process.env.EVOLUTION_TEST_GROUP_ID || '';

  if (configuredInstance !== OFFICIAL_INSTANCE) {
    return NextResponse.json(
      {
        ok: false,
        instance: configuredInstance,
        expectedInstance: OFFICIAL_INSTANCE,
        groupId: configuredGroupId || OFFICIAL_GROUP_ID,
        error: `Envio bloqueado: a instância oficial deve ser “${OFFICIAL_INSTANCE}”. Nenhuma mensagem foi enviada.`,
      },
      { status: 409 },
    );
  }

  if (configuredGroupId !== OFFICIAL_GROUP_ID) {
    return NextResponse.json(
      {
        ok: false,
        instance: configuredInstance,
        groupId: configuredGroupId,
        expectedGroupId: OFFICIAL_GROUP_ID,
        error: `Envio bloqueado: o grupo oficial deve ser “${OFFICIAL_GROUP_ID}”. Nenhuma mensagem foi enviada.`,
      },
      { status: 409 },
    );
  }

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        instance: configuredInstance,
        groupId: configuredGroupId,
        error: 'A URL ou a chave da Evolution não está configurada na Vercel.',
      },
      { status: 503 },
    );
  }

  try {
    const stateResponse = await fetch(
      `${apiUrl}/instance/connectionState/${encodeURIComponent(OFFICIAL_INSTANCE)}`,
      { headers: { apikey: apiKey }, cache: 'no-store' },
    );
    const statePayload = await readJson(stateResponse);
    const state = statePayload && typeof statePayload === 'object'
      ? String((statePayload as { instance?: { state?: string }; state?: string }).instance?.state || (statePayload as { state?: string }).state || '').toLowerCase()
      : '';

    if (!stateResponse.ok || state !== 'open') {
      return NextResponse.json(
        {
          ok: false,
          instance: OFFICIAL_INSTANCE,
          groupId: OFFICIAL_GROUP_ID,
          connectionState: state || 'desconhecido',
          error: `A instância “${OFFICIAL_INSTANCE}” não está conectada. Estado: ${state || `HTTP ${stateResponse.status}`}. Nenhuma mensagem foi enviada.`,
          details: statePayload,
        },
        { status: 409 },
      );
    }

    const groupResponse = await fetch(
      `${apiUrl}/group/findGroupInfos/${encodeURIComponent(OFFICIAL_INSTANCE)}?groupJid=${encodeURIComponent(OFFICIAL_GROUP_ID)}`,
      { headers: { apikey: apiKey }, cache: 'no-store' },
    );
    const groupPayload = await readJson(groupResponse);
    const group = findGroupData(groupPayload);
    const returnedId = extractGroupId(group);
    const groupName = String(group?.subject || group?.name || 'CEAMI GRUPO');

    if (!groupResponse.ok || (returnedId && returnedId !== OFFICIAL_GROUP_ID)) {
      return NextResponse.json(
        {
          ok: false,
          instance: OFFICIAL_INSTANCE,
          groupId: OFFICIAL_GROUP_ID,
          connectionState: state,
          error: `A instância está conectada, mas a Evolution não confirmou o CEAMI GRUPO pela consulta direta (${groupResponse.status}). Nenhuma mensagem foi enviada.`,
          details: groupPayload,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      instance: OFFICIAL_INSTANCE,
      groupId: OFFICIAL_GROUP_ID,
      groupFound: true,
      groupName,
      connectionState: state,
      validationMethod: 'findGroupInfos',
      error: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        instance: OFFICIAL_INSTANCE,
        groupId: OFFICIAL_GROUP_ID,
        error: error instanceof Error ? error.message : 'Não foi possível validar a Evolution.',
      },
      { status: 500 },
    );
  }
}
