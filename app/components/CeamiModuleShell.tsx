'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  FileText,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type ShellModule = 'events' | 'services' | 'courses';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const MODULES: Record<ShellModule, {
  name: string;
  team: string;
  nav: NavItem[];
}> = {
  events: {
    name: 'Eventos',
    team: 'Equipe de eventos',
    nav: [
      { href: '/eventos', label: 'Visão geral', icon: Home, exact: true },
      { href: '/eventos/checkin', label: 'Check-in', icon: CheckCircle2 },
      { href: '/eventos/envios-arquivos', label: 'Arquivos', icon: FileText },
    ],
  },
  services: {
    name: 'Serviços',
    team: 'Equipe de serviços',
    nav: [
      { href: '/servicos', label: 'Visão geral', icon: Home, exact: true },
    ],
  },
  courses: {
    name: 'Cursos',
    team: 'Equipe de cursos',
    nav: [
      { href: '/cursos', label: 'Visão geral', icon: Home, exact: true },
      { href: '/cursos/turmas', label: 'Turmas', icon: GraduationCap, exact: true },
      { href: '/cursos/alunos', label: 'Alunos', icon: Users, exact: true },
      { href: '/cursos/formados', label: 'Formados', icon: Award, exact: true },
    ],
  },
};

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'CE';
}

function pageTitle(moduleKey: ShellModule, pathname: string) {
  if (moduleKey === 'events') {
    if (pathname.startsWith('/eventos/checkin')) return 'Check-in';
    if (pathname.startsWith('/eventos/envios-arquivos')) return 'Envios e arquivos';
  }
  if (moduleKey === 'courses') {
    if (pathname.startsWith('/cursos/turmas')) return 'Turmas';
    if (pathname.startsWith('/cursos/alunos')) return 'Alunos';
    if (pathname.startsWith('/cursos/formados')) return 'Formados';
  }
  return 'Visão geral';
}

function activePath(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function CeamiModuleShell({
  moduleKey,
  children,
}: {
  moduleKey: ShellModule;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const config = MODULES[moduleKey];
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState('Conta CEAMI');

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !active) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!active) return;
      setProfileName(String(profile?.full_name || 'Conta CEAMI'));
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function signOut() {
    window.localStorage.removeItem('ceami:last-module');
    await supabase.auth.signOut();
    window.location.assign('/login');
  }

  return (
    <div className={`ceami-module-shell ceami-module-shell-${moduleKey}`}>
      <aside className={`ceami-module-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="ceami-module-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div><strong>CEAMI</strong><span>{config.name}</span></div>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>

        <nav className="ceami-module-nav" aria-label={`Navegação do CEAMI ${config.name}`}>
          {config.nav.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              className={activePath({ href, label, icon: Icon, exact }, pathname) ? 'active' : ''}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="ceami-module-profile">
          <span>{initials(profileName)}</span>
          <div><strong>{profileName}</strong><small>{config.team}</small></div>
          <button type="button" onClick={() => void signOut()} aria-label="Sair"><LogOut /></button>
        </div>
      </aside>

      <section className="ceami-module-main">
        <header className="ceami-module-topbar">
          <button
            type="button"
            className="ceami-module-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </button>
          <h1>{pageTitle(moduleKey, pathname)}</h1>
          <div className="ceami-module-topbar-actions">
            <div id="ceami-app-switcher-slot" className="ceami-app-switcher-slot" />
          </div>
        </header>

        <div className="ceami-module-body">{children}</div>
      </section>

      {menuOpen && (
        <button
          type="button"
          className="ceami-module-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />
      )}
    </div>
  );
}
