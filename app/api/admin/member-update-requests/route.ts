import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServiceClient, publicErrorMessage } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type UpdateRequestRow = {
  id: string;
  member_id: string;
  proposed_data: Record<string, unknown> | null;
  status: string;
  source: string | null;
  updated_at: string | null;
};

const MEMBER_SELECT = 'id,full_name,birth_date,phone,email,address,neighborhood,city,marital_status,spouse_name,has_children,children_names,water_baptized,holy_spirit_baptized,fundamentos_fe,talents';
const EDITABLE_FIELD_SET = new Set([
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

  const { data: { user } } = await supabase.auth.getUser();
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
    ? value as Record<string, unknown>
    : {};
}

async function migrateLegacyPending(service: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data: pending, error } = await service
    .from('member_update_requests')
    .select('id,member_id,proposed_data,status,source,updated_at')
    .eq('status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);
  const rows = (pending || []) as UpdateRequestRow[];
  if (!rows.length) return;

  const memberIds = Array.from(new Set(rows.map(row => row.member_id).filter(Boolean)));
  const { data: members, error: membersError } = await service
    .from('members')
    .select(MEMBER_SELECT)
    .in('id', memberIds);

  if (membersError) throw new Error(membersError.message);
  const membersById = new Map<string, Record<string, unknown>>();
  for (const member of (members || [])) {
    const record = member as unknown as Record<string, unknown>;
    membersById.set(String(record.id), record);
  }

  for (const row of rows) {
    const member = membersById.get(row.member_id);
    if (!member) continue;

    const raw = asObject(row.proposed_data);
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (EDITABLE_FIELD_SET.has(key)) updates[key] = value;
    }

    if (!Object.keys(updates).length) {
      await service
        .from('member_update_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending');
      continue;
    }

    const before: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) before[key] = member[key] ?? null;

    const now = new Date().toISOString();
    const { error: updateError } = await service
      .from('members')
      .update({ ...updates, updated_at: now })
      .eq('id', row.member_id);

    if (updateError) {
      console.error('Legacy public update migration failed:', updateError.message);
      continue;
    }

    Object.assign(member, updates);

    const { error: historyError } = await service
      .from('member_update_requests')
      .update({
        status: 'approved',
        proposed_data: { before, after: updates },
        source: 'public_lookup',
        updated_at: now,
      })
      .eq('id', row.id)
      .eq('status', 'pending');

    if (historyError) console.error('Legacy update history migration failed:', historyError.message);
  }
}

export async function GET() {
  if (!(await isAdmin())) return unauthorized();

  const service = getServiceClient();
  if (!service) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });

  try {
    await migrateLegacyPending(service);

    const { data: rowsData, error } = await service
      .from('member_update_requests')
      .select('id,member_id,proposed_data,status,source,updated_at')
      .eq('status', 'approved')
      .eq('source', 'public_lookup')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    const rows = (rowsData || []) as UpdateRequestRow[];
    const memberIds = Array.from(new Set(rows.map(row => row.member_id).filter(Boolean)));
    const membersById = new Map<string, Record<string, unknown>>();

    if (memberIds.length) {
      const { data: members, error: membersError } = await service
        .from('members')
        .select('id,full_name')
        .in('id', memberIds);

      if (membersError) throw new Error(membersError.message);
      for (const member of (members || [])) {
        const record = member as unknown as Record<string, unknown>;
        membersById.set(String(record.id), record);
      }
    }

    return NextResponse.json(
      {
        history: rows.map(row => ({
          ...row,
          proposed_data: asObject(row.proposed_data),
          member: membersById.get(row.member_id) || null,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Admin member update history read error:', error);
    const publicError = publicErrorMessage(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
