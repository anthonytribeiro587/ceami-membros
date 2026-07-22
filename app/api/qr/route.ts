import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rawData = request.nextUrl.searchParams.get('data')?.trim() || '';

  if (!rawData || rawData.length > 2048) {
    return NextResponse.json({ error: 'Link de check-in inválido.' }, { status: 400 });
  }

  let checkinUrl: URL;
  try {
    checkinUrl = new URL(rawData);
  } catch {
    return NextResponse.json({ error: 'Link de check-in inválido.' }, { status: 400 });
  }

  const sameHost = checkinUrl.host === request.nextUrl.host;
  const validProtocol = checkinUrl.protocol === 'https:' || checkinUrl.protocol === 'http:';
  const validPath = /^\/checkin\/[0-9a-f-]{20,}$/i.test(checkinUrl.pathname);

  if (!sameHost || !validProtocol || !validPath) {
    return NextResponse.json({ error: 'Link de check-in não autorizado.' }, { status: 403 });
  }

  const providerUrl = new URL('https://api.qrserver.com/v1/create-qr-code/');
  providerUrl.searchParams.set('size', '420x420');
  providerUrl.searchParams.set('margin', '14');
  providerUrl.searchParams.set('format', 'png');
  providerUrl.searchParams.set('data', checkinUrl.toString());

  try {
    const response = await fetch(providerUrl, {
      cache: 'no-store',
      headers: { Accept: 'image/png,image/*' },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Não foi possível gerar o QR Code.' }, { status: 502 });
    }

    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/png',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível gerar o QR Code.' }, { status: 502 });
  }
}
