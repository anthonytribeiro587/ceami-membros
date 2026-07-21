'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  Cake,
  Check,
  ChevronRight,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import BirthdayHistory from './components/BirthdayHistory';
import BirthdayCalendar from './components/BirthdayCalendar';

type Screen = 'dashboard' | 'members' | 'birthdays' | 'messages' | 'settings';
type Filter = 'all' | 'birthday' | 'baptized' | 'fundamentos' | 'missingPhone' | 'missingBirthDate';

type Member = {
  id: string;
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  integraDate: string;
  birthdayLabel: string;
  ministry: string;
  roles: string[];
  status: string;
  initials: string;
  address: string;
  neighborhood: string;
  city: string;
  maritalStatus: string;
  waterBaptized: boolean;
  holySpiritBaptized: boolean;
  fundamentosFe: boolean;
  notes: string;
};

type MemberRowDb = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  integra_date?: string | null;
  ministry: string | null;
  status: string | null;
  address: string | null;
  neighborhood: string | null;
  city?: string | null;
  marital_status: string | null;
  baptism_date: string | null;
  water_baptized?: boolean | null;
  holy_spirit_baptized?: boolean | null;
  fundamentos_fe?: boolean | null;
  notes: string | null;
};

type EditData = {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  integraDate: string;
  address: string;
  neighborhood: string;
  city: string;
  maritalStatus: string;
  waterBaptized: boolean;
  holySpiritBaptized: boolean;
  fundamentosFe: boolean;
  notes: string;
};

const nav = [
  ['dashboard', 'Início', LayoutDashboard],
  ['members', 'Membros', Users],
  ['birthdays', 'Aniversários', Cake],
  ['messages', 'Mensagens', MessageCircle],
  ['settings', 'Ajustes', Settings],
] as const;

const LOWERCASE_WORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

function titleCase(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && LOWERCASE_WORDS.has(word)
        ? word
        : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1),
    )
    .join(' ');
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function birthdayLabel(date: string) {
  if (!date) return 'Sem data';
  const [, month, day] = date.split('-');
  const today = new Date();
  return Number(month) === today.getMonth() + 1 && Number(day) === today.getDate()
    ? 'Hoje'
    : `${day}/${month}`;
}

function formatDate(date: string) {
  return date ? date.split('-').reverse().join('/') : 'Não informado';
}

function normalizeRole(value: string) {
  return value.split(' › ').map(titleCase).join(' › ');
}

function normalizeMember(row: MemberRowDb, roles: string[] = []): Member {
  const name = titleCase(row.full_name);
  const normalizedRoles = roles.map(normalizeRole);

  return {
    id: row.id,
    name,
    phone: row.phone || 'Não informado',
    email: row.email || '',
    birthDate: row.birth_date || '',
    integraDate: row.integra_date || '',
    birthdayLabel: birthdayLabel(row.birth_date || ''),
    ministry:
      normalizedRoles[0] ||
      (row.ministry ? titleCase(row.ministry) : 'Sem função cadastrada'),
    roles: normalizedRoles,
    status: row.status || 'ativo',
    initials: initials(name),
    address: row.address || '',
    neighborhood: row.neighborhood || '',
    city: row.city || '',
    maritalStatus: row.marital_status || '',
    waterBaptized: Boolean(row.water_baptized || row.baptism_date),
    holySpiritBaptized: Boolean(row.holy_spirit_baptized),
    fundamentosFe: Boolean(row.fundamentos_fe),
    notes: row.notes || '',
  };
}

function screenTitle(screen: Screen) {
  if (screen === 'dashboard') return 'Visão geral';
  if (screen === 'members') return 'Membros';
  if (screen === 'birthdays') return 'Aniversários';
  if (screen === 'messages') return 'Mensagens';
  return 'Configurações';
}

