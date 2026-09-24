'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  GraduationCap,
  Handshake,
  HeartHandshake,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { CeamiModuleAccessLevel, CeamiModuleKey } from '@/lib/types/ceami-module';

type Profile = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  course_only: boolean;
  social_only: boolean;
  visitors_only: boolean;
};

type AccessRow = {
  profile_id: string;
  module_key: CeamiModuleKey;
  can_access: boolean;
  access_level: CeamiModuleAccessLevel;
};

type ModuleDefinition = {
  key: CeamiModuleKey;
  label: string;
  description: string;
  icon: LucideIcon;
};

const MODULES: ModuleDefinition[] = [
  { key: 'members', label: 'Membros', description: 'Cadastros e gestão de pessoas', icon: Users },
  { key: 'social', label: 'Social', description: 'Doações, estoque e entregas', icon: HeartHandshake },
  { key: 'events', label: 'Eventos', description: 'Inscrições, pagamentos e check-in', icon: CalendarDays },
  { key: 'services', label: 'Serviços', description: 'Solicitações e atendimentos', icon: Wrench },
  { key: 'welcome', label: 'Acolhimentos', description: 'Visitantes e acompanhamento', icon: Handshake },
  { key: 'courses', label: 'Cursos', description: 'Turmas, alunos e frequência', icon: GraduationCap },
];

function roleLabel(role: string) {
  if (role === 'admin') return 'Master';
  if (role === 'secretaria') return 'Secretaria';
  if (role === 'pastor') return 'Pastor';
  if (role === 'lider') return 'Líder';
  return 'Usuário';
}

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]?.toUpperCase() || '').join('') || 'CE';
}

