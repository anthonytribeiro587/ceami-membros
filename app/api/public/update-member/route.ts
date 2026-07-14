import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });

    const memberId = verifyToken(String(body?.token ?? ''), key);
    if (!memberId) return NextResponse.json({ error: 'Sua sessão expirou. Faça a consulta novamente.' }, { status: 401 });

    const changes = isPlainObject(body?.changes) ? body.changes : {};
    const proposedData: Record<string, unknown> = {};

    if ('birthDate' in changes) {
      const value = String(changes.birthDate || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NextResponse.json({ error: 'Informe uma data de nascimento válida.' }, { status: 400 });
      proposedData.birth_date = value;
    }

    if ('phone' in changes) {
      const value = cleanText(changes.phone, 30);
      if (!value) return NextResponse.json({ error: 'Informe o novo WhatsApp.' }, { status: 400 });
      proposedData.phone = value;
    }

    if ('email' in changes) {
      const value = cleanText(changes.email, 160);
      if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
      proposedData.email = value.toLowerCase();
    }

    if ('address' in changes) {
      const value = isPlainObject(changes.address) ? changes.address : {};
      const address = cleanText(value.address, 250);
      const neighborhood = cleanText(value.neighborhood, 120);
      const city = cleanText(value.city, 120);
      if (!address && !neighborhood && !city) return NextResponse.json({ error: 'Informe ao menos uma informação de endereço.' }, { status: 400 });
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
        if (typeof changes[requestKey] !== 'boolean') return NextResponse.json({ error: 'Selecione Sim ou Não nos campos escolhidos.' }, { status: 400 });
        proposedData[databaseKey] = changes[requestKey];
      }
    }

    if ('talents' in changes) proposedData.talents = cleanText(changes.talents, 1000);

    if ('ministries' in changes) {
      if (!Array.isArray(changes.ministries)) return NextResponse.json({ error: 'Seleção de ministérios inválida.' }, { status: 400 });
      proposedData.ministry = changes.ministries.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 20);
    }

    const notes = cleanText(body?.notes, 1000);
    if (notes) proposedData.notes = notes;

    const changedKeys = Object.keys(proposedData).filter(keyName => keyName !== 'notes');
    if (!changedKeys.length) return NextResponse.json({ error: 'Selecione pelo menos uma informação para corrigir ou completar.' }, { status: 400 });

    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: existing } = await supabase
      .from('member_update_requests')
      .select('id')
      .eq('member_id', memberId)
      .eq('status', 'pending')
      .maybeSingle();

    const requestPayload = {
      proposed_data: proposedData,
      updated_at: new Date().toISOString(),
    };

    const query = existing
      ? supabase.from('member_update_requests').update(requestPayload).eq('id', existing.id)
      : supabase.from('member_update_requests').insert({ member_id: memberId, proposed_data: proposedData, status: 'pending', source: 'public_lookup' });

    const { error } = await query;
    if (error) {
      console.error('Member update request error:', error.message);
      return NextResponse.json({ error: 'Não foi possível enviar sua solicitação.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pendingReview: true });
  } catch (error) {
    console.error('Member update request error:', error);
    return NextResponse.json({ error: 'Não foi possível enviar sua solicitação.' }, { status: 500 });
  }
}
