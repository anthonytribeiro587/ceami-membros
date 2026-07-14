'use client';

import { useMemo, useState } from 'react';
import { Bell, Cake, CheckCircle2, ChevronRight, LayoutDashboard, Menu, MessageCircle, Plus, Search, Settings, Users, X } from 'lucide-react';

type Screen = 'dashboard' | 'members' | 'birthdays' | 'messages' | 'settings';
type Member = { id:number; name:string; phone:string; ministry:string; birthday:string; status:'Ativo'|'Acompanhamento'; initials:string };

const initialMembers: Member[] = [
  { id:1, name:'Ana Carolina', phone:'(51) 99999-1234', ministry:'Louvor', birthday:'Hoje', status:'Ativo', initials:'AC' },
  { id:2, name:'Gabriel Lima', phone:'(51) 98888-4321', ministry:'Jovens', birthday:'15 jul', status:'Ativo', initials:'GL' },
  { id:3, name:'Mariane Souza', phone:'(51) 97777-8877', ministry:'Infantil', birthday:'22 jul', status:'Acompanhamento', initials:'MS' },
  { id:4, name:'Eduardo Ribeiro', phone:'(51) 96666-5544', ministry:'Louvor', birthday:'03 ago', status:'Ativo', initials:'ER' },
];

const screens = [
  ['dashboard','Visão geral',LayoutDashboard],['members','Membros',Users],['birthdays','Aniversariantes',Cake],['messages','Mensagens',MessageCircle],['settings','Configurações',Settings]
] as const;

function ChurchLogo(){
  return <div className="church-logo" aria-label="Comunidade Evangélica Amigo Mais Que Irmão">
    <svg viewBox="0 0 180 180" role="img"><circle cx="90" cy="90" r="88" fill="#050505"/><path fill="#fff" d="M93 43c-8 22-4 40 11 53-9-3-18-11-25-25-5 21 0 38 16 51-14-4-28-17-36-38-6 27 7 51 31 58 20 5 43-7 49-29 3-12-2-23-15-28 5-5 12-7 20-6-15-12-29-17-42-15 4-11 3-23-4-36z"/><path fill="#fff" d="M121 78c11-8 22-11 34-8-7 4-12 10-14 18-8-2-14-5-20-10z"/></svg>
    <div><strong>CEAMI</strong><span>Amigo Mais Que Irmão</span></div>
  </div>;
}