export default function AccessManagementClient() {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [selectedModule, setSelectedModule] = useState<CeamiModuleKey>('members');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');

    const [profilesResult, accessResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role, is_active, course_only, social_only, visitors_only')
        .order('full_name', { ascending: true }),
      supabase
        .from('profile_module_access')
        .select('profile_id, module_key, can_access, access_level'),
    ]);

    if (profilesResult.error || accessResult.error) {
      setMessage('Não foi possível carregar as permissões.');
      setLoading(false);
      return;
    }

    setProfiles((profilesResult.data || []) as Profile[]);
    setAccess((accessResult.data || []) as AccessRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function accessRow(profile: Profile, moduleKey: CeamiModuleKey) {
    if (profile.role === 'admin') {
      return {
        profile_id: profile.id,
        module_key: moduleKey,
        can_access: true,
        access_level: 'manager' as CeamiModuleAccessLevel,
      };
    }

    return access.find(
      (item) => item.profile_id === profile.id && item.module_key === moduleKey,
    );
  }

  function hasAccess(profile: Profile, moduleKey: CeamiModuleKey) {
    if (profile.role === 'admin') return true;
    return accessRow(profile, moduleKey)?.can_access === true;
  }

  async function toggle(profile: Profile, moduleKey: CeamiModuleKey) {
    if (profile.role === 'admin' || !profile.is_active) return;

    const enabled = !hasAccess(profile, moduleKey);
    const savingKey = `${profile.id}:${moduleKey}`;
    setSaving(savingKey);
    setMessage('');

    const response = await fetch('/api/admin/module-access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: profile.id, moduleKey, enabled }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(result.error || 'Não foi possível atualizar o acesso.');
      setSaving('');
      return;
    }

    setAccess((current) => {
      const without = current.filter(
        (item) => !(item.profile_id === profile.id && item.module_key === moduleKey),
      );
      const previous = accessRow(profile, moduleKey);
      return [
        ...without,
        {
          profile_id: profile.id,
          module_key: moduleKey,
          can_access: enabled,
          access_level: previous?.access_level || (moduleKey === 'members' ? 'viewer' : 'manager'),
        },
      ];
    });
    setSaving('');
  }

  const selected = MODULES.find((module) => module.key === selectedModule) || MODULES[0];
  const SelectedIcon = selected.icon;
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const visible = profiles.filter((profile) =>
    !normalizedQuery ||
    `${profile.full_name} ${roleLabel(profile.role)}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery),
  );
  const enabledCount = profiles.filter((profile) => hasAccess(profile, selectedModule)).length;

  return (
    <main className="access-page">
      <header className="access-header">
        <div className="access-header-top">
          <Link href="/?selecionar=1" className="access-back">
            <ArrowLeft size={16} /> Aplicativos
          </Link>
          <div id="ceami-app-switcher-slot" className="ceami-app-switcher-slot" />
        </div>
        <div className="access-header-copy">
          <span>ADMINISTRAÇÃO MASTER</span>
          <h1><ShieldCheck /> Acessos dos aplicativos</h1>
          <p>Defina quem pode abrir cada módulo da CEAMI. Contas Master mantêm acesso total.</p>
        </div>
      </header>

      <section className="access-workspace">
        <aside className="access-apps" aria-label="Aplicativos">
          <div className="access-apps-title">
            <strong>Aplicativos</strong>
            <span>Selecione para administrar</span>
          </div>
          {MODULES.map(({ key, label, description, icon: Icon }) => {
            const count = profiles.filter((profile) => hasAccess(profile, key)).length;
            return (
              <button key={key} type="button" className={selectedModule === key ? 'active' : ''} onClick={() => setSelectedModule(key)}>
                <span className="access-app-icon"><Icon size={18} /></span>
                <span><strong>{label}</strong><small>{description}</small></span>
                <em>{count}</em>
              </button>
            );
          })}
        </aside>

        <section className="access-panel">
          <div className="access-panel-head">
            <div className="access-selected-app">
              <span className="access-selected-icon"><SelectedIcon size={21} /></span>
              <div>
                <span>CEAMI {selected.label}</span>
                <h2>Usuários com acesso</h2>
                <p>{enabledCount} de {profiles.length} contas podem abrir este aplicativo.</p>
              </div>
            </div>

            <label className="access-search">
              <Search size={17} />
              <input type="search" placeholder="Buscar usuário..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>

          {message && <div className="access-message">{message}</div>}

          {loading ? (
            <div className="access-loading"><LoaderCircle className="access-spin" /> Carregando acessos...</div>
          ) : (
            <div className="access-table-wrap">
              <table className="access-table">
                <thead>
                  <tr><th>Usuário</th><th>Perfil</th><th>Nível</th><th>Acesso</th></tr>
                </thead>
                <tbody>
                  {visible.map((profile) => {
                    const row = accessRow(profile, selectedModule);
                    const enabled = hasAccess(profile, selectedModule);
                    const locked = profile.role === 'admin';
                    const disabled = locked || !profile.is_active;
                    const savingKey = `${profile.id}:${selectedModule}`;
                    const level = locked ? 'Master' : enabled ? row?.access_level === 'manager' ? 'Gestão' : 'Visualização' : '—';

                    return (
                      <tr key={profile.id}>
                        <td data-label="Usuário">
                          <div className="access-person">
                            <span>{initials(profile.full_name)}</span>
                            <div><strong>{profile.full_name}</strong><small>{profile.is_active ? 'Conta ativa' : 'Conta inativa'}</small></div>
                          </div>
                        </td>
                        <td data-label="Perfil"><span className="access-role">{roleLabel(profile.role)}</span></td>
                        <td data-label="Nível"><span className="access-level">{level}</span></td>
                        <td data-label="Acesso">
                          <button
                            type="button"
                            className={enabled ? 'access-toggle active' : 'access-toggle'}
                            disabled={disabled || saving === savingKey}
                            onClick={() => void toggle(profile, selectedModule)}
                            aria-pressed={enabled}
                            aria-label={enabled ? `Revogar acesso de ${profile.full_name}` : `Liberar acesso de ${profile.full_name}`}
                          >
                            <span />
                            <small>{locked ? 'Master' : enabled ? 'Liberado' : 'Liberar'}</small>
                            {saving === savingKey && <LoaderCircle className="access-spin access-toggle-spin" size={14} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <p className="access-footnote">
        Uma conta pode ter acesso a vários aplicativos. O seletor de aplicativos mostra somente os módulos liberados para cada usuário.
      </p>
    </main>
  );
}
