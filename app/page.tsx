'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, Cake, Check, ChevronRight, LayoutDashboard, Menu, MessageCircle, Plus, Search, Settings, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Screen = 'dashboard' | 'members' | 'birthdays' | 'messages' | 'settings';
type Filter = 'all' | 'birthday' | 'baptized' | 'fundamentos';

type Member = {
  id: string;
  name: string;
  phone: string;
  email: string;
  birthDate: string;
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
    .map((word, index) => {
      if (index > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
    })
    .join(' ');
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function birthdayLabel(date: string) {
  if (!date) return 'Sem data';
  const [, month, day] = date.split('-');
  const today = new Date();
  const isToday = Number(month) === today.getMonth() + 1 && Number(day) === today.getDate();
  return isToday ? 'Hoje' : `${day}/${month}`;
}

function normalizeRole(value: string) {
  return value
    .split(' › ')
    .map(part => titleCase(part))
    .join(' › ');
}

function normalizeMember(row: MemberRowDb, roles: string[] = []): Member {
  const displayName = titleCase(row.full_name);
  const normalizedRoles = roles.map(normalizeRole);

  return {
    id: row.id,
    name: displayName,
    phone: row.phone || 'Não informado',
    email: row.email || '',
    birthDate: row.birth_date || '',
    birthdayLabel: birthdayLabel(row.birth_date || ''),
    ministry: normalizedRoles[0] || (row.ministry ? titleCase(row.ministry) : 'Sem função cadastrada'),
    roles: normalizedRoles,
    status: row.status || 'ativo',
    initials: initials(displayName),
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

export default function Home() {
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

  useEffect(() => {
    void loadMembers();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadMembers() {
    setLoading(true);
    setLoadError('');

    const { data: memberRows, error: memberError } = await supabase
      .from('members')
      .select('*')
      .order('full_name', { ascending: true });

    if (memberError) {
      setLoadError(`Não foi possível carregar os membros: ${memberError.message}`);
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

    setMembers((memberRows || []).map(row => normalizeMember(row as MemberRowDb, roleMap.get(row.id) || [])));
    setLoading(false);
  }

  function openManualForm() {
    router.push('/integra?origem=painel');
  }

  const filtered = useMemo(() => members.filter(member => {
    const matches = `${member.name} ${member.phone} ${member.ministry} ${member.roles.join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase());
    if (!matches) return false;
    if (filter === 'birthday') return member.birthdayLabel === 'Hoje';
    if (filter === 'baptized') return member.waterBaptized;
    if (filter === 'fundamentos') return !member.fundamentosFe;
    return true;
  }), [members, query, filter]);

  const selected = members.find(member => member.id === profileId) || null;
  if (selected) return <MemberProfile member={selected} onBack={() => setProfileId(null)} />;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-symbol">CE</div>
          <div><strong>CEAMI</strong><span>Membros</span></div>
          <button onClick={() => setMenuOpen(false)}><X /></button>
        </div>
        <nav>{nav.map(([key, label, Icon]) => (
          <button key={key} className={screen === key ? 'active' : ''} onClick={() => { setScreen(key); setMenuOpen(false); }}>
            <Icon size={19} />{label}
          </button>
        ))}</nav>
        <small>Comunidade Evangélica<br />Amigo Mais Que Irmão</small>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)}><Menu /></button>
          <div><span>CEAMI MEMBROS</span><h1>{screen === 'dashboard' ? 'Visão geral' : screen === 'members' ? 'Membros' : screen === 'birthdays' ? 'Aniversariantes' : screen === 'messages' ? 'Mensagens' : 'Configurações'}</h1></div>
          <button className="bell"><Bell size={19} /></button>
        </header>

        {loadError && <section className="panel"><p>{loadError}</p><button className="primary" onClick={() => void loadMembers()}>Tentar novamente</button></section>}
        {loading && !loadError && <section className="panel"><p>Carregando membros do Supabase...</p></section>}

        {!loading && !loadError && screen === 'dashboard' && <Dashboard members={members} onOpen={setProfileId} onRefresh={() => void loadMembers()} onNew={openManualForm} />}
        {!loading && !loadError && screen === 'members' && <MembersPage members={filtered} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onOpen={setProfileId} onNew={openManualForm} />}
        {!loading && !loadError && screen === 'birthdays' && <SimplePage title="Aniversariantes"><div className="list">{members.filter(member => member.birthDate).sort((a, b) => a.birthDate.slice(5).localeCompare(b.birthDate.slice(5))).map(member => <MemberItem key={member.id} member={member} onOpen={() => setProfileId(member.id)} />)}</div></SimplePage>}
        {!loading && !loadError && screen === 'messages' && <SimplePage title="Mensagens automáticas"><div className="empty"><MessageCircle /><h3>Nenhuma mensagem enviada ainda</h3><p>O histórico de parabéns aparecerá aqui.</p></div></SimplePage>}
        {!loading && !loadError && screen === 'settings' && <SimplePage title="Configurações"><div className="settings"><label>Horário de envio<input type="time" defaultValue="08:00" /></label><label>Mensagem padrão<textarea defaultValue="Hoje celebramos a sua vida! Que Deus continue abençoando sua caminhada. Feliz aniversário! 🎉" /></label><button className="primary" onClick={() => setToast('Configurações salvas')}>Salvar configurações</button></div></SimplePage>}
      </section>

      <div className="bottom-nav">{nav.slice(0, 4).map(([key, label, Icon]) => <button key={key} className={screen === key ? 'active' : ''} onClick={() => setScreen(key)}><Icon size={20} /><span>{label}</span></button>)}</div>
      {menuOpen && <button className="menu-overlay" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}
      {toast && <div className="toast"><Check size={18} />{toast}</div>}
    </main>
  );
}

function Dashboard({ members, onOpen, onRefresh, onNew }: { members: Member[]; onOpen: (id: string) => void; onRefresh: () => void; onNew: () => void }) {
  const pending = members.filter(member => !member.fundamentosFe).length;
  return <>
    <section className="welcome"><div><span>DADOS REAIS DO SUPABASE</span><h2>Cuidar bem começa com informação simples.</h2><p>{members.length} membros carregados. {pending} ainda precisam concluir Fundamentos da Fé.</p></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button onClick={onRefresh}>Atualizar dados</button><button onClick={onNew}><Plus size={18}/>Novo membro</button></div></section>
    <section className="stats"><article><Users /><div><small>Membros</small><strong>{members.length}</strong></div></article><article><Cake /><div><small>Aniversários hoje</small><strong>{members.filter(member => member.birthdayLabel === 'Hoje').length}</strong></div></article><article><Check /><div><small>Fundamentos pendente</small><strong>{pending}</strong></div></article></section>
    <section className="panel"><div className="panel-head"><div><h3>Membros cadastrados</h3><p>Dados importados e cadastrados no Supabase.</p></div><button className="square" onClick={onNew} aria-label="Adicionar membro"><Plus /></button></div><div className="list">{members.slice(0, 8).map(member => <MemberItem key={member.id} member={member} onOpen={() => onOpen(member.id)} />)}</div></section>
  </>;
}

function MembersPage({ members, query, setQuery, filter, setFilter, onOpen, onNew }: { members: Member[]; query: string; setQuery: (value: string) => void; filter: Filter; setFilter: (value: Filter) => void; onOpen: (id: string) => void; onNew: () => void }) {
  return <section className="panel members-page">
    <div className="panel-head"><div><h2>Membros cadastrados</h2><p>{members.length} resultados encontrados.</p></div><button className="square" onClick={onNew} aria-label="Adicionar novo membro"><Plus /></button></div>
    <div className="search"><Search size={19} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou função" /></div>
    <div className="chips"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button><button className={filter === 'birthday' ? 'active' : ''} onClick={() => setFilter('birthday')}>Aniversário hoje</button><button className={filter === 'baptized' ? 'active' : ''} onClick={() => setFilter('baptized')}>Batizados</button><button className={filter === 'fundamentos' ? 'active' : ''} onClick={() => setFilter('fundamentos')}>Fundamentos pendente</button></div>
    <div className="list">{members.map(member => <MemberItem key={member.id} member={member} onOpen={() => onOpen(member.id)} />)}</div>
  </section>;
}

function MemberItem({ member, onOpen }: { member: Member; onOpen: () => void }) {
  return <button className="member-row" onClick={onOpen}><div className="member-avatar">{member.initials}</div><div><strong>{member.name}</strong><span>{member.phone} · {member.ministry}</span></div><ChevronRight /></button>;
}

function SimplePage({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel simple-page"><h2>{title}</h2>{children}</section>;
}

function MemberProfile({ member, onBack }: { member: Member; onBack: () => void }) {
  return <main className="profile-page"><header><button onClick={onBack}><ArrowLeft /></button><span>Ficha do membro</span><div /></header><section className="profile-hero"><div className="profile-avatar">{member.initials}</div><h1>{member.name}</h1><p>{titleCase(member.status)}</p></section><section className="profile-sections"><Info title="Contato" rows={[["WhatsApp", member.phone], ["E-mail", member.email || 'Não informado'], ["Nascimento", member.birthDate || 'Não informado']]} /><Info title="Endereço" rows={[["Endereço", member.address || 'Não informado'], ["Bairro", member.neighborhood || 'Não informado'], ["Cidade", member.city || 'Não informado']]} /><Info title="Vida cristã" rows={[["Batizado nas águas", member.waterBaptized ? 'Sim' : 'Não informado'], ["Batizado no Espírito Santo", member.holySpiritBaptized ? 'Sim' : 'Não informado'], ["Fundamentos da Fé", member.fundamentosFe ? 'Concluído' : 'Não informado']]} /><Info title="Ministérios e funções" rows={member.roles.length ? member.roles.map((role, index) => [`Função ${index + 1}`, role]) : [["Funções", member.ministry]]} /></section></main>;
}

function Info({ title, rows }: { title: string; rows: string[][] }) {
  return <article className="info-card"><div className="info-title"><h2>{title}</h2></div>{rows.map(([label, value]) => <div className="info-row" key={`${label}-${value}`}><span>{label}</span><strong>{value}</strong></div>)}</article>;
}
