import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  consumeRateLimit,
  getSecuritySecret,
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateBody = Record<string, unknown>;

function verifyToken(token: string, secret: string) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [memberId, expiresText, signature] = decoded.split('.');
    const expiresAt = Number(expiresText);
    if (!memberId || !expiresAt || !signature || Date.now() > expiresAt) return null;
    const expected = createHmac('sha256', secret).update(`${memberId}.${expiresAt}`).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return memberId;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, max = 500) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDateInput(value: unknown) {
  const raw = String(value ?? '').trim();
  let iso = '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    iso = raw;
  } else {
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!br) return '';
    iso = `${br[3]}-${br[2]}-${br[1]}`;
  }

  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return '';
  return iso;
}

export async function POST(request: NextRequest) {
  try {
    if (!requestComesFromSameSite(request)) {
      return NextResponse.json({ error: 'Origem da solicitação não permitida.' }, { status: 403 });
    }

    const allowed = await consumeRateLimit(request, 'member-update-request', 30 * 60, 20);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas solicitações. Aguarde alguns minutos.' },
        { status: 429, headers: { 'Retry-After': '1800' } },
      );
    }

    const body = await readLimitedJson<UpdateBody>(request, 16_000);
    const signingSecret = await getSecuritySecret('public_lookup_signing');
    const service = getServiceClient();
    if (!service || !signingSecret) {
      return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
    }

    const memberId = verifyToken(String(body.token ?? ''), signingSecret);
    if (!memberId) {
      return NextResponse.json({ error: 'Sua sessão expirou. Faça a consulta novamente.' }, { status: 401 });
    }

    const memberAllowed = await consumeRateLimit(request, 'member-update-id', 24 * 60 * 60, 30, memberId);
    if (!memberAllowed) {
      return NextResponse.json(
        { error: 'Já recebemos muitas alterações para este cadastro hoje. Aguarde a análise da equipe.' },
        { status: 429, headers: { 'Retry-After': '86400' } },
      );
    }

    const changes = isPlainObject(body.changes) ? body.changes : {};
    const proposedData: Record<string, unknown> = {};

    if ('birthDate' in changes) {
      const value = normalizeDateInput(changes.birthDate);
      if (!value) {
        return NextResponse.json({ error: 'Informe uma data de nascimento válida.' }, { status: 400 });
      }
      proposedData.birth_date = value;
    }

    if ('phone' in changes) {
      const value = cleanText(changes.phone, 30);
      if (!value || value.replace(/\D/g, '').length < 10) {
        return NextResponse.json({ error: 'Informe o novo WhatsApp com DDD.' }, { status: 400 });
      }
      proposedData.phone = value;
    }

    if ('email' in changes) {
      const value = cleanText(changes.email, 160);
      if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
      }
      proposedData.email = value.toLowerCase();
    }

    if ('address' in changes) {
      const value = isPlainObject(changes.address) ? changes.address : {};
      const address = cleanText(value.address, 250);
      const neighborhood = cleanText(value.neighborhood, 120);
      const city = cleanText(value.city, 120);
      if (!address && !neighborhood && !city) {
        return NextResponse.json({ error: 'Informe ao menos uma informação de endereço.' }, { status: 400 });
      }
      proposedData.address = address;
      proposedData.neighborhood = neighborhood;
      proposedData.city = city;
    }

    if ('family' in changes) {
      const value = isPlainObject(changes.family) ? changes.family : {};
      proposedData.marital_status = cleanText(value.maritalStatus, 50);
      proposedData.spouse_name = cleanText(value.spouseName, 180);
      if (typeof value.hasChildren === 'boolean') proposedData.has_children = value.hasChildren;
      proposedData.children_names = cleanText(value.childrenNames, 500);
    }

    const booleanFields: Array<[string, string]> = [
      ['waterBaptized', 'water_baptized'],
      ['holySpiritBaptized', 'holy_spirit_baptized'],
      ['fundamentosFe', 'fundamentos_fe'],
    ];
    for (const [requestKey, databaseKey] of booleanFields) {
      if (requestKey in changes) {
        if (typeof changes[requestKey] !== 'boolean') {
          return NextResponse.json({ error: 'Selecione Sim ou Não nos campos escolhidos.' }, { status: 400 });
        }
        proposedData[databaseKey] = changes[requestKey];
      }
    }

    if ('talents' in changes) proposedData.talents = cleanText(changes.talents, 1000);

    if ('ministries' in changes) {
      if (!Array.isArray(changes.ministries)) {
        return NextResponse.json({ error: 'Seleção de ministérios inválida.' }, { status: 400 });
      }
      proposedData.ministry = changes.ministries
        .map((item: unknown) => String(item).trim())
        .filter(Boolean)
        .slice(0, 20)
        .join(', ')
        .slice(0, 1000);
    }

    const notes = cleanText(body.notes, 1000);
    if (notes) proposedData.notes = notes;

    const changedKeys = Object.keys(proposedData).filter((keyName) => keyName !== 'notes');
    if (!changedKeys.length) {
      return NextResponse.json({ error: 'Selecione pelo menos uma informação para corrigir ou completar.' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await service
      .from('member_update_requests')
      .select('id, proposed_data')
      .eq('member_id', memberId)
      .eq('status', 'pending')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('Member update request lookup error:', existingError.message);
      return NextResponse.json({ error: 'Não foi possível preparar sua alteração.' }, { status: 500 });
    }

    const existingData = isPlainObject(existing?.proposed_data) ? existing.proposed_data : {};
    const mergedData = { ...existingData, ...proposedData };
    const now = new Date().toISOString();

    const query = existing
      ? service.from('member_update_requests').update({ proposed_data: mergedData, updated_at: now }).eq('id', existing.id)
      : service.from('member_update_requests').insert({
          member_id: memberId,
          proposed_data: mergedData,
          status: 'pending',
          source: 'public_lookup',
          updated_at: now,
        });

    const { error } = await query;
    if (error) {
      console.error('Member update request error:', error.message);
      return NextResponse.json({ error: 'Não foi possível salvar sua alteração.' }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, pendingReview: true, savedFields: Object.keys(proposedData) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const publicError = publicErrorMessage(error);
    console.error('Member update request error:', error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
