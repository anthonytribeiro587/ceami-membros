import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { UiRole } from '@/lib/types/ui-role';
import {
  CEAMI_MODULE_KEYS,
  type CeamiModuleAccess,
  type CeamiModuleAccessLevel,
  type CeamiModuleKey,
} from '@/lib/types/ceami-module';

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type CurrentProfileRow = {
  id: string;
  full_name: string;
  role: string;
  course_only: boolean;
  social_only: boolean;
  visitors_only: boolean;
  is_active: boolean;
};

export type CurrentCeamiAccess = {
  profileId: string;
  fullName: string;
  role: string;
  courseOnly: boolean;
  socialOnly: boolean;
  visitorsOnly: boolean;
  modules: CeamiModuleAccess[];
};

async function loadCurrentAccess(): Promise<CurrentCeamiAccess | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(_cookiesToSet: CookieToSet[]) {
        // O middleware renova a sessão antes da renderização.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, course_only, social_only, visitors_only, is_active')
    .eq('id', user.id)
    .maybeSingle();

  const profile = data as CurrentProfileRow | null;
  if (!profile || profile.is_active !== true) return null;

  const modules: CeamiModuleAccess[] = [];

  if (profile.role === 'admin') {
    modules.push(
      ...CEAMI_MODULE_KEYS.map((moduleKey) => ({
        moduleKey,
        accessLevel: 'manager' as CeamiModuleAccessLevel,
      })),
    );
  } else {
    const { data: accessRows, error: accessError } = await supabase
      .from('profile_module_access')
      .select('module_key, access_level, can_access')
      .eq('profile_id', profile.id)
      .eq('can_access', true);

    for (const row of accessRows || []) {
      const moduleKey = String(row.module_key) as CeamiModuleKey;
      if (!CEAMI_MODULE_KEYS.includes(moduleKey)) continue;
      const accessLevel: CeamiModuleAccessLevel =
        row.access_level === 'manager' ? 'manager' : 'viewer';
      modules.push({ moduleKey, accessLevel });
    }

    // Compatibilidade temporária para perfis criados antes da matriz de módulos.
    if (accessError && modules.length === 0) {
      if (profile.visitors_only) modules.push({ moduleKey: 'welcome', accessLevel: 'manager' });
      else if (profile.course_only) modules.push({ moduleKey: 'courses', accessLevel: 'manager' });
      else if (profile.social_only) modules.push({ moduleKey: 'social', accessLevel: 'manager' });
      else modules.push({ moduleKey: 'members', accessLevel: 'viewer' });
    }
  }

  return {
    profileId: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    courseOnly: profile.course_only,
    socialOnly: profile.social_only,
    visitorsOnly: profile.visitors_only,
    modules,
  };
}

export async function getCurrentCeamiAccess() {
  return loadCurrentAccess();
}

/**
 * Retorna apenas uma dica de interface para a renderização inicial.
 * A autorização real continua no middleware e nas RLS.
 */
export async function getCurrentUiRole(): Promise<UiRole> {
  const access = await loadCurrentAccess();
  if (!access) return null;
  if (access.role === 'admin') return 'admin';
  return 'member';
}

export async function hasCurrentModuleAccess(
  moduleKey: CeamiModuleKey,
  manage = false,
): Promise<boolean> {
  const access = await loadCurrentAccess();
  if (!access) return false;
  if (access.role === 'admin') return true;

  const module = access.modules.find((item) => item.moduleKey === moduleKey);
  if (!module) return false;
  return !manage || module.accessLevel === 'manager';
}
