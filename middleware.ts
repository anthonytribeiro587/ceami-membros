import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PAGES = ['/login', '/login-cursos', '/integra', '/consultar'];
const PUBLIC_API_PATHS = [
  '/api/integra',
  '/api/public/check-member',
  '/api/public/update-member',
  '/api/public/course-checkin',
  '/api/birthdays/automatic',
  '/api/automations/automatic',
];
const ADMIN_PATHS = ['/teste-aniversario', '/ajustes-aniversario', '/automacoes', '/materiais'];
const ADMIN_API_PATHS = [
  '/api/birthdays/test',
  '/api/birthdays/official',
  '/api/birthdays/settings',
  '/api/birthdays/history',
  '/api/birthdays/diagnostics',
  '/api/automations',
];

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function matchesPath(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function unavailable() {
  return new NextResponse('Serviço temporariamente indisponível.', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    matchesPath(pathname, PUBLIC_PAGES) ||
    matchesPath(pathname, PUBLIC_API_PATHS) ||
    pathname.startsWith('/checkin/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Segurança fail-closed: uma configuração quebrada nunca libera o painel.
  if (!url || !key) {
    console.error('Supabase public environment variables are missing.');
    return unavailable();
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = pathname === '/cursos' || pathname.startsWith('/cursos/')
      ? '/login-cursos'
      : '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, course_only, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active !== true) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Conta sem aprovação de acesso.' }, { status: 403 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('acesso', 'aguardando-aprovacao');
    return NextResponse.redirect(loginUrl);
  }

  const isAdmin = profile.role === 'admin';
  const isCourseOnly = Boolean(profile.course_only);
  const isCoursesPath = pathname === '/cursos' || pathname.startsWith('/cursos/');

  if (isCoursesPath && !isAdmin && !isCourseOnly) {
    const coursesLoginUrl = request.nextUrl.clone();
    coursesLoginUrl.pathname = '/login-cursos';
    coursesLoginUrl.searchParams.set('acesso', 'negado');
    return NextResponse.redirect(coursesLoginUrl);
  }

  if (isCourseOnly && !isCoursesPath) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Conta restrita ao portal de Cursos.' }, { status: 403 });
    }

    const coursesUrl = request.nextUrl.clone();
    coursesUrl.pathname = '/cursos';
    coursesUrl.search = '';
    return NextResponse.redirect(coursesUrl);
  }

  const requiresAdmin =
    matchesPath(pathname, ADMIN_PATHS) || matchesPath(pathname, ADMIN_API_PATHS);

  if (requiresAdmin && !isAdmin) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Acesso restrito ao administrador.' },
        { status: 403 },
      );
    }

    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.searchParams.set('acesso', 'negado');
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