export default function Home(){
  const [members,setMembers]=useState(initialMembers);
  const [query,setQuery]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [modalOpen,setModalOpen]=useState(false);
  const [screen,setScreen]=useState<Screen>('dashboard');
  const filtered=useMemo(()=>members.filter(m=>`${m.name} ${m.phone} ${m.ministry}`.toLowerCase().includes(query.toLowerCase())),[members,query]);

  function go(next:Screen){ setScreen(next); setMenuOpen(false); }
  function addMember(formData:FormData){
    const name=String(formData.get('name')||'').trim(); if(!name)return;
    const initials=name.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
    setMembers(cur=>[{id:Date.now(),name,phone:String(formData.get('phone')||'Não informado'),ministry:String(formData.get('ministry')||'Sem ministério'),birthday:String(formData.get('birthday')||'Não informado'),status:'Ativo',initials},...cur]);
    setModalOpen(false); setScreen('members');
  }

  const title={dashboard:'Visão geral',members:'Membros',birthdays:'Aniversariantes',messages:'Mensagens',settings:'Configurações'}[screen];

  return <main className="app-shell">
    <aside className={`sidebar ${menuOpen?'open':''}`}>
      <div className="brand-row"><ChurchLogo/><button className="close-menu" onClick={()=>setMenuOpen(false)} aria-label="Fechar"><X/></button></div>
      <span className="module-label">GESTÃO DE MEMBROS</span>
      <nav>{screens.map(([key,label,Icon])=><button key={key} className={screen===key?'active':''} onClick={()=>go(key)}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="church-card"><strong>Comunidade Evangélica</strong><span>Amigo Mais Que Irmão</span></div>
    </aside>

    <section className="content">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMenuOpen(true)} aria-label="Abrir menu"><Menu/></button><div className="page-title"><small>CEAMI MEMBROS</small><h1>{title}</h1></div><button className="notification" aria-label="Notificações"><Bell size={20}/><i/></button></header>
      {screen==='dashboard'&&<><section className="hero-card"><div><span>COMUNIDADE CEAMI</span><h2>Cuidar de pessoas começa por conhecê-las.</h2><p>Cadastre, acompanhe e celebre cada membro da igreja.</p></div><button onClick={()=>setModalOpen(true)}><Plus size={18}/>Novo membro</button></section><section className="stats-grid"><article><Users/><div><span>Total de membros</span><strong>{members.length}</strong><small>Cadastros ativos</small></div></article><article><Cake/><div><span>Aniversários no mês</span><strong>12</strong><small>1 hoje</small></div></article><article><MessageCircle/><div><span>Mensagens enviadas</span><strong>34</strong><small>100% entregues</small></div></article></section><section className="dashboard-grid"><MemberList members={filtered} query={query} setQuery={setQuery}/><BirthdayCard/></section></>}
      {screen==='members'&&<section className="panel page-panel"><div className="section-head"><div><h2>Membros cadastrados</h2><p>Consulte, pesquise e mantenha os dados atualizados.</p></div><button className="primary" onClick={()=>setModalOpen(true)}><Plus size={18}/>Novo membro</button></div><MemberList members={filtered} query={query} setQuery={setQuery} simple/></section>}
      {screen==='birthdays'&&<section className="panel page-panel"><div className="section-head"><div><h2>Aniversariantes</h2><p>Organizados por data para facilitar o cuidado.</p></div></div><div className="birthday-list">{members.map(m=><article key={m.id}><div className="member-avatar">{m.initials}</div><div><strong>{m.name}</strong><span>{m.ministry}</span></div><b>{m.birthday}</b><button><MessageCircle size={18}/>Parabenizar</button></article>)}</div></section>}
      {screen==='messages'&&<section className="panel page-panel"><div className="empty-state"><MessageCircle/><h2>Mensagens automáticas</h2><p>Aqui ficarão o histórico, a programação e o status dos parabéns enviados pelo WhatsApp.</p><button className="primary">Configurar mensagem</button></div></section>}
      {screen==='settings'&&<section className="panel page-panel settings-grid"><div><h2>Configurações</h2><p>Defina o horário, texto padrão e integração do WhatsApp.</p></div><label>Horário de envio<input type="time" defaultValue="08:00"/></label><label>Mensagem padrão<textarea defaultValue="Hoje celebramos a sua vida! Que Deus continue abençoando sua caminhada. Feliz aniversário! 🎉"/></label><button className="primary"><CheckCircle2 size={18}/>Salvar configurações</button></section>}
    </section>

    {menuOpen&&<button className="menu-overlay" onClick={()=>setMenuOpen(false)} aria-label="Fechar menu"/>}
    {modalOpen&&<div className="modal-overlay" onMouseDown={()=>setModalOpen(false)}><form className="modal member-form" action={addMember} onMouseDown={e=>e.stopPropagation()}><div className="modal-header"><div><h2>Novo membro</h2><p>Ficha completa de integração à CEAMI.</p></div><button type="button" onClick={()=>setModalOpen(false)}><X/></button></div><div className="modal-body">
      <fieldset><legend>Dados pessoais</legend><div className="form-grid"><label className="full">Nome completo<input name="name" required placeholder="João da Silva"/></label><label>WhatsApp<input name="phone" inputMode="tel" placeholder="(51) 99999-9999"/></label><label>E-mail<input name="email" type="email" placeholder="nome@email.com"/></label><label>Data de nascimento<input name="birthday" type="date"/></label><label>Estado civil<select name="marital_status"><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option><option>União estável</option></select></label><label className="full">Nome do cônjuge<input name="spouse_name"/></label></div></fieldset>
      <fieldset><legend>Endereço</legend><div className="form-grid"><label className="full">Endereço<input name="address"/></label><label>Bairro<input name="neighborhood"/></label><label>Cidade<input name="city"/></label><label>CEP<input name="zip_code" inputMode="numeric"/></label></div></fieldset>
      <fieldset><legend>Família</legend><div className="choice-row"><label className="check-card"><input type="checkbox" name="has_children"/><span>Tem filhos</span></label></div><label>Nomes dos filhos<textarea name="children_names" placeholder="Um nome por linha"/></label></fieldset>
      <fieldset><legend>Histórico de fé</legend><div className="choice-grid"><label className="check-card"><input type="checkbox" name="previous_church"/><span>Veio de outra igreja</span></label><label className="check-card"><input type="checkbox" name="water_baptized"/><span>Batizado nas águas</span></label><label className="check-card"><input type="checkbox" name="holy_spirit_baptized"/><span>Batizado no Espírito Santo</span></label><label className="check-card"><input type="checkbox" name="fundamentos_fe"/><span>Curso Fundamentos da Fé</span></label></div><div className="form-grid"><label>Igreja anterior<input name="previous_church_name"/></label><label>Igreja do batismo<input name="baptism_church"/></label><label>Data do batismo<input name="baptism_date" type="date"/></label><label>Data do curso<input name="fundamentos_fe_date" type="date"/></label></div></fieldset>
      <fieldset><legend>Serviço e ministério</legend><div className="form-grid"><label>Ministério<select name="ministry"><option>Sem ministério</option><option>Louvor</option><option>Jovens</option><option>Infantil</option><option>Ação social</option><option>Intercessão</option></select></label><label>Talentos e habilidades<input name="talents" placeholder="Música, ensino, recepção..."/></label><label className="full">Observações<textarea name="notes"/></label></div></fieldset>
      <label className="check-card consent"><input type="checkbox" name="whatsapp_consent"/><span>Autoriza contato e mensagens da igreja pelo WhatsApp</span></label>
    </div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModalOpen(false)}>Cancelar</button><button type="submit" className="primary">Salvar membro</button></div></form></div>}
  </main>;
}

function MemberList({members,query,setQuery,simple=false}:{members:Member[];query:string;setQuery:(v:string)=>void;simple?:boolean}){return <div className={simple?'member-block':'panel member-block'}>{!simple&&<div className="panel-title"><div><h3>Membros recentes</h3><p>Cadastros e atualizações</p></div><ChevronRight/></div>}<div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar membro"/></div><div className="member-list">{members.map(m=><article className="member-row" key={m.id}><div className="member-avatar">{m.initials}</div><div className="member-info"><strong>{m.name}</strong><span>{m.phone} · {m.ministry}</span></div><div className="member-date"><Cake size={15}/>{m.birthday}</div><span className={`status ${m.status==='Ativo'?'active-status':'follow-status'}`}>{m.status}</span><ChevronRight size={18}/></article>)}</div></div>}
function BirthdayCard(){return <aside className="panel birthday-card"><div className="panel-title"><div><h3>Aniversariante do dia</h3><p>13 de julho</p></div><Cake/></div><div className="birthday-person"><div className="large-avatar">AC</div><h4>Ana Carolina</h4><span>Louvor · 29 anos</span></div><div className="message-preview">Hoje celebramos a sua vida! Que Deus continue abençoando sua caminhada. Feliz aniversário! 🎉</div><button className="whatsapp"><MessageCircle size={18}/>Enviar parabéns</button></aside>}
