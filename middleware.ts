import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PAGES = [
  '/login',
  '/login-cursos',
  '/social/login',
  '/visitantes/login',
  '/social/design-preview',
  '/integra',
  '/consultar',
  '/f',
  '/servicos/solicitar',
];
const PUBLIC_API_PATHS = [
  '/api/integra',
  '/api/public/check-member',
  '/api/public/update-member',
  '/api/public/course-checkin',
  '/api/public/forms',
  '/api/birthdays/automatic',
  '/api/automations/automatic',
];

const ADMIN_PATHS = ['/teste-aniversario', '/ajustes-aniversario', '/automacoes', '/materiais', '/acessos'];
const ADMIN_API_PATHS = [
  '/api/admin',
  '/api/birthdays/test',
  '/api/birthdays/official',
  '/api/birthdays/settings',
  '/api/birthdays/history',
  '/api/messages/history',
  '/api/birthdays/diagnostics',
  '/api/automations',
];

type ModuleKey = 'members' | 'social' | 'events' | 'services' | 'welcome' | 'courses';

type RequiredModule = {
  key: ModuleKey;
  manage: boolean;
};

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function matchesPath(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function requiredModuleForPath(pathname: string): RequiredModule | null {
  if (pathname === '/membros' || pathname.startsWith('/membros/')) {
    return { key: 'members', manage: false };
  }

  if (pathname === '/social' || pathname.startsWith('/social/')) {
    return { key: 'social', manage: true };
  }

  if (
    pathname === '/eventos' ||
    pathname.startsWith('/eventos/') ||
    pathname === '/formularios' ||
    pathname.startsWith('/formularios/') ||
    pathname === '/api/admin/events' ||
    pathname.startsWith('/api/admin/events/') ||
    pathname === '/api/admin/forms' ||
    pathname.startsWith('/api/admin/forms/') ||
    pathname === '/api/admin/form-submissions' ||
    pathname.startsWith('/api/admin/form-submissions/') ||
    pathname === '/api/admin/form-payments' ||
    pathname.startsWith('/api/admin/form-payments/')
  ) {
    return { key: 'events', manage: true };
  }

  if (
    pathname === '/servicos' ||
    pathname.startsWith('/servicos/') ||
    pathname === '/api/admin/services' ||
    pathname.startsWith('/api/admin/services/')
  ) {
    return { key: 'services', manage: true };
  }

  if (
    pathname === '/acolhimentos' ||
    pathname.startsWith('/acolhimentos/') ||
    pathname === '/visitantes' ||
    pathname.startsWith('/visitantes/')
  ) {
    return { key: 'welcome', manage: true };
  }

  if (pathname === '/cursos' || pathname.startsWith('/cursos/')) {
    return { key: 'courses', manage: true };
  }

  return null;
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
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, course_only, social_only, visitors_only, is_active')
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
  const requiredModule = requiredModuleForPath(pathname);

  if (requiredModule && !isAdmin) {
    const { data: moduleAccess, error: moduleError } = await supabase
      .from('profile_module_access')
      .select('access_level, can_access')
      .eq('profile_id', user.id)
      .eq('module_key', requiredModule.key)
      .maybeSingle();

    const legacyFallback =
      requiredModule.key === 'social'
        ? profile.social_only === true
        : requiredModule.key === 'welcome'
          ? profile.visitors_only === true
          : requiredModule.key === 'courses'
            ? profile.course_only === true
            : requiredModule.key === 'members'
              ? profile.social_only === false &&
                profile.course_only === false &&
                profile.visitors_only === false
              : false;

    const canAccess =
      moduleAccess?.can_access === true &&
      (!requiredModule.manage || moduleAccess.access_level === 'manager');

    const allowed = moduleError ? legacyFallback : canAccess;

    if (!allowed) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Conta sem acesso a este módulo.' }, { status: 403 });
      }

      const portalUrl = request.nextUrl.clone();
      portalUrl.pathname = '/';
      portalUrl.search = '';
      portalUrl.searchParams.set('selecionar', '1');
      portalUrl.searchParams.set('acesso', 'negado');
      return NextResponse.redirect(portalUrl);
    }
  }

  const requiresAdmin =
    !requiredModule &&
    (matchesPath(pathname, ADMIN_PATHS) || matchesPath(pathname, ADMIN_API_PATHS));

  if (requiresAdmin && !isAdmin) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Acesso restrito ao administrador.' },
        { status: 403 },
      );
    }

    const portalUrl = request.nextUrl.clone();
    portalUrl.pathname = '/';
    portalUrl.search = '';
    portalUrl.searchParams.set('selecionar', '1');
    portalUrl.searchParams.set('acesso', 'negado');
    return NextResponse.redirect(portalUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
