import { NextResponse } from 'next/server';
import { evolutionConfigured, getEvolutionConfig } from '@/lib/server/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getEvolutionConfig();
  const configured = evolutionConfigured(config) && Boolean(config.defaultGroupId);

  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        instance: config.instance,
        groupId: config.defaultGroupId,
        error:
          'Confira EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE e EVOLUTION_GROUP_ID na Vercel.',
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    instance: config.instance,
    groupId: config.defaultGroupId,
    groupFound: true,
    groupName: 'Grupo configurado',
    validationMethod: 'environment',
    message: 'A configuração da Evolution está preenchida. Use o envio de teste para confirmar a conexão.',
    error: null,
  });
}