export default function MemberApp() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function initialize() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      setIsAdmin(profile?.role === 'admin');
    }

    await loadMembers();
  }

  async function loadMembers() {
    setLoading(true);
    setLoadError('');

    const { data: memberRows, error } = await supabase
      .from('members')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      setLoadError(`Não foi possível carregar os membros: ${error.message}`);
      setLoading(false);
      return;
    }

    const roleMap = new Map<string, string[]>();
    const { data: links } = await supabase
      .from('member_functions')
      .select('member_id, ministry_functions(name, ministry_areas(name, departments(name)))')
      .eq('active', true);

    for (const link of (links || []) as any[]) {
      const fn = link.ministry_functions;
      const area = fn?.ministry_areas;
      const department = area?.departments;
      const role = [department?.name, area?.name, fn?.name].filter(Boolean).join(' › ');
      if (!role) continue;
      const current = roleMap.get(link.member_id) || [];
      if (!current.includes(role)) current.push(role);
      roleMap.set(link.member_id, current);
    }

    setMembers(
      (memberRows || []).map((row) =>
        normalizeMember(row as MemberRowDb, roleMap.get(row.id) || []),
      ),
    );
    setLoading(false);
  }

  function openManualForm() {
    router.push('/integra?origem=painel');
  }

  const filtered = useMemo(
    () =>
      members.filter((member) => {
        const matches = `${member.name} ${member.phone} ${member.ministry} ${member.roles.join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase());
        if (!matches) return false;
        if (filter === 'birthday') return member.birthdayLabel === 'Hoje';
        if (filter === 'baptized') return member.waterBaptized;
        if (filter === 'fundamentos') return !member.fundamentosFe;
        if (filter === 'missingPhone') return member.phone === 'Não informado';
        if (filter === 'missingBirthDate') return !member.birthDate;
        return true;
      }),
    [members, query, filter],
  );

  const selected = members.find((member) => member.id === profileId) || null;

  if (selected) {
    return (
      <MemberProfile
        member={selected}
        isAdmin={isAdmin}
        onBack={() => setProfileId(null)}
        onEdit={() => setEditing(selected)}
        editor={
          editing && (
            <AdminEditor
              member={editing}
              onClose={() => setEditing(null)}
              onSaved={async () => {
                setEditing(null);
                setProfileId(null);
                await loadMembers();
                setToast('Cadastro atualizado');
              }}
            />
          )
        }
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-symbol">CE</div>
          <div>
            <strong>CEAMI</strong>
            <span>Membros</span>
          </div>
          <button type="button" onClick={() => setMenuOpen(false)}>
            <X />
          </button>
        </div>

        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              type="button"
              key={key}
              className={screen === key ? 'active' : ''}
              onClick={() => {
                if (key === 'settings') {
                  setMenuOpen(false);
                  router.push('/ajustes-aniversario');
                  return;
                }
                setScreen(key);
                setMenuOpen(false);
              }}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>

        <small>
          Comunidade Evangélica
          <br />
          Amigo Mais Que Irmão
        </small>
      </aside>

      <section className="content">
        <header className="topbar">
          <button type="button" className="menu-button" onClick={() => setMenuOpen(true)}>
            <Menu />
          </button>
          <div>
            <span>CEAMI MEMBROS</span>
            <h1>{screenTitle(screen)}</h1>
          </div>
          <button type="button" className="bell">
            <Bell size={19} />
          </button>
        </header>

        {loadError && (
          <section className="panel">
            <p>{loadError}</p>
            <button type="button" className="primary" onClick={() => void loadMembers()}>
              Tentar novamente
            </button>
          </section>
        )}

        {loading && !loadError && (
          <section className="panel">
            <p>Carregando membros do Supabase...</p>
          </section>
        )}

        {!loading && !loadError && screen === 'dashboard' && (
          <Dashboard
            members={members}
            onOpen={setProfileId}
            onRefresh={() => void loadMembers()}
            onNew={openManualForm}
          />
        )}

        {!loading && !loadError && screen === 'members' && (
          <MembersPage
            members={filtered}
            query={query}
            setQuery={setQuery}
            filter={filter}
            setFilter={setFilter}
            onOpen={setProfileId}
            onNew={openManualForm}
          />
        )}

        {!loading && !loadError && screen === 'birthdays' && (
          <section className="panel simple-page">
            <BirthdayCalendar members={members} onOpenMember={setProfileId} />
          </section>
        )}

        {!loading && !loadError && screen === 'messages' && (
          <section className="panel simple-page message-page">
            <BirthdayHistory />
          </section>
        )}
      </section>

      <div className="bottom-nav">
        {nav.slice(0, 4).map(([key, label, Icon]) => (
          <button
            type="button"
            key={key}
            className={screen === key ? 'active' : ''}
            onClick={() => setScreen(key)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {menuOpen && (
        <button
          type="button"
          className="menu-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      {toast && (
        <div className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}

function Dashboard({
  members,
  onOpen,
  onRefresh,
  onNew,
}: {
  members: Member[];
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onNew: () => void;
}) {
  const pending = members.filter((member) => !member.fundamentosFe).length;

  return (
    <>
      <section className="welcome">
        <div>
          <span>DADOS REAIS DO SUPABASE</span>
          <h2>Cuidar bem começa com informação simples.</h2>
          <p>
            {members.length} membros carregados. {pending} ainda precisam concluir Fundamentos da Fé.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onRefresh}>Atualizar dados</button>
          <button type="button" onClick={onNew}><Plus size={18} />Novo membro</button>
        </div>
      </section>

      <section className="stats">
        <article><Users /><div><small>Membros</small><strong>{members.length}</strong></div></article>
        <article><Cake /><div><small>Aniversários hoje</small><strong>{members.filter((member) => member.birthdayLabel === 'Hoje').length}</strong></div></article>
        <article><Check /><div><small>Fundamentos pendente</small><strong>{pending}</strong></div></article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h3>Membros cadastrados</h3><p>Dados importados e cadastrados no Supabase.</p></div>
          <button type="button" className="square" onClick={onNew}><Plus /></button>
        </div>
        <div className="list">{members.slice(0, 8).map((member) => <MemberItem key={member.id} member={member} onOpen={() => onOpen(member.id)} />)}</div>
      </section>
    </>
  );
}

function MembersPage({
  members,
  query,
  setQuery,
  filter,
  setFilter,
  onOpen,
  onNew,
}: {
  members: Member[];
  query: string;
  setQuery: (value: string) => void;
  filter: Filter;
  setFilter: (value: Filter) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="panel members-page">
      <div className="panel-head">
        <div><h2>Membros cadastrados</h2><p>{members.length} resultados encontrados.</p></div>
        <button type="button" className="square" onClick={onNew}><Plus /></button>
      </div>
      <div className="search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou função" /></div>
      <div className="chips">
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button>
        <button type="button" className={filter === 'birthday' ? 'active' : ''} onClick={() => setFilter('birthday')}>Aniversário hoje</button>
        <button type="button" className={filter === 'baptized' ? 'active' : ''} onClick={() => setFilter('baptized')}>Batizados</button>
        <button type="button" className={filter === 'fundamentos' ? 'active' : ''} onClick={() => setFilter('fundamentos')}>Fundamentos pendente</button>
        <button type="button" className={filter === 'missingPhone' ? 'active' : ''} onClick={() => setFilter('missingPhone')}>Sem telefone</button>
        <button type="button" className={filter === 'missingBirthDate' ? 'active' : ''} onClick={() => setFilter('missingBirthDate')}>Sem nascimento</button>
      </div>
      <div className="list">{members.map((member) => <MemberItem key={member.id} member={member} onOpen={() => onOpen(member.id)} />)}</div>
    </section>
  );
}

function MemberItem({ member, onOpen }: { member: Member; onOpen: () => void }) {
  return (
    <button type="button" className="member-row" onClick={onOpen}>
      <div className="member-avatar">{member.initials}</div>
      <div><strong>{member.name}</strong><span>{member.phone} · {member.ministry}</span></div>
      <ChevronRight />
    </button>
  );
}

function MemberProfile({
  member,
  onBack,
  isAdmin,
  onEdit,
  editor,
}: {
  member: Member;
  onBack: () => void;
  isAdmin: boolean;
  onEdit: () => void;
  editor: ReactNode;
}) {
  return (
    <main className="profile-page">
      <header>
        <button type="button" onClick={onBack}><ArrowLeft /></button>
        <span>Ficha do membro</span>
        {isAdmin ? <button type="button" onClick={onEdit}>Editar</button> : <div />}
      </header>
      <section className="profile-hero">
        <div className="profile-avatar">{member.initials}</div>
        <h1>{member.name}</h1>
        <p>{titleCase(member.status)}</p>
      </section>
      <section className="profile-sections">
        <Info title="Contato" rows={[["WhatsApp", member.phone], ["E-mail", member.email || 'Não informado'], ["Nascimento", formatDate(member.birthDate)]]} />
        <Info title="Integra CEAMI" rows={[["Data do Integra", formatDate(member.integraDate)]]} />
        <Info title="Endereço" rows={[["Endereço", member.address || 'Não informado'], ["Bairro", member.neighborhood || 'Não informado'], ["Cidade", member.city || 'Não informado']]} />
        <Info title="Vida cristã" rows={[["Batizado nas águas", member.waterBaptized ? 'Sim' : 'Não informado'], ["Batizado no Espírito Santo", member.holySpiritBaptized ? 'Sim' : 'Não informado'], ["Fundamentos da Fé", member.fundamentosFe ? 'Concluído' : 'Não informado']]} />
        <Info title="Ministérios e funções" rows={member.roles.length ? member.roles.map((role, index) => [`Função ${index + 1}`, role]) : [["Funções", member.ministry]]} />
      </section>
      {editor}
    </main>
  );
}

function Info({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <article className="info-card">
      <div className="info-title"><h2>{title}</h2></div>
      {rows.map(([label, value]) => <div className="info-row" key={`${label}-${value}`}><span>{label}</span><strong>{value}</strong></div>)}
    </article>
  );
}

function AdminEditor({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<EditData>({
    name: member.name,
    phone: member.phone === 'Não informado' ? '' : member.phone,
    email: member.email,
    birthDate: member.birthDate,
    integraDate: member.integraDate,
    address: member.address,
    neighborhood: member.neighborhood,
    city: member.city,
    maritalStatus: member.maritalStatus,
    waterBaptized: member.waterBaptized,
    holySpiritBaptized: member.holySpiritBaptized,
    fundamentosFe: member.fundamentosFe,
    notes: member.notes,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update<K extends keyof EditData>(key: K, value: EditData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!data.name.trim()) return setError('Informe o nome.');
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase
      .from('members')
      .update({
        full_name: data.name.trim(),
        phone: data.phone.trim() || null,
        email: data.email.trim() || null,
        birth_date: data.birthDate || null,
        integra_date: data.integraDate || null,
        address: data.address.trim() || null,
        neighborhood: data.neighborhood.trim() || null,
        city: data.city.trim() || null,
        marital_status: data.maritalStatus || null,
        water_baptized: data.waterBaptized,
        holy_spirit_baptized: data.holySpiritBaptized,
        fundamentos_fe: data.fundamentosFe,
        notes: data.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', member.id);

    setSaving(false);
    if (saveError) return setError(saveError.message);
    onSaved();
  }

  return (
    <div className="wizard-overlay">
      <section className="wizard">
        <header>
          <div><small>EDIÇÃO ADMINISTRATIVA</small><h2>Editar membro</h2><p>Atualize os dados cadastrais.</p></div>
          <button type="button" onClick={onClose}><X /></button>
        </header>
        <div className="wizard-body">
          <Field label="Nome completo"><input value={data.name} onChange={(event) => update('name', event.target.value)} /></Field>
          <div className="two">
            <Field label="WhatsApp"><input value={data.phone} onChange={(event) => update('phone', event.target.value)} /></Field>
            <Field label="E-mail"><input type="email" value={data.email} onChange={(event) => update('email', event.target.value)} /></Field>
          </div>
          <div className="two">
            <Field label="Data de nascimento"><input type="date" value={data.birthDate} onChange={(event) => update('birthDate', event.target.value)} /></Field>
            <Field label="Data do Integra"><input type="date" value={data.integraDate} onChange={(event) => update('integraDate', event.target.value)} /></Field>
          </div>
          <Field label="Endereço"><input value={data.address} onChange={(event) => update('address', event.target.value)} /></Field>
          <div className="two">
            <Field label="Bairro"><input value={data.neighborhood} onChange={(event) => update('neighborhood', event.target.value)} /></Field>
            <Field label="Cidade"><input value={data.city} onChange={(event) => update('city', event.target.value)} /></Field>
          </div>
          <Field label="Estado civil">
            <select value={data.maritalStatus} onChange={(event) => update('maritalStatus', event.target.value)}>
              <option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>União estável</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option>
            </select>
          </Field>
          <Toggle label="Batizado nas águas" checked={data.waterBaptized} onChange={(value) => update('waterBaptized', value)} />
          <Toggle label="Batizado no Espírito Santo" checked={data.holySpiritBaptized} onChange={(value) => update('holySpiritBaptized', value)} />
          <Toggle label="Concluiu Fundamentos da Fé" checked={data.fundamentosFe} onChange={(value) => update('fundamentosFe', value)} />
          <Field label="Observações"><textarea value={data.notes} onChange={(event) => update('notes', event.target.value)} /></Field>
          {error && <p>{error}</p>}
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
        </footer>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`toggle-card ${checked ? 'checked' : ''}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i>{checked ? <Check size={15} /> : null}</i>
    </label>
  );
}
