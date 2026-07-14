import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/integra', '/consultar'];
const ADMIN_PATHS = ['/teste-aniversario', '/ajustes-aniversario', '/materiais'];
const ADMIN_API_PATHS = ['/api/birthdays/test', '/api/birthdays/settings', '/api/birthdays/history'];

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname === '/api/birthdays/automatic' ||
    pathname.startsWith('/api/public/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Supabase public environment variables are missing.');
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requiresAdmin =
    ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    ADMIN_API_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (requiresAdmin) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
      }
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      homeUrl.searchParams.set('acesso', 'negado');
      return NextResponse.redirect(homeUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
