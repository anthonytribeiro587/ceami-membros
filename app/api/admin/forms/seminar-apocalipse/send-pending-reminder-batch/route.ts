import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import { requestComesFromSameSite } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
  }

  if ((await getCurrentUiRole()) !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
  }

  return NextResponse.json(
    {
      error:
        'A cobrança automática dos pagamentos pendentes foi desativada. Nenhuma mensagem de cobrança será enviada pelo NextLead.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
