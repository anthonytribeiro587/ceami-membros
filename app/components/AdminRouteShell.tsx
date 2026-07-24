'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Cake,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { UiRole } from '@/lib/types/ui-role';

const MAIN_LINKS = [
  { href: '/?screen=dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/?screen=members', label: 'Membros', icon: Users },
  { href: '/?screen=birthdays', label: 'Aniversários', icon: Cake },
  { href: '/?screen=messages', label: 'Mensagens', icon: MessageCircle },
] as const;

type AdminRouteShellProps = {
  children: ReactNode;
  initialRole?: UiRole;
};

export default function AdminRouteShell({
  children,
  initialRole = null,
}: AdminRouteShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<UiRole>(initialRole);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (role !== null) return;

    let active = true;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data } = await supabase
        .from('profiles')
        .select('role, course_only, is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (!active || !data || data.is_active !== true) return;
      if (data.role === 'admin') setRole('admin');
      else if (data.course_only) setRole('course');
      else setRole('member');
    })();

    return () => {
      active = false;
    };
  }, [role, supabase]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const showMainLinks = role !== 'course';
  const showAutomations = role === 'admin' || pathname.startsWith('/automacoes');
  const showCourses =
    role === 'admin' || role === 'course' || pathname.startsWith('/cursos');

  return (
    <div className="member-v3-shell admin-route-shell">
      <aside className={`member-v3-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="member-v3-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div>
            <strong>CEAMI</strong>
            <span>Membros</span>
          </div>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
            <X />
          </button>
        </div>

        <nav className="member-v3-nav" aria-label="Navegação principal">
          {showMainLinks &&
            MAIN_LINKS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} prefetch onClick={() => setMenuOpen(false)}>
                <Icon size={19} />
                <span>{label}</span>
              </Link>
            ))}

          {showAutomations && (
            <Link
              href="/automacoes"
              prefetch
              className={pathname.startsWith('/automacoes') ? 'active' : ''}
              aria-current={pathname.startsWith('/automacoes') ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <Workflow size={19} />
              <span>Automações</span>
            </Link>
          )}

          {showCourses && (
            <Link
              href="/cursos"
              prefetch
              className={pathname.startsWith('/cursos') ? 'active' : ''}
              aria-current={pathname.startsWith('/cursos') ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <GraduationCap size={19} />
              <span>Cursos</span>
            </Link>
          )}
        </nav>

        <div className="member-v3-sidebar-bottom">
          <button
            type="button"
            className="member-v3-signout"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut size={18} />
            <span>{signingOut ? 'Saindo...' : 'Sair'}</span>
          </button>
          <small>
            Comunidade Evangélica
            <br />
            Amigo Mais Que Irmão
          </small>
        </div>
      </aside>

      <section className="admin-route-content">
        <button
          type="button"
          className="admin-route-menu"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu />
        </button>
        {children}
      </section>

      <nav
        className={`member-v3-bottom-nav admin-route-bottom-nav ${showMainLinks ? '' : 'course-only'}`}
        aria-label="Navegação móvel"
      >
        {showMainLinks ? (
          MAIN_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} prefetch>
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))
        ) : (
          <Link href="/cursos" prefetch className={pathname.startsWith('/cursos') ? 'active' : ''}>
            <GraduationCap size={19} />
            <span>Cursos</span>
          </Link>
        )}
        <button
          type="button"
          className="active"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir todas as opções"
          aria-expanded={menuOpen}
        >
          <Menu size={19} />
          <span>Mais</span>
        </button>
      </nav>

      {menuOpen && (
        <button
          type="button"
          className="member-v3-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />
      )}
    </div>
  );
}
