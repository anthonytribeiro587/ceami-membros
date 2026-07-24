import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { UiRole } from '@/lib/types/ui-role';

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Retorna apenas uma dica de interface para a renderização inicial.
 * A autorização real continua sendo aplicada pelo middleware e pelas RLS.
 */
export async function getCurrentUiRole(): Promise<UiRole> {
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
        // Server Components não podem atualizar cookies. O middleware já
        // executa a renovação da sessão antes da renderização da página.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, course_only, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.is_active !== true) return null;
  if (profile.role === 'admin') return 'admin';
  if (profile.course_only) return 'course';
  return 'member';
}
