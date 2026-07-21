import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OFFICIAL_INSTANCE = 'ceamirs';
const OFFICIAL_GROUP_ID = '120363148206200208@g.us';
const OFFICIAL_GROUP_NAME = 'CEAMI GRUPO';

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
        error: `A instância da Vercel deve ser “${OFFICIAL_INSTANCE}”. Nenhuma mensagem foi enviada.`,
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
        error: `O grupo oficial deve ser “${OFFICIAL_GROUP_ID}”. Nenhuma mensagem foi enviada.`,
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

  return NextResponse.json({
    ok: true,
    instance: OFFICIAL_INSTANCE,
    groupId: OFFICIAL_GROUP_ID,
    groupFound: true,
    groupName: OFFICIAL_GROUP_NAME,
    validationMethod: 'configuration',
    message: 'Configuração oficial pronta. A confirmação real acontece somente no envio.',
    error: null,
  });
}
