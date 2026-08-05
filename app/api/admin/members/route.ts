import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getServiceClient,
  publicErrorMessage,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PatchBody = {
  originalName?: unknown;
  data?: unknown;
};

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const MEMBER_FIELDS = [
  'id',
  'full_name',
  'phone',
  'email',
  'birth_date',
  'integra_date',
  'marital_status',
  'spouse_name',
  'address',
  'neighborhood',
  'city',
  'zip_code',
  'has_children',
  'children_names',
  'previous_church',
  'previous_church_name',
  'water_baptized',
  'baptism_church',
  'baptism_date',
  'holy_spirit_baptized',
  'fundamentos_fe',
  'fundamentos_fe_date',
  'talents',
  'ministry',
  'notes',
  'status',
  'joined_at',
  'created_at',
  'updated_at',
].join(',');

function cleanText(value: unknown, max: number) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function validDate(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('INVALID_DATE');
  const parsed = new Date(`${text}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error('INVALID_DATE');
  }
  return text;
}

async function isAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Route handlers nem sempre podem persistir cookies. A leitura da sessão continua válida.
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active,course_only')
    .eq('id', user.id)
    .maybeSingle();

  return Boolean(profile && profile.role === 'admin' && profile.is_active === true && !profile.course_only);
}

function unauthorized() {
  return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return unauthorized();

  const service = getServiceClient();
  if (!service) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });

  const name = request.nextUrl.searchParams.get('name')?.trim() || '';
  const integraDate = request.nextUrl.searchParams.get('integraDate')?.trim() || '';

  if (!name && !integraDate) {
    return NextResponse.json({ error: 'Informe o membro ou a data do Integra.' }, { status: 400 });
  }

  try {
    let query = service
      .from('members')
      .select(MEMBER_FIELDS)
      .neq('status', 'inativo');

    if (integraDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(integraDate)) {
        return NextResponse.json({ error: 'Data do Integra inválida.' }, { status: 400 });
      }
      query = query.eq('integra_date', integraDate).order('full_name', { ascending: true });
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return NextResponse.json({ members: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (name.length < 3 || /[%_]/.test(name)) {
      return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 });
    }

    const { data, error } = await query.ilike('full_name', name).limit(2);
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
    if (data.length > 1) {
      return NextResponse.json(
        { error: 'Há mais de um cadastro com este nome. Abra a ficha pelo cadastro correto.' },
        { status: 409 },
      );
    }

    return NextResponse.json({ member: data[0] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Admin member read error:', error);
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }
  if (!(await isAdmin())) return unauthorized();

  const service = getServiceClient();
  if (!service) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });

  try {
    const body = await readLimitedJson<PatchBody>(request, 20_000);
    const originalName = String(body.originalName ?? '').trim();
    const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};

    if (originalName.length < 3 || /[%_]/.test(originalName)) {
      return NextResponse.json({ error: 'Não foi possível identificar o membro.' }, { status: 400 });
    }

    const { data: matches, error: lookupError } = await service
      .from('members')
      .select('id,full_name,status')
      .ilike('full_name', originalName)
      .neq('status', 'inativo')
      .limit(2);

    if (lookupError) throw new Error(lookupError.message);
    if (!matches?.length) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
    if (matches.length > 1) {
      return NextResponse.json({ error: 'Há mais de um membro com este nome.' }, { status: 409 });
    }

    const fullName = cleanText(data.name, 180);
    if (!fullName || fullName.length < 3) {
      return NextResponse.json({ error: 'Informe o nome completo.' }, { status: 400 });
    }

    const email = cleanText(data.email, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    }

    const phone = cleanText(data.phone, 30);
    if (phone && phone.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'Informe o WhatsApp com DDD.' }, { status: 400 });
    }

    const updates = {
      full_name: fullName,
      phone,
      email: email?.toLowerCase() || null,
      birth_date: validDate(data.birthDate),
      integra_date: validDate(data.integraDate),
      address: cleanText(data.address, 250),
      neighborhood: cleanText(data.neighborhood, 120),
      city: cleanText(data.city, 120),
      marital_status: cleanText(data.maritalStatus, 50),
      water_baptized: Boolean(data.waterBaptized),
      holy_spirit_baptized: Boolean(data.holySpiritBaptized),
      fundamentos_fe: Boolean(data.fundamentosFe),
      notes: cleanText(data.notes, 1000),
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error } = await service
      .from('members')
      .update(updates)
      .eq('id', matches[0].id)
      .select(MEMBER_FIELDS)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, member: updated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_DATE') {
      return NextResponse.json({ error: 'Informe uma data válida.' }, { status: 400 });
    }
    console.error('Admin member update error:', error);
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
