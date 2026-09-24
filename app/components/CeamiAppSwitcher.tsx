'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  GraduationCap,
  Grid2X2,
  Handshake,
  HeartHandshake,
  KeyRound,
  LogOut,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  CEAMI_MODULE_PATHS,
  type CeamiModuleKey,
} from '@/lib/types/ceami-module';

const MODULES: Array<{
  key: CeamiModuleKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: 'members', label: 'Membros', icon: Users },
  { key: 'social', label: 'Social', icon: HeartHandshake },
  { key: 'events', label: 'Eventos', icon: CalendarDays },
  { key: 'services', label: 'Serviços', icon: Wrench },
  { key: 'welcome', label: 'Acolhimentos', icon: Handshake },
  { key: 'courses', label: 'Cursos', icon: GraduationCap },
];

const HIDDEN_PREFIXES = [
  '/login',
  '/login-cursos',
  '/visitantes/login',
  '/social/login',
  '/social/design-preview',
  '/integra',
  '/consultar',
  '/f/',
  '/checkin/',
  '/privacidade',
  '/servicos/solicitar',
];

function isHiddenPath(pathname: string) {
  if (pathname === '/') return true;
  return HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export default function CeamiAppSwitcher() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState<CeamiModuleKey[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    if (isHiddenPath(pathname)) return;

    let active = true;
    void (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user || !active) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, is_active, course_only, social_only, visitors_only')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!active || !profile?.is_active) return;
      setProfileName(String(profile.full_name || ''));

      if (profile.role === 'admin') {
        setIsAdmin(true);
        setAllowed(MODULES.map((module) => module.key));
        return;
      }

      const { data: rows, error: accessError } = await supabase
        .from('profile_module_access')
        .select('module_key, can_access')
        .eq('profile_id', authData.user.id)
        .eq('can_access', true);

      if (!active) return;
      const keys = (rows || [])
        .map((row) => String(row.module_key) as CeamiModuleKey)
        .filter((key) => MODULES.some((module) => module.key === key));

      if (keys.length) setAllowed(keys);
      else if (accessError) {
        if (profile.visitors_only) setAllowed(['welcome']);
        else if (profile.course_only) setAllowed(['courses']);
        else if (profile.social_only) setAllowed(['social']);
        else setAllowed(['members']);
      } else {
        setAllowed([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [pathname, supabase]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (isHiddenPath(pathname) || allowed.length === 0) return null;

  function remember(moduleKey: CeamiModuleKey) {
    window.localStorage.setItem('ceami:last-module', moduleKey);
    setOpen(false);
  }

  async function signOut() {
    window.localStorage.removeItem('ceami:last-module');
    await supabase.auth.signOut();
    window.location.assign('/login');
  }

  return (
    <div className="ceami-app-switcher" ref={panelRef}>
      <button
        type="button"
        className="ceami-app-switcher-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label="Abrir aplicativos CEAMI"
        aria-expanded={open}
      >
        {open ? <X size={19} /> : <Grid2X2 size={19} />}
        <span>Aplicativos</span>
      </button>

      {open && (
        <div className="ceami-app-switcher-panel">
          <div className="ceami-app-switcher-head">
            <strong>Aplicativos CEAMI</strong>
            <span>Troque de módulo sem sair da sua conta.</span>
          </div>

          <div className="ceami-app-switcher-grid">
            {MODULES.filter((module) => allowed.includes(module.key)).map(({ key, label, icon: Icon }) => (
              <Link key={key} href={CEAMI_MODULE_PATHS[key]} onClick={() => remember(key)}>
                <Icon size={20} />
                <span>{label}</span>
              </Link>
            ))}
          </div>

          <Link href="/conta" className="ceami-app-switcher-all" onClick={() => setOpen(false)}>
            <KeyRound size={14} /> Minha conta e senha
          </Link>
          {isAdmin && (
            <Link href="/acessos" className="ceami-app-switcher-all" onClick={() => setOpen(false)}>
              Gerenciar acessos
            </Link>
          )}
          <Link href="/?selecionar=1" className="ceami-app-switcher-all" onClick={() => setOpen(false)}>
            Ver todos os aplicativos
          </Link>

          <div className="ceami-app-switcher-account">
            <span>{profileName || 'Conta CEAMI'}</span>
            <button type="button" onClick={() => void signOut()}>
              <LogOut size={15} /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
