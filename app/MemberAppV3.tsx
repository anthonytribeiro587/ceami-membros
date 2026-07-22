'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  BookOpenCheck,
  Cake,
  CalendarCheck2,
  Check,
  ChevronRight,
  Church,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import BirthdayHistory from './components/BirthdayHistory';
import BirthdayCalendar from './components/BirthdayCalendar';

type Screen = 'dashboard' | 'members' | 'birthdays' | 'messages';
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

const NAV = [
  ['dashboard', 'Início', LayoutDashboard],
  ['members', 'Membros', Users],
  ['birthdays', 'Aniversários', Cake],
  ['messages', 'Mensagens', MessageCircle],
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

function calculateAge(date: string) {
  if (!date) return '';
  const birth = new Date(`${date}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? `${age} anos` : '';
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
  return 'Mensagens';
}

export default function MemberAppV3() {
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
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
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

    for (const link of (links || []) as Array<Record<string, any>>) {
      const fn = link.ministry_functions;
      const area = fn?.ministry_areas;
      const department = area?.departments;
      const role = [department?.name, area?.name, fn?.name].filter(Boolean).join(' › ');
      if (!role) continue;
      const current = roleMap.get(String(link.member_id)) || [];
      if (!current.includes(role)) current.push(role);
      roleMap.set(String(link.member_id), current);
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

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
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

  return (
    <main className="member-v3-shell">
      <aside className={`member-v3-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="member-v3-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div><strong>CEAMI</strong><span>Membros</span></div>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>

        <nav className="member-v3-nav">
          {NAV.map(([key, label, Icon]) => (
            <button
              type="button"
              key={key}
              className={!selected && screen === key ? 'active' : ''}
              onClick={() => {
                setProfileId(null);
                setScreen(key);
                setMenuOpen(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}

          <button type="button" onClick={() => router.push('/ajustes-aniversario')}>
            <Settings size={19} /><span>Ajustes</span>
          </button>

          {isAdmin && (
            <button type="button" onClick={() => router.push('/cursos')}>
              <GraduationCap size={19} /><span>Cursos</span>
            </button>
          )}
        </nav>

        <div className="member-v3-sidebar-bottom">
          <button type="button" className="member-v3-signout" disabled={signingOut} onClick={() => void signOut()}>
            <LogOut size={18} /><span>{signingOut ? 'Saindo...' : 'Sair'}</span>
          </button>
          <small>Comunidade Evangélica<br />Amigo Mais Que Irmão</small>
        </div>
      </aside>

      <section className="member-v3-content">
        <header className="member-v3-topbar">
          <button type="button" className="member-v3-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu /></button>
          <div>
            <span>CEAMI MEMBROS</span>
            <h1>{selected ? 'Detalhes do membro' : screenTitle(screen)}</h1>
          </div>
          <button type="button" className="member-v3-notification" aria-label="Notificações"><Bell size={19} /></button>
        </header>

        {selected ? (
          <MemberDetails
            member={selected}
            isAdmin={isAdmin}
            onBack={() => setProfileId(null)}
            onEdit={() => setEditing(selected)}
          />
        ) : (
          <>
            {loadError && (
              <section className="member-v3-panel member-v3-error">
                <p>{loadError}</p>
                <button type="button" onClick={() => void loadMembers()}>Tentar novamente</button>
              </section>
            )}

            {loading && !loadError && <section className="member-v3-panel">Carregando membros...</section>}

            {!loading && !loadError && screen === 'dashboard' && (
              <Dashboard members={members} onOpen={setProfileId} onRefresh={() => void loadMembers()} onNew={openManualForm} />
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
              <section className="member-v3-panel member-v3-simple-page">
                <BirthdayCalendar members={members} onOpenMember={setProfileId} />
              </section>
            )}

            {!loading && !loadError && screen === 'messages' && (
              <section className="member-v3-panel member-v3-simple-page">
                <BirthdayHistory />
              </section>
            )}
          </>
        )}
      </section>

      <div className="member-v3-bottom-nav">
        {NAV.map(([key, label, Icon]) => (
          <button
            type="button"
            key={key}
            className={!selected && screen === key ? 'active' : ''}
            onClick={() => {
              setProfileId(null);
              setScreen(key);
            }}
          >
            <Icon size={20} /><span>{label}</span>
          </button>
        ))}
      </div>

      {menuOpen && <button type="button" className="member-v3-overlay" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}

      {editing && (
        <AdminEditor
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            const editedId = editing.id;
            setEditing(null);
            await loadMembers();
            setProfileId(editedId);
            setToast('Cadastro atualizado');
          }}
        />
      )}

      {toast && <div className="member-v3-toast"><Check size={18} />{toast}</div>}
    </main>
  );
}

function Dashboard({ members, onOpen, onRefresh, onNew }: {
  members: Member[];
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onNew: () => void;
}) {
  const pending = members.filter((member) => !member.fundamentosFe).length;
  const birthdaysToday = members.filter((member) => member.birthdayLabel === 'Hoje');
  const nextBirthdays = members
    .filter((member) => member.birthDate)
    .map((member) => {
      const [, month, day] = member.birthDate.split('-').map(Number);
      const now = new Date();
      const next = new Date(now.getFullYear(), month - 1, day);
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
      return { member, time: next.getTime() };
    })
    .sort((a, b) => a.time - b.time)
    .slice(0, 4);

  return (
    <div className="member-v3-dashboard">
      <section className="member-v3-hero">
        <div>
          <span>DADOS REAIS DO SUPABASE</span>
          <h2>Cuidar bem começa com informação simples.</h2>
          <p>{members.length} membros cadastrados. {pending} ainda precisam concluir Fundamentos da Fé.</p>
        </div>
        <div className="member-v3-hero-actions">
          <button type="button" className="ghost" onClick={onRefresh}><RefreshCw size={18} />Atualizar dados</button>
          <button type="button" onClick={onNew}><Plus size={18} />Novo membro</button>
        </div>
      </section>

      <section className="member-v3-metrics">
        <Metric icon={<Users />} label="Membros" value={members.length} />
        <Metric icon={<Cake />} label="Aniversários hoje" value={birthdaysToday.length} />
        <Metric icon={<BookOpenCheck />} label="Fundamentos pendente" value={pending} />
      </section>

      <div className="member-v3-dashboard-grid">
        <section className="member-v3-panel member-v3-member-list-panel">
          <div className="member-v3-panel-head">
            <div><h2>Membros cadastrados</h2><p>Dados organizados e disponíveis para acompanhamento.</p></div>
            <button type="button" className="member-v3-square" onClick={onNew} aria-label="Novo membro"><Plus /></button>
          </div>
          <div className="member-v3-list">
            {members.slice(0, 8).map((member) => <MemberRow key={member.id} member={member} onOpen={() => onOpen(member.id)} />)}
          </div>
        </section>

        <aside className="member-v3-panel member-v3-birthday-card">
          <div className="member-v3-panel-head"><div><h2>Próximos aniversários</h2><p>Datas mais próximas.</p></div><Cake /></div>
          <div className="member-v3-birthday-list">
            {nextBirthdays.map(({ member, time }) => (
              <button type="button" key={member.id} onClick={() => onOpen(member.id)}>
                <span className="member-v3-mini-avatar">{member.initials}</span>
                <span><strong>{member.name}</strong><small>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(time))}</small></span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          <div className="member-v3-quick-actions">
            <button type="button" onClick={onNew}><UserRound /><span>Novo membro</span></button>
            <button type="button" onClick={() => window.location.assign('/cursos')}><GraduationCap /><span>Ver cursos</span></button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <article><div className="member-v3-metric-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></article>;
}

function MembersPage({ members, query, setQuery, filter, setFilter, onOpen, onNew }: {
  members: Member[];
  query: string;
  setQuery: (value: string) => void;
  filter: Filter;
  setFilter: (value: Filter) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="member-v3-panel member-v3-members-page">
      <div className="member-v3-panel-head">
        <div><h2>Membros cadastrados</h2><p>{members.length} resultados encontrados.</p></div>
        <button type="button" className="member-v3-primary" onClick={onNew}><Plus size={18} />Novo membro</button>
      </div>
      <div className="member-v3-search"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou função" /></div>
      <div className="member-v3-chips">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Todos</Chip>
        <Chip active={filter === 'birthday'} onClick={() => setFilter('birthday')}>Aniversário hoje</Chip>
        <Chip active={filter === 'baptized'} onClick={() => setFilter('baptized')}>Batizados</Chip>
        <Chip active={filter === 'fundamentos'} onClick={() => setFilter('fundamentos')}>Fundamentos pendente</Chip>
        <Chip active={filter === 'missingPhone'} onClick={() => setFilter('missingPhone')}>Sem telefone</Chip>
        <Chip active={filter === 'missingBirthDate'} onClick={() => setFilter('missingBirthDate')}>Sem nascimento</Chip>
      </div>
      <div className="member-v3-list">{members.map((member) => <MemberRow key={member.id} member={member} onOpen={() => onOpen(member.id)} />)}</div>
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={active ? 'active' : ''} onClick={onClick}>{children}</button>;
}

function MemberRow({ member, onOpen }: { member: Member; onOpen: () => void }) {
  return (
    <button type="button" className="member-v3-row" onClick={onOpen}>
      <div className="member-v3-avatar">{member.initials}</div>
      <div><strong>{member.name}</strong><span>{member.phone} · {member.ministry}</span></div>
      <ChevronRight />
    </button>
  );
}

function MemberDetails({ member, isAdmin, onBack, onEdit }: {
  member: Member;
  isAdmin: boolean;
  onBack: () => void;
  onEdit: () => void;
}) {
  const fullAddress = [member.address, member.neighborhood, member.city].filter(Boolean).join(' · ') || 'Não informado';
  const age = calculateAge(member.birthDate);

  return (
    <div className="member-v3-details">
      <div className="member-v3-breadcrumb"><button type="button" onClick={onBack}><ArrowLeft size={17} />Membros</button><ChevronRight size={14} /><span>Detalhes do membro</span></div>

      <header className="member-v3-profile-header">
        <div className="member-v3-profile-avatar">{member.initials}</div>
        <div><div className="member-v3-profile-title"><h2>{member.name}</h2><span>{titleCase(member.status)}</span></div><p>{member.ministry}</p></div>
        {isAdmin && <button type="button" onClick={onEdit}><Pencil size={17} />Editar dados</button>}
      </header>

      <div className="member-v3-details-grid">
        <section className="member-v3-detail-card member-v3-personal-card">
          <CardTitle icon={<UserRound />} title="Informações pessoais" />
          <DetailRow label="Nome completo" value={member.name} />
          <DetailRow label="Data de nascimento" value={`${formatDate(member.birthDate)}${age ? ` (${age})` : ''}`} />
          <DetailRow label="Estado civil" value={member.maritalStatus || 'Não informado'} />
          <DetailRow label="Data do Integra" value={formatDate(member.integraDate)} icon={<CalendarCheck2 size={17} />} />
          <DetailRow label="Situação" value={titleCase(member.status)} />
        </section>

        <section className="member-v3-detail-card member-v3-contact-card">
          <CardTitle icon={<Phone />} title="Contato" />
          <ContactRow icon={<Phone />} label="Telefone" value={member.phone} href={member.phone !== 'Não informado' ? `https://wa.me/55${member.phone.replace(/\D/g, '')}` : undefined} />
          <ContactRow icon={<Mail />} label="E-mail" value={member.email || 'Não informado'} href={member.email ? `mailto:${member.email}` : undefined} />
          <ContactRow icon={<MapPin />} label="Endereço" value={fullAddress} />
        </section>

        <section className="member-v3-detail-card member-v3-skills-card">
          <CardTitle icon={<Sparkles />} title="Habilidades e observações" />
          <div className="member-v3-role-tags">
            {(member.roles.length ? member.roles : [member.ministry]).map((role) => <span key={role}>{role}</span>)}
          </div>
          <div className="member-v3-notes"><small>Observações</small><p>{member.notes || 'Nenhuma habilidade ou observação informada.'}</p></div>
        </section>

        <section className="member-v3-detail-card member-v3-faith-card">
          <CardTitle icon={<Church />} title="Vida cristã" />
          <StatusRow label="Batizado nas águas" active={member.waterBaptized} activeText="Sim" />
          <StatusRow label="Batizado no Espírito Santo" active={member.holySpiritBaptized} activeText="Sim" />
          <StatusRow label="Fundamentos da Fé" active={member.fundamentosFe} activeText="Concluído" />
          <DetailRow label="Ministério ou função" value={member.ministry} />
        </section>
      </div>
    </div>
  );
}

function CardTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="member-v3-card-title"><span>{icon}</span><h3>{title}</h3></div>;
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div className="member-v3-detail-row"><span>{label}</span><strong>{value}</strong>{icon && <i>{icon}</i>}</div>;
}

function ContactRow({ icon, label, value, href }: { icon: ReactNode; label: string; value: string; href?: string }) {
  const content = <><span className="member-v3-contact-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong></span>{href && <ChevronRight size={17} />}</>;
  return href ? <a className="member-v3-contact-row" href={href} target="_blank" rel="noreferrer">{content}</a> : <div className="member-v3-contact-row">{content}</div>;
}

function StatusRow({ label, active, activeText }: { label: string; active: boolean; activeText: string }) {
  return <div className="member-v3-status-row"><span>{label}</span><strong className={active ? 'active' : ''}>{active ? activeText : 'Não informado'}</strong></div>;
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
    <div className="member-v3-modal-overlay">
      <section className="member-v3-modal">
        <header><div><small>EDIÇÃO ADMINISTRATIVA</small><h2>Editar membro</h2><p>Atualize as informações do cadastro.</p></div><button type="button" onClick={onClose}><X /></button></header>
        <div className="member-v3-modal-body">
          <Field label="Nome completo"><input value={data.name} onChange={(event) => update('name', event.target.value)} /></Field>
          <div className="member-v3-form-two"><Field label="WhatsApp"><input value={data.phone} onChange={(event) => update('phone', event.target.value)} /></Field><Field label="E-mail"><input type="email" value={data.email} onChange={(event) => update('email', event.target.value)} /></Field></div>
          <div className="member-v3-form-two"><Field label="Data de nascimento"><input type="date" value={data.birthDate} onChange={(event) => update('birthDate', event.target.value)} /></Field><Field label="Data do Integra"><input type="date" value={data.integraDate} onChange={(event) => update('integraDate', event.target.value)} /></Field></div>
          <Field label="Endereço"><input value={data.address} onChange={(event) => update('address', event.target.value)} /></Field>
          <div className="member-v3-form-two"><Field label="Bairro"><input value={data.neighborhood} onChange={(event) => update('neighborhood', event.target.value)} /></Field><Field label="Cidade"><input value={data.city} onChange={(event) => update('city', event.target.value)} /></Field></div>
          <Field label="Estado civil"><select value={data.maritalStatus} onChange={(event) => update('maritalStatus', event.target.value)}><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>União estável</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option></select></Field>
          <Toggle label="Batizado nas águas" checked={data.waterBaptized} onChange={(value) => update('waterBaptized', value)} />
          <Toggle label="Batizado no Espírito Santo" checked={data.holySpiritBaptized} onChange={(value) => update('holySpiritBaptized', value)} />
          <Toggle label="Concluiu Fundamentos da Fé" checked={data.fundamentosFe} onChange={(value) => update('fundamentosFe', value)} />
          <Field label="Habilidades e observações"><textarea value={data.notes} onChange={(event) => update('notes', event.target.value)} /></Field>
          {error && <p className="member-v3-form-error">{error}</p>}
        </div>
        <footer><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></footer>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="member-v3-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={`member-v3-toggle ${checked ? 'checked' : ''}`}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i>{checked ? <Check size={15} /> : null}</i></label>;
}
