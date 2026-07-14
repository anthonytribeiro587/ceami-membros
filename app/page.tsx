'use client';

import { useMemo, useState } from 'react';
import { Bell, Cake, ChevronRight, CircleUserRound, LayoutDashboard, Menu, MessageCircle, Plus, Search, Settings, Users, X } from 'lucide-react';

type Member = {
  id: number;
  name: string;
  phone: string;
  ministry: string;
  birthday: string;
  status: 'Ativo' | 'Acompanhamento';
  initials: string;
};

const initialMembers: Member[] = [
  { id: 1, name: 'Ana Carolina', phone: '(51) 99999-1234', ministry: 'Louvor', birthday: 'Hoje', status: 'Ativo', initials: 'AC' },
  { id: 2, name: 'Gabriel Lima', phone: '(51) 98888-4321', ministry: 'Jovens', birthday: '15 jul', status: 'Ativo', initials: 'GL' },
  { id: 3, name: 'Mariane Souza', phone: '(51) 97777-8877', ministry: 'Infantil', birthday: '22 jul', status: 'Acompanhamento', initials: 'MS' },
  { id: 4, name: 'Eduardo Ribeiro', phone: '(51) 96666-5544', ministry: 'Louvor', birthday: '03 ago', status: 'Ativo', initials: 'ER' },
];

export default function Home() {
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => members.filter((member) =>
    `${member.name} ${member.ministry} ${member.phone}`.toLowerCase().includes(query.toLowerCase())
  ), [members, query]);

  function addMember(formData: FormData) {
    const name = String(formData.get('name') || '').trim();
    if (!name) return;
    const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    setMembers((current) => [{
      id: Date.now(),
      name,
      phone: String(formData.get('phone') || 'Não informado'),
      ministry: String(formData.get('ministry') || 'Sem ministério'),
      birthday: String(formData.get('birthday') || 'Não informado'),
      status: 'Ativo',
      initials,
    }, ...current]);
    setModalOpen(false);
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div><strong>CEAMI</strong><span>Membros</span></div>
          <button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav>
          <a className="active"><LayoutDashboard size={19} /> Visão geral</a>
          <a><Users size={19} /> Membros</a>
          <a><Cake size={19} /> Aniversariantes</a>
          <a><MessageCircle size={19} /> Mensagens</a>
          <a><Settings size={19} /> Configurações</a>
        </nav>
        <div className="church-card"><small>Comunidade Evangélica</small><strong>Amigo Mais Que Irmão</strong></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={22} /></button>
          <div><h1>Olá, Secretaria 👋</h1><p>Acompanhe a comunidade hoje.</p></div>
          <div className="top-actions"><button className="icon-button"><Bell size={20} /><i /></button><div className="avatar">CE</div></div>
        </header>

        <section className="hero-card">
          <div><span className="eyebrow">CEAMI MEMBROS</span><h2>Cuidar de pessoas começa por conhecê-las.</h2><p>Cadastre, acompanhe e celebre cada membro da nossa comunidade.</p></div>
          <button className="primary-button" onClick={() => setModalOpen(true)}><Plus size={18} /> Novo membro</button>
        </section>

        <section className="stats-grid">
          <article><div className="stat-icon orange"><Users /></div><div><span>Total de membros</span><strong>{members.length + 182}</strong><small>+8 neste mês</small></div></article>
          <article><div className="stat-icon blue"><Cake /></div><div><span>Aniversários no mês</span><strong>12</strong><small>1 aniversariante hoje</small></div></article>
          <article><div className="stat-icon green"><MessageCircle /></div><div><span>Mensagens enviadas</span><strong>34</strong><small>100% entregues</small></div></article>
          <article><div className="stat-icon purple"><CircleUserRound /></div><div><span>Em acompanhamento</span><strong>7</strong><small>Requer atenção</small></div></article>
        </section>

        <section className="main-grid">
          <div className="panel members-panel">
            <div className="panel-heading"><div><h3>Membros recentes</h3><p>Cadastros e atualizações mais recentes</p></div><button className="text-button">Ver todos <ChevronRight size={16} /></button></div>
            <div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou ministério" /></div>
            <div className="member-list">
              {filtered.map((member) => <article className="member-row" key={member.id}>
                <div className="member-avatar">{member.initials}</div>
                <div className="member-info"><strong>{member.name}</strong><span>{member.phone} · {member.ministry}</span></div>
                <div className="birthday"><Cake size={15} /> {member.birthday}</div>
                <span className={`status ${member.status === 'Ativo' ? 'active-status' : 'follow-status'}`}>{member.status}</span>
                <button className="row-action"><ChevronRight size={18} /></button>
              </article>)}
            </div>
          </div>

          <aside className="panel birthday-panel">
            <div className="panel-heading"><div><h3>Aniversariante do dia</h3><p>13 de julho</p></div><Cake size={22} /></div>
            <div className="birthday-person"><div className="large-avatar">AC</div><h4>Ana Carolina</h4><span>Louvor · 29 anos</span></div>
            <div className="message-preview">“Hoje celebramos a sua vida! Que Deus continue abençoando sua caminhada. Feliz aniversário! 🎉”</div>
            <button className="whatsapp-button"><MessageCircle size={18} /> Enviar parabéns</button>
            <small className="automation-note">Envio automático programado para 08:00</small>
          </aside>
        </section>
      </section>

      {menuOpen && <button className="overlay menu-overlay" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}
      {modalOpen && <div className="overlay modal-overlay" onMouseDown={() => setModalOpen(false)}>
        <form className="modal" action={addMember} onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-header"><div><h3>Novo membro</h3><p>Preencha os dados principais para iniciar o cadastro.</p></div><button type="button" className="icon-button" onClick={() => setModalOpen(false)}><X /></button></div>
          <label>Nome completo<input name="name" required placeholder="Ex.: João da Silva" /></label>
          <div className="form-grid"><label>WhatsApp<input name="phone" placeholder="(51) 99999-9999" /></label><label>Data de nascimento<input name="birthday" type="date" /></label></div>
          <label>Ministério<select name="ministry"><option>Sem ministério</option><option>Louvor</option><option>Jovens</option><option>Infantil</option><option>Ação social</option><option>Intercessão</option></select></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="primary-button" type="submit">Salvar membro</button></div>
        </form>
      </div>}
    </main>
  );
}
