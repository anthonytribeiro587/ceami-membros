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

const EDITABLE_FIELDS = [
  'birth_date',
  'phone',
  'email',
  'address',
  'neighborhood',
  'city',
  'marital_status',
  'spouse_name',
  'has_children',
  'children_names',
  'water_baptized',
  'holy_spirit_baptized',
  'fundamentos_fe',
  'talents',
] as const;

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
        { error: 'Muitas alterações em pouco tempo. Aguarde alguns minutos.' },
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
        { error: 'Este cadastro já recebeu muitas alterações hoje. Tente novamente mais tarde.' },
        { status: 429, headers: { 'Retry-After': '86400' } },
      );
    }

    const changes = isPlainObject(body.changes) ? body.changes : {};

    if ('ministries' in changes || 'ministry' in changes) {
      return NextResponse.json(
        { error: 'Os ministérios são definidos pela liderança e não podem ser alterados nesta página.' },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};

    if ('birthDate' in changes) {
      const value = normalizeDateInput(changes.birthDate);
      if (!value) return NextResponse.json({ error: 'Informe uma data de nascimento válida.' }, { status: 400 });
      updates.birth_date = value;
    }

    if ('phone' in changes) {
      const value = cleanText(changes.phone, 30);
      if (!value || value.replace(/\D/g, '').length < 10) {
        return NextResponse.json({ error: 'Informe o novo WhatsApp com DDD.' }, { status: 400 });
      }
      updates.phone = value;
    }

    if ('email' in changes) {
      const value = cleanText(changes.email, 160);
      if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
      }
      updates.email = value.toLowerCase();
    }

    if ('address' in changes) {
      const value = isPlainObject(changes.address) ? changes.address : {};
      const address = cleanText(value.address, 250);
      const neighborhood = cleanText(value.neighborhood, 120);
      const city = cleanText(value.city, 120);
      if (!address && !neighborhood && !city) {
        return NextResponse.json({ error: 'Informe ao menos uma informação de endereço.' }, { status: 400 });
      }
      updates.address = address;
      updates.neighborhood = neighborhood;
      updates.city = city;
    }

    if ('family' in changes) {
      const value = isPlainObject(changes.family) ? changes.family : {};
      updates.marital_status = cleanText(value.maritalStatus, 50);
      updates.spouse_name = cleanText(value.spouseName, 180);
      if (typeof value.hasChildren === 'boolean') updates.has_children = value.hasChildren;
      updates.children_names = cleanText(value.childrenNames, 500);
    }

    const booleanFields: Array<[string, string]> = [
      ['waterBaptized', 'water_baptized'],
      ['holySpiritBaptized', 'holy_spirit_baptized'],
      ['fundamentosFe', 'fundamentos_fe'],
    ];

    for (const [requestKey, databaseKey] of booleanFields) {
      if (!(requestKey in changes)) continue;
      if (typeof changes[requestKey] !== 'boolean') {
        return NextResponse.json({ error: 'Selecione Sim ou Não nos campos escolhidos.' }, { status: 400 });
      }
      updates[databaseKey] = changes[requestKey];
    }

    if ('talents' in changes) updates.talents = cleanText(changes.talents, 1000);

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nenhuma alteração válida foi informada.' }, { status: 400 });
    }

    const { data: currentMember, error: currentError } = await service
      .from('members')
      .select(`id,full_name,${EDITABLE_FIELDS.join(',')}`)
      .eq('id', memberId)
      .maybeSingle();

    if (currentError) throw new Error(currentError.message);
    if (!currentMember) return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });

    const before: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) before[key] = (currentMember as Record<string, unknown>)[key] ?? null;

    const now = new Date().toISOString();
    const { data: updatedMember, error: updateError } = await service
      .from('members')
      .update({ ...updates, updated_at: now })
      .eq('id', memberId)
      .select(`id,full_name,${EDITABLE_FIELDS.join(',')}`)
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updatedMember) return NextResponse.json({ error: 'Não foi possível atualizar o cadastro.' }, { status: 500 });

    const { error: historyError } = await service.from('member_update_requests').insert({
      member_id: memberId,
      proposed_data: { before, after: updates },
      status: 'approved',
      source: 'public_lookup',
      updated_at: now,
    });

    if (historyError) {
      console.error('Member update history error:', historyError.message);
    }

    return NextResponse.json(
      {
        ok: true,
        applied: true,
        historyLogged: !historyError,
        savedFields: Object.keys(updates),
        member: updatedMember,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const publicError = publicErrorMessage(error);
    console.error('Member direct update error:', error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
