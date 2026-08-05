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

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type ReviewBody = {
  id?: unknown;
  action?: unknown;
};

type UpdateRequestRow = {
  id: string;
  member_id: string;
  proposed_data: Record<string, unknown> | null;
  status: string;
  source: string | null;
  updated_at: string | null;
};

const CURRENT_MEMBER_FIELDS = [
  'id',
  'full_name',
  'phone',
  'email',
  'birth_date',
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
  'ministry',
  'notes',
  'status',
].join(',');

const APPROVABLE_FIELDS = new Set([
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
  'ministry',
  'notes',
]);

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
          // A leitura da sessão continua válida mesmo quando o handler não pode persistir cookies.
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET() {
  if (!(await isAdmin())) return unauthorized();

  const service = getServiceClient();
  if (!service) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });

  try {
    const { data: requests, error } = await service
      .from('member_update_requests')
      .select('id,member_id,proposed_data,status,source,updated_at')
      .eq('status', 'pending')
      .order('updated_at', { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (requests || []) as UpdateRequestRow[];
    const memberIds = Array.from(new Set(rows.map((request) => request.member_id).filter(Boolean)));
    const membersById = new Map<string, Record<string, unknown>>();

    if (memberIds.length) {
      const { data: members, error: membersError } = await service
        .from('members')
        .select(CURRENT_MEMBER_FIELDS)
        .in('id', memberIds);

      if (membersError) throw new Error(membersError.message);
      for (const member of (members || []) as unknown as Array<Record<string, unknown>>) {
        membersById.set(String(member.id), member);
      }
    }

    return NextResponse.json(
      {
        requests: rows.map((request) => ({
          ...request,
          proposed_data: asObject(request.proposed_data),
          member: membersById.get(request.member_id) || null,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Admin member update requests read error:', error);
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
    const body = await readLimitedJson<ReviewBody>(request, 4_000);
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim();

    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Solicitação ou ação inválida.' }, { status: 400 });
    }

    const { data: requestRow, error: lookupError } = await service
      .from('member_update_requests')
      .select('id,member_id,proposed_data,status')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);
    if (!requestRow) return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
    if (requestRow.status !== 'pending') {
      return NextResponse.json({ error: 'Esta solicitação já foi analisada.' }, { status: 409 });
    }

    const now = new Date().toISOString();

    if (action === 'reject') {
      const { error: rejectError } = await service
        .from('member_update_requests')
        .update({ status: 'rejected', updated_at: now })
        .eq('id', id)
        .eq('status', 'pending');

      if (rejectError) throw new Error(rejectError.message);
      return NextResponse.json({ ok: true, status: 'rejected' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const proposed = asObject(requestRow.proposed_data);
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(proposed)) {
      if (APPROVABLE_FIELDS.has(key)) updates[key] = value;
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'A solicitação não possui alterações válidas.' }, { status: 400 });
    }

    updates.updated_at = now;

    const { data: updatedMember, error: memberError } = await service
      .from('members')
      .update(updates)
      .eq('id', requestRow.member_id)
      .select('id,full_name')
      .maybeSingle();

    if (memberError) throw new Error(memberError.message);
    if (!updatedMember) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });

    const { error: approveError } = await service
      .from('member_update_requests')
      .update({ status: 'approved', updated_at: now })
      .eq('id', id)
      .eq('status', 'pending');

    if (approveError) throw new Error(approveError.message);

    return NextResponse.json(
      { ok: true, status: 'approved', member: updatedMember },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Admin member update request review error:', error);
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
