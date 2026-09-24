'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  HeartHandshake,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { CeamiModuleKey } from '@/lib/types/ceami-module';

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
};

const MODULES: Array<{ key: CeamiModuleKey; label: string; icon: LucideIcon }> = [
  { key: 'members', label: 'Membros', icon: Users },
  { key: 'social', label: 'Social', icon: HeartHandshake },
  { key: 'events', label: 'Eventos', icon: CalendarDays },
  { key: 'services', label: 'Serviços', icon: Wrench },
];

function roleLabel(role: string) {
  if (role === 'admin') return 'Master';
  if (role === 'secretaria') return 'Secretaria';
  if (role === 'pastor') return 'Pastor';
  if (role === 'lider') return 'Líder';
  return 'Usuário';
}

export default function AccessManagementClient() {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [access, setAccess] = useState<AccessRow[]>([]);
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
        .select('profile_id, module_key, can_access'),
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

  function hasAccess(profile: Profile, moduleKey: CeamiModuleKey) {
    if (profile.role === 'admin') return true;
    return access.some(
      (item) =>
        item.profile_id === profile.id &&
        item.module_key === moduleKey &&
        item.can_access === true,
    );
  }

  async function toggle(profile: Profile, moduleKey: CeamiModuleKey) {
    if (profile.role === 'admin' || profile.course_only || profile.visitors_only || !profile.is_active) return;

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
      return [...without, { profile_id: profile.id, module_key: moduleKey, can_access: enabled }];
    });
    setSaving('');
  }

  const visible = profiles.filter((profile) =>
    profile.full_name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')),
  );

  return (
    <main className="access-page">
      <header className="access-header">
        <div>
          <Link href="/?selecionar=1" className="access-back">
            <ArrowLeft size={16} /> Aplicativos
          </Link>
          <span>ADMINISTRAÇÃO MASTER</span>
          <h1><ShieldCheck /> Acessos dos aplicativos</h1>
          <p>Defina quais módulos cada conta pode abrir. Uma mesma pessoa pode ter acesso a vários aplicativos.</p>
        </div>
      </header>

      <section className="access-toolbar">
        <label>
          <Search size={18} />
          <input
            type="search"
            placeholder="Buscar usuário..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span>{profiles.length} contas</span>
      </section>

      {message && <div className="access-message">{message}</div>}

      {loading ? (
        <div className="access-loading"><LoaderCircle className="access-spin" /> Carregando acessos...</div>
      ) : (
        <section className="access-list">
          {visible.map((profile) => {
            const legacy = profile.course_only ? 'Cursos' : profile.visitors_only ? 'Visitantes' : '';
            return (
              <article key={profile.id} className="access-user">
                <div className="access-user-info">
                  <div className="access-avatar">
                    {profile.full_name.trim().slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong>{profile.full_name}</strong>
                    <span>
                      {roleLabel(profile.role)}
                      {!profile.is_active && ' • Inativo'}
                      {legacy && ` • Portal ${legacy}`}
                    </span>
                  </div>
                </div>

                <div className="access-modules">
                  {MODULES.map(({ key, label, icon: Icon }) => {
                    const enabled = hasAccess(profile, key);
                    const disabled =
                      profile.role === 'admin' ||
                      profile.course_only ||
                      profile.visitors_only ||
                      !profile.is_active;
                    const savingKey = `${profile.id}:${key}`;

                    return (
                      <button
                        key={key}
                        type="button"
                        className={enabled ? 'active' : ''}
                        disabled={disabled || saving === savingKey}
                        onClick={() => void toggle(profile, key)}
                        aria-pressed={enabled}
                      >
                        {saving === savingKey ? <LoaderCircle className="access-spin" size={17} /> : <Icon size={17} />}
                        <span>{label}</span>
                        <small>{profile.role === 'admin' ? 'Master' : enabled ? 'Liberado' : 'Sem acesso'}</small>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <p className="access-footnote">
        Contas exclusivas de Cursos e Visitantes continuam sendo administradas nos portais atuais até a próxima etapa da migração.
      </p>
    </main>
  );
}
