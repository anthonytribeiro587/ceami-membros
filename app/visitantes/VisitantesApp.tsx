'use client';

import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  HeartHandshake,
  History,
  Home,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Phone,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Screen = 'home' | 'register' | 'visitors' | 'followup' | 'more';
type VisitorFilter = 'todos' | 'novos' | 'retornos' | 'pendentes' | 'contatados';

type Profile = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type Visitor = {
  id: string;
  full_name: string;
  phone: string;
  invited_by: string | null;
  notes: string | null;
  contact_consent: boolean;
  followup_status: 'pendente' | 'contatado' | 'sem_resposta' | 'nao_autorizado';
  status: 'ativo' | 'arquivado';
  first_visit_on: string;
  last_visit_on: string;
  visit_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Visit = {
  id: string;
  visitor_id: string;
  visited_on: string;
  reported_first_time: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
};

type Followup = {
  id: string;
  visitor_id: string;
  outcome: 'contatado' | 'sem_resposta' | 'observacao';
  note: string | null;
  created_by: string;
  created_at: string;
};

type VisitorMatch = Pick<Visitor,
  'id' | 'full_name' | 'phone' | 'invited_by' | 'notes' | 'contact_consent' |
  'followup_status' | 'first_visit_on' | 'last_visit_on' | 'visit_count'
>;

type RegisterResult = {
  visitorId: string;
  fullName: string;
  phone: string;
  isNew: boolean;
  visitAdded: boolean;
  visitCount: number;
  previousVisitOn: string | null;
  contactConsent: boolean;
};

function localDateKey(value = new Date()) {
  return value.toLocaleDateString('en-CA');
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const raw = value.slice(0, 10);
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR').format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 11);
}

function formatPhone(value?: string | null) {
  const digits = phoneDigits(value || '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || 'Sem telefone';
}

function maskPhoneInput(value: string) {
  const digits = phoneDigits(value);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || 'visitante';
}

function followupLabel(value: Visitor['followup_status']) {
  if (value === 'pendente') return 'Aguardando contato';
  if (value === 'contatado') return 'Contatado';
  if (value === 'sem_resposta') return 'Sem resposta';
  return 'Contato não autorizado';
}

function friendlyError(value: unknown) {
  const message = String(value || '');
  if (message.includes('WhatsApp válido')) return 'Informe um WhatsApp válido com DDD.';
  if (message.includes('Acesso restrito')) return 'Este usuário não possui acesso ao CEAMI Acolhimentos.';
  return message || 'Não foi possível concluir a operação.';
}

function Modal({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="visitors-modal-overlay" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="visitors-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X /></button>
        </header>
        <div className="visitors-modal-body">{children}</div>
      </section>
    </div>
  );
}

export default function VisitantesApp() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [screen, setScreen] = useState<Screen>('home');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [query, setQuery] = useState('');
  const [visitorFilter, setVisitorFilter] = useState<VisitorFilter>('todos');
  const [todayOnly, setTodayOnly] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [reportedFirstTime, setReportedFirstTime] = useState(true);
  const [invitedBy, setInvitedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [contactConsent, setContactConsent] = useState(true);
  const [existingMatch, setExistingMatch] = useState<VisitorMatch | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null);

  async function load() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      router.replace('/login?next=/acolhimentos');
      setLoading(false);
      return;
    }

    const [profileResult, accessResult, visitorsResult, visitsResult, followupsResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, is_active').eq('id', user.id).maybeSingle(),
      supabase
        .from('profile_module_access')
        .select('access_level, can_access')
        .eq('profile_id', user.id)
        .eq('module_key', 'welcome')
        .maybeSingle(),
      supabase.from('visitors').select('*').eq('status', 'ativo').order('last_visit_on', { ascending: false }).order('updated_at', { ascending: false }),
      supabase.from('visitor_visits').select('*').order('created_at', { ascending: false }).limit(1500),
      supabase.from('visitor_followups').select('*').order('created_at', { ascending: false }).limit(1500),
    ]);

    const allowed =
      profileResult.data?.is_active === true &&
      (
        profileResult.data?.role === 'admin' ||
        (accessResult.data?.can_access === true && accessResult.data?.access_level === 'manager')
      );

    if (profileResult.error || !allowed) {
      router.replace('/?selecionar=1&acesso=negado');
      setLoading(false);
      return;
    }

    setProfile(profileResult.data as Profile);
    setVisitors((visitorsResult.data || []) as Visitor[]);
    setVisits((visitsResult.data || []) as Visit[]);
    setFollowups((followupsResult.data || []) as Followup[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const today = localDateKey();

  const visitorMap = useMemo(() => new Map(visitors.map((visitor) => [visitor.id, visitor])), [visitors]);

  const visitsToday = useMemo(
    () => visits.filter((visit) => visit.visited_on === today),
    [visits, today],
  );

  const newToday = useMemo(
    () => visitors.filter((visitor) => visitor.first_visit_on === today).length,
    [visitors, today],
  );

  const returnsToday = useMemo(
    () => visitsToday.filter((visit) => visitorMap.get(visit.visitor_id)?.first_visit_on !== today).length,
    [visitsToday, visitorMap, today],
  );

  const pendingContact = useMemo(
    () => visitors.filter((visitor) => visitor.contact_consent && visitor.followup_status === 'pendente').length,
    [visitors],
  );

  const contactsToday = useMemo(
    () => followups.filter((item) => item.outcome === 'contatado' && localDateKey(new Date(item.created_at)) === today).length,
    [followups, today],
  );

  const filteredVisitors = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    const queryDigits = phoneDigits(query);
    const todayIds = new Set(visitsToday.map((visit) => visit.visitor_id));

    return visitors.filter((visitor) => {
      if (todayOnly && !todayIds.has(visitor.id)) return false;
      if (normalized) {
        const matchesName = visitor.full_name.toLocaleLowerCase('pt-BR').includes(normalized);
        const matchesPhone = queryDigits.length >= 2 && visitor.phone.includes(queryDigits);
        if (!matchesName && !matchesPhone) return false;
      }
      if (visitorFilter === 'novos' && visitor.visit_count !== 1) return false;
      if (visitorFilter === 'retornos' && visitor.visit_count < 2) return false;
      if (visitorFilter === 'pendentes' && visitor.followup_status !== 'pendente') return false;
      if (visitorFilter === 'contatados' && visitor.followup_status !== 'contatado') return false;
      return true;
    });
  }, [visitors, visitsToday, todayOnly, query, visitorFilter]);

  const pendingVisitors = useMemo(
    () => visitors.filter((visitor) => visitor.contact_consent && ['pendente', 'sem_resposta'].includes(visitor.followup_status)),
    [visitors],
  );

  function resetRegister(intent: 'first' | 'return' = 'first') {
    setFullName('');
    setPhone('');
    setReportedFirstTime(intent === 'first');
    setInvitedBy('');
    setNotes('');
    setContactConsent(true);
    setExistingMatch(null);
    setRegisterResult(null);
  }

  function openRegister(intent: 'first' | 'return' = 'first') {
    resetRegister(intent);
    setScreen('register');
  }

  async function findExisting() {
    const digits = phoneDigits(phone);
    if (digits.length !== 10 && digits.length !== 11) {
      setExistingMatch(null);
      return;
    }

    setCheckingPhone(true);
    const { data, error } = await supabase.rpc('visitor_find_by_phone', { p_phone: digits });
    setCheckingPhone(false);

    if (error) {
      setToast(friendlyError(error.message));
      return;
    }

    const match = Array.isArray(data) ? data[0] : null;
    if (match) {
      setExistingMatch(match as VisitorMatch);
      setFullName(match.full_name);
      setReportedFirstTime(false);
      setInvitedBy(match.invited_by || '');
      setContactConsent(Boolean(match.contact_consent));
    } else {
      setExistingMatch(null);
    }
  }

  async function saveVisit() {
    const digits = phoneDigits(phone);
    if (saving) return;
    if (fullName.trim().length < 3) {
      setToast('Informe o nome do visitante.');
      return;
    }
    if (digits.length !== 10 && digits.length !== 11) {
      setToast('Informe um WhatsApp válido com DDD.');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.rpc('visitor_register_visit', {
      p_full_name: fullName.trim(),
      p_phone: digits,
      p_reported_first_time: existingMatch ? false : reportedFirstTime,
      p_invited_by: invitedBy.trim() || null,
      p_notes: notes.trim() || null,
      p_contact_consent: contactConsent,
      p_visited_on: today,
    });
    setSaving(false);

    if (error) {
      setToast(friendlyError(error.message));
      return;
    }

    const result = (data || {}) as Record<string, unknown>;
    const next: RegisterResult = {
      visitorId: String(result.visitor_id || existingMatch?.id || ''),
      fullName: String(result.full_name || fullName),
      phone: String(result.phone || digits),
      isNew: result.is_new === true,
      visitAdded: result.visit_added === true,
      visitCount: Number(result.visit_count || 1),
      previousVisitOn: result.previous_visit_on ? String(result.previous_visit_on) : existingMatch?.last_visit_on || null,
      contactConsent: result.contact_consent === true,
    };

    setRegisterResult(next);
    await load();
  }

  async function registerReturn(visitor: Visitor) {
    if (saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('visitor_register_return', {
      p_visitor_id: visitor.id,
      p_visited_on: today,
    });
    setSaving(false);

    if (error) {
      setToast(friendlyError(error.message));
      return;
    }

    if (data === false) {
      setToast('A visita desta pessoa já está registrada hoje.');
      return;
    }

    await load();
    const updated = { ...visitor, visit_count: visitor.visit_count + 1, last_visit_on: today };
    setSelectedVisitor(updated);
    setToast('Retorno registrado com sucesso.');
  }

  async function markFollowup(visitor: Visitor, outcome: 'contatado' | 'sem_resposta') {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.rpc('visitor_register_followup', {
      p_visitor_id: visitor.id,
      p_outcome: outcome,
      p_note: null,
    });
    setSaving(false);

    if (error) {
      setToast(friendlyError(error.message));
      return;
    }

    await load();
    setSelectedVisitor((current) => current?.id === visitor.id ? { ...current, followup_status: outcome } : current);
    setToast(outcome === 'contatado' ? 'Contato marcado como realizado.' : 'Marcado como sem resposta.');
  }

  function openWhatsApp(visitor: Visitor) {
    if (!visitor.contact_consent) {
      setToast('Este visitante não autorizou contato pelo WhatsApp.');
      return;
    }
    const digits = phoneDigits(visitor.phone);
    if (digits.length < 10) {
      setToast('Telefone inválido para abrir o WhatsApp.');
      return;
    }
    const message = `Olá, ${firstName(visitor.full_name)}! Tudo bem? Aqui é da equipe de acolhimento da CEAMI 😊 Foi muito bom receber você conosco. Esperamos que tenha se sentido em casa!`;
    window.open(`https://wa.me/55${digits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  function openVisitors(filter: VisitorFilter = 'todos', onlyToday = false) {
    setVisitorFilter(filter);
    setTodayOnly(onlyToday);
    setQuery('');
    setScreen('visitors');
  }

  const title = screen === 'home' ? 'Visão geral'
    : screen === 'register' ? 'Registrar visita'
    : screen === 'visitors' ? (todayOnly ? 'Visitantes de hoje' : 'Visitantes')
    : screen === 'followup' ? 'Acompanhar'
    : 'Mais opções';

  if (loading) {
    return (
      <main className="visitors-loading">
        <img src="/brand/ceami-icon.svg?v=official-2" alt="" />
        <strong>CEAMI Acolhimentos</strong>
        <span>Carregando acolhimento...</span>
      </main>
    );
  }

  return (
    <main className="visitors-app">
      <aside className="visitors-sidebar">
        <div className="visitors-sidebar-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="" />
          <div><strong>CEAMI</strong><span>Acolhimentos</span></div>
        </div>
        <nav>
          <button type="button" className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}><Home /><span>Início</span></button>
          <button type="button" className={screen === 'register' ? 'active' : ''} onClick={() => openRegister()}><UserPlus /><span>Registrar visita</span></button>
          <button type="button" className={screen === 'visitors' ? 'active' : ''} onClick={() => openVisitors()}><Users /><span>Visitantes</span></button>
          <button type="button" className={screen === 'followup' ? 'active' : ''} onClick={() => setScreen('followup')}><Search /><span>Acompanhar</span>{pendingContact > 0 && <b>{pendingContact}</b>}</button>
        </nav>
        <div className="visitors-sidebar-profile">
          <span>{initials(profile?.full_name || 'CEAMI Acolhimento')}</span>
          <div><strong>{profile?.full_name || 'CEAMI Acolhimento'}</strong><small>Equipe de acolhimento</small></div>
          <button type="button" onClick={() => void signOut()} aria-label="Sair"><LogOut /></button>
        </div>
      </aside>

      <header className="visitors-topbar">
        {screen !== 'home' ? <button type="button" className="visitors-back" onClick={() => setScreen('home')}><ArrowLeft /></button> : <div className="visitors-mobile-brand"><img src="/brand/ceami-icon.svg?v=official-2" alt="" /><strong>CEAMI <span>Acolhimentos</span></strong></div>}
        <h1>{title}</h1>
        <button type="button" className="visitors-refresh" onClick={() => void load()} aria-label="Atualizar"><RefreshCw /></button>
      </header>

      <section className="visitors-content">
        {screen === 'home' && (
          <section className="visitors-home">
            <div className="visitors-welcome">
              <span>CEAMI ACOLHIMENTOS</span>
              <h2>{greeting()}, equipe de acolhimento! <b>👋</b></h2>
              <p>O que tal continuar acolhendo hoje?</p>
            </div>

            <div className="visitors-main-actions">
              <button type="button" className="orange" onClick={() => openRegister()}><UserPlus /><strong>Registrar<br />visita</strong></button>
              <button type="button" className="blue" onClick={() => openVisitors('todos', true)}><Users /><strong>Visitantes<br />de hoje</strong></button>
              <button type="button" className="blue soft" onClick={() => setScreen('followup')}><Search /><strong>Acompanhar</strong></button>
              <button type="button" className="orange soft" onClick={() => openRegister('return')}><RotateCcw /><strong>Registrar<br />retorno</strong></button>
            </div>

            <div className="visitors-summary-title"><span>RESUMO DE HOJE</span><h2>Visão rápida</h2></div>
            <div className="visitors-summary-grid">
              <button type="button" onClick={() => openVisitors('novos', true)}><i className="green"><Users /></i><strong>{newToday}</strong><span>novos visitantes</span></button>
              <button type="button" onClick={() => openVisitors('retornos', true)}><i className="orange"><UserRound /></i><strong>{returnsToday}</strong><span>retornos</span></button>
              <button type="button" onClick={() => setScreen('followup')}><i className="red"><PhoneCall /></i><strong>{pendingContact}</strong><span>aguardando contato</span></button>
              <button type="button" onClick={() => openVisitors('contatados')}><i className="blue"><CheckCircle2 /></i><strong>{contactsToday}</strong><span>contatos realizados</span></button>
            </div>

            <section className="visitors-home-today">
              <div className="visitors-section-head"><div><span>HOJE</span><h2>Últimas visitas</h2></div><button type="button" onClick={() => openVisitors('todos', true)}>Ver todas <ChevronRight /></button></div>
              {visitsToday.slice(0, 5).map((visit) => {
                const visitor = visitorMap.get(visit.visitor_id);
                if (!visitor) return null;
                return (
                  <button type="button" key={visit.id} className="visitors-mini-row" onClick={() => setSelectedVisitor(visitor)}>
                    <span className="visitors-avatar">{initials(visitor.full_name)}</span>
                    <div><strong>{visitor.full_name}</strong><small>{visitor.visit_count > 1 ? `${visitor.visit_count}ª visita registrada` : 'Primeira visita registrada'}</small></div>
                    <ChevronRight />
                  </button>
                );
              })}
              {!visitsToday.length && <div className="visitors-empty compact"><CalendarDays /><strong>Nenhuma visita registrada hoje</strong><span>Quando o acolhimento registrar alguém, aparecerá aqui.</span></div>}
            </section>
          </section>
        )}

        {screen === 'register' && (
          <section className="visitors-register-screen">
            {registerResult ? (
              <section className="visitors-register-success">
                <div className="visitors-success-icon"><Check /></div>
                <span>{registerResult.visitAdded ? 'VISITA REGISTRADA' : 'JÁ REGISTRADO HOJE'}</span>
                <h2>{registerResult.isNew ? 'Novo visitante cadastrado!' : registerResult.visitAdded ? 'Retorno registrado!' : 'Esta visita já estava registrada.'}</h2>
                <p>{registerResult.isNew
                  ? `${registerResult.fullName} agora faz parte do acompanhamento do acolhimento.`
                  : registerResult.visitAdded
                    ? `Esta é a ${registerResult.visitCount}ª visita registrada de ${registerResult.fullName}.`
                    : `Não criamos uma visita duplicada para ${registerResult.fullName}.`}</p>
                {registerResult.contactConsent && (
                  <button type="button" className="visitors-whatsapp large" onClick={() => {
                    const visitor = visitors.find((item) => item.id === registerResult.visitorId) || {
                      id: registerResult.visitorId,
                      full_name: registerResult.fullName,
                      phone: registerResult.phone,
                      contact_consent: true,
                    } as Visitor;
                    openWhatsApp(visitor);
                  }}><MessageCircle />Chamar no WhatsApp</button>
                )}
                <div className="visitors-success-actions">
                  <button type="button" onClick={() => {
                    const visitor = visitors.find((item) => item.id === registerResult.visitorId);
                    if (visitor) setSelectedVisitor(visitor);
                  }}>Ver ficha</button>
                  <button type="button" onClick={() => openRegister()}>Registrar outra visita</button>
                </div>
              </section>
            ) : (
              <section className="visitors-register-card">
                <div className="visitors-form-heading"><span>ACOLHIMENTO</span><h2>Registrar visita</h2><p>Preencha somente as informações importantes para o acompanhamento.</p></div>

                <label className="visitors-field"><span>Nome *</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Digite o nome completo" autoComplete="name" /></label>
                <label className="visitors-field"><span>WhatsApp / telefone *</span><div className="visitors-phone-input"><input value={phone} onChange={(event) => { setPhone(maskPhoneInput(event.target.value)); setExistingMatch(null); }} onBlur={() => void findExisting()} inputMode="tel" autoComplete="tel" placeholder="(51) 99999-9999" /><MessageCircle /></div>{checkingPhone && <small>Buscando cadastro...</small>}</label>

                {existingMatch && (
                  <div className="visitors-existing">
                    <div className="visitors-existing-icon"><CheckCircle2 /></div>
                    <div><span>VISITANTE JÁ CADASTRADO</span><strong>{existingMatch.full_name}</strong><small>Última visita: {formatDate(existingMatch.last_visit_on)} · Esta será a {existingMatch.visit_count + 1}ª visita registrada.</small></div>
                    <button type="button" onClick={() => {
                      const visitor = visitors.find((item) => item.id === existingMatch.id);
                      if (visitor) setSelectedVisitor(visitor);
                    }}>Ver ficha</button>
                  </div>
                )}

                <fieldset className="visitors-choice">
                  <legend>Primeira vez na CEAMI? *</legend>
                  <button type="button" className={reportedFirstTime && !existingMatch ? 'active' : ''} disabled={Boolean(existingMatch)} onClick={() => setReportedFirstTime(true)}><i>{reportedFirstTime && !existingMatch && <Check />}</i>Sim</button>
                  <button type="button" className={!reportedFirstTime || existingMatch ? 'active' : ''} onClick={() => setReportedFirstTime(false)}><i>{(!reportedFirstTime || existingMatch) && <Check />}</i>Não</button>
                </fieldset>

                <label className="visitors-field"><span>Quem convidou? <small>(opcional)</small></span><input value={invitedBy} onChange={(event) => setInvitedBy(event.target.value)} placeholder="Nome da pessoa" /></label>
                <label className="visitors-field"><span>Observação rápida <small>(opcional)</small></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: como conheceu, algo importante sobre a visita..." /></label>

                <fieldset className="visitors-choice consent">
                  <legend>Autorizou contato pelo WhatsApp? *</legend>
                  <button type="button" className={contactConsent ? 'active' : ''} onClick={() => setContactConsent(true)}><i>{contactConsent && <Check />}</i>Sim</button>
                  <button type="button" className={!contactConsent ? 'active' : ''} onClick={() => setContactConsent(false)}><i>{!contactConsent && <Check />}</i>Não</button>
                </fieldset>

                <div className="visitors-auto-date"><CalendarDays /><div><span>Data da visita</span><strong>{formatDate(today)}</strong><small>Preenchida automaticamente</small></div></div>

                <button type="button" className="visitors-primary" disabled={saving} onClick={() => void saveVisit()}><Check />{saving ? 'Salvando...' : existingMatch ? 'Registrar retorno' : 'Salvar visita'}</button>
              </section>
            )}
          </section>
        )}

        {screen === 'visitors' && (
          <section className="visitors-list-screen">
            <div className="visitors-list-toolbar">
              <div className="visitors-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou telefone..." /></div>
              <button type="button" onClick={() => openRegister()}><UserPlus />Registrar visita</button>
            </div>

            <div className="visitors-filters">
              {([
                ['todos', 'Todos'],
                ['novos', 'Novos'],
                ['retornos', 'Retornos'],
                ['pendentes', 'Contato pendente'],
                ['contatados', 'Contatados'],
              ] as Array<[VisitorFilter, string]>).map(([value, label]) => (
                <button type="button" key={value} className={visitorFilter === value ? 'active' : ''} onClick={() => setVisitorFilter(value)}>{label}</button>
              ))}
              {todayOnly && <button type="button" className="active today" onClick={() => setTodayOnly(false)}><CalendarDays />Somente hoje <X /></button>}
            </div>

            <div className="visitors-table-head"><span>Visitante</span><span>Telefone</span><span>Última visita</span><span>Status</span><span>Ações</span></div>
            <div className="visitors-list">
              {filteredVisitors.map((visitor) => (
                <article key={visitor.id} className="visitors-list-row">
                  <div className="visitors-person"><span className="visitors-avatar">{initials(visitor.full_name)}</span><div><strong>{visitor.full_name}</strong><small>{visitor.visit_count === 1 ? 'Novo visitante' : `${visitor.visit_count} visitas registradas`}</small></div></div>
                  <span className="visitors-phone">{formatPhone(visitor.phone)}</span>
                  <span className="visitors-date">{formatDate(visitor.last_visit_on)}</span>
                  <span className={`visitors-status ${visitor.followup_status}`}>{followupLabel(visitor.followup_status)}</span>
                  <div className="visitors-row-actions">
                    <button type="button" onClick={() => setSelectedVisitor(visitor)}>Ver ficha</button>
                    <button type="button" className="whatsapp" disabled={!visitor.contact_consent} onClick={() => openWhatsApp(visitor)}><MessageCircle />WhatsApp</button>
                  </div>
                </article>
              ))}
            </div>

            {!filteredVisitors.length && <div className="visitors-empty"><Users /><strong>Nenhum visitante encontrado</strong><span>Ajuste os filtros ou registre uma nova visita.</span></div>}
          </section>
        )}

        {screen === 'followup' && (
          <section className="visitors-followup-screen">
            <div className="visitors-page-intro"><span>ACOMPANHAMENTO</span><h2>Quem precisa de contato?</h2><p>Somente pessoas que autorizaram contato aparecem aqui. Abrir o WhatsApp não marca automaticamente como concluído.</p></div>

            <div className="visitors-followup-list">
              {pendingVisitors.map((visitor) => (
                <article key={visitor.id}>
                  <span className="visitors-avatar">{initials(visitor.full_name)}</span>
                  <div className="visitors-followup-copy"><strong>{visitor.full_name}</strong><span>{formatPhone(visitor.phone)} · última visita {formatDate(visitor.last_visit_on)}</span><small>{visitor.followup_status === 'sem_resposta' ? 'Tentativa anterior sem resposta' : 'Aguardando primeiro contato'}</small></div>
                  <button type="button" className="visitors-whatsapp" onClick={() => openWhatsApp(visitor)}><MessageCircle />WhatsApp</button>
                  <div className="visitors-followup-actions">
                    <button type="button" onClick={() => void markFollowup(visitor, 'contatado')}><CheckCircle2 />Contatado</button>
                    <button type="button" onClick={() => void markFollowup(visitor, 'sem_resposta')}><Clock3 />Sem resposta</button>
                    <button type="button" onClick={() => setSelectedVisitor(visitor)}>Ver ficha</button>
                  </div>
                </article>
              ))}
            </div>

            {!pendingVisitors.length && <div className="visitors-empty"><CheckCircle2 /><strong>Nenhum contato pendente</strong><span>O acompanhamento está em dia.</span></div>}
          </section>
        )}

        {screen === 'more' && (
          <section className="visitors-more-screen">
            <div className="visitors-account-card">
              <span className="visitors-avatar large">{initials(profile?.full_name || 'CEAMI')}</span>
              <div><strong>{profile?.full_name || 'CEAMI Acolhimento'}</strong><span>Equipe de acolhimento</span></div>
            </div>

            <div className="visitors-report-card">
              <div className="visitors-section-head"><div><span>RESUMO</span><h2>Indicadores atuais</h2></div></div>
              <div className="visitors-report-grid">
                <div><strong>{visitors.length}</strong><span>visitantes cadastrados</span></div>
                <div><strong>{visitors.filter((item) => item.visit_count > 1).length}</strong><span>já retornaram</span></div>
                <div><strong>{pendingContact}</strong><span>contatos pendentes</span></div>
                <div><strong>{visitors.filter((item) => item.followup_status === 'contatado').length}</strong><span>contatados</span></div>
              </div>
            </div>

            <button type="button" className="visitors-more-action" onClick={() => void load()}><RefreshCw /><span><strong>Atualizar dados</strong><small>Buscar as informações mais recentes.</small></span><ChevronRight /></button>
            <button type="button" className="visitors-more-action danger" onClick={() => void signOut()}><LogOut /><span><strong>Sair</strong><small>Encerrar este acesso do acolhimento.</small></span><ChevronRight /></button>
          </section>
        )}
      </section>

      <nav className="visitors-bottom-nav">
        <button type="button" className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}><Home /><span>Início</span></button>
        <button type="button" className={screen === 'register' ? 'active' : ''} onClick={() => openRegister()}><UserPlus /><span>Registrar</span></button>
        <button type="button" className={screen === 'visitors' ? 'active' : ''} onClick={() => openVisitors()}><Users /><span>Visitantes</span></button>
        <button type="button" className={screen === 'followup' ? 'active' : ''} onClick={() => setScreen('followup')}><Search /><span>Acompanhar</span>{pendingContact > 0 && <b>{pendingContact}</b>}</button>
        <button type="button" className={screen === 'more' ? 'active' : ''} onClick={() => setScreen('more')}><MoreHorizontal /><span>Mais</span></button>
      </nav>

      {selectedVisitor && (
        <Modal title={selectedVisitor.full_name} subtitle={`${selectedVisitor.visit_count} visita(s) registrada(s)`} onClose={() => setSelectedVisitor(null)}>
          <div className="visitors-detail-contact">
            <span className="visitors-avatar large">{initials(selectedVisitor.full_name)}</span>
            <div><strong>{formatPhone(selectedVisitor.phone)}</strong><span>Última visita: {formatDate(selectedVisitor.last_visit_on)}</span><small>Primeira visita: {formatDate(selectedVisitor.first_visit_on)}</small></div>
          </div>

          {selectedVisitor.contact_consent ? (
            <button type="button" className="visitors-whatsapp large" onClick={() => openWhatsApp(selectedVisitor)}><MessageCircle />Chamar no WhatsApp</button>
          ) : (
            <div className="visitors-no-consent"><ShieldCheck />Este visitante não autorizou contato pelo WhatsApp.</div>
          )}

          <div className="visitors-detail-grid">
            <div><span>Quem convidou</span><strong>{selectedVisitor.invited_by || 'Não informado'}</strong></div>
            <div><span>Status do contato</span><strong>{followupLabel(selectedVisitor.followup_status)}</strong></div>
          </div>

          {selectedVisitor.notes && <div className="visitors-notes"><span>Observações</span><p>{selectedVisitor.notes}</p></div>}

          <div className="visitors-detail-section">
            <div className="visitors-section-head"><div><span>HISTÓRICO</span><h2>Visitas registradas</h2></div></div>
            <div className="visitors-visit-history">
              {visits.filter((visit) => visit.visitor_id === selectedVisitor.id).slice(0, 8).map((visit) => (
                <div key={visit.id}><CalendarDays /><span><strong>{formatDate(visit.visited_on)}</strong><small>{visit.reported_first_time ? 'Informado como primeira visita' : 'Retorno'}</small></span></div>
              ))}
            </div>
          </div>

          <div className="visitors-modal-actions">
            <button type="button" onClick={() => void registerReturn(selectedVisitor)}><RotateCcw />Registrar retorno hoje</button>
            {selectedVisitor.contact_consent && selectedVisitor.followup_status !== 'contatado' && <button type="button" className="primary" onClick={() => void markFollowup(selectedVisitor, 'contatado')}><CheckCircle2 />Marcar contatado</button>}
          </div>
        </Modal>
      )}

      {toast && <div className="visitors-toast">{toast}</div>}
    </main>
  );
}
