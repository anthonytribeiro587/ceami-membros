'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, Search, ShieldCheck, UserPlus } from 'lucide-react';
import './consultar.css';

type Result = 'idle' | 'loading' | 'found' | 'updating' | 'saved' | 'not-found' | 'error';
type Missing = {
  birthDate:boolean; phone:boolean; email:boolean; address:boolean; neighborhood:boolean; city:boolean;
  maritalStatus:boolean; spouseName:boolean;
};
type MemberForm = {
  fullName:string; birthDate:string; phone:string; email:string; address:string; neighborhood:string; city:string;
  maritalStatus:string; spouseName:string; missing:Missing;
};

const emptyMissing:Missing={birthDate:false,phone:false,email:false,address:false,neighborhood:false,city:false,maritalStatus:false,spouseName:false};
const emptyMember:MemberForm={fullName:'',birthDate:'',phone:'',email:'',address:'',neighborhood:'',city:'',maritalStatus:'',spouseName:'',missing:emptyMissing};

export default function ConsultarCadastroPage() {
  const [name,setName]=useState(''); const [birthDate,setBirthDate]=useState(''); const [lookupPhone,setLookupPhone]=useState(''); const [lookupEmail,setLookupEmail]=useState(''); const [result,setResult]=useState<Result>('idle');
  const [message,setMessage]=useState(''); const [token,setToken]=useState(''); const [member,setMember]=useState<MemberForm>(emptyMember);

  async function handleSubmit(event:FormEvent<HTMLFormElement>){event.preventDefault();setResult('loading');setMessage('');
    try{const response=await fetch('/api/public/check-member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,birthDate,phone:lookupPhone,email:lookupEmail})});const data=await response.json();
      if(!response.ok){setResult('error');setMessage(data.error||'Não foi possível consultar agora.');return}
      if(data.found){setToken(data.token);setMember({...emptyMember,...data.member,missing:{...emptyMissing,...data.member.missing}});setResult('found')}else setResult('not-found');
    }catch{setResult('error');setMessage('Não foi possível consultar agora. Tente novamente em instantes.')}}

  async function saveUpdate(event:FormEvent<HTMLFormElement>){event.preventDefault();setResult('updating');setMessage('');
    try{const response=await fetch('/api/public/update-member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...member,token})});const data=await response.json();
      if(!response.ok){setResult('found');setMessage(data.error||'Não foi possível salvar.');return}setResult('saved');
    }catch{setResult('found');setMessage('Não foi possível salvar. Tente novamente.')}}

  function update<K extends keyof MemberForm>(key:K,value:MemberForm[K]){setMember(current=>({...current,[key]:value}))}
  function reset(){setResult('idle');setMessage('');setToken('');setMember(emptyMember);setName('');setBirthDate('');setLookupPhone('');setLookupEmail('')}
  const hasMissing=Object.values(member.missing).some(Boolean);

  return <main className="lookup-page"><section className="lookup-card"><header className="lookup-brand"><div className="lookup-symbol">CE</div><div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div></header>
    {(['idle','loading','error'] as Result[]).includes(result)&&<><div className="lookup-intro"><span>ATUALIZAÇÃO DE CADASTRO</span><h1>Consulte e complete seus dados</h1><p>Informe seu nome completo e confirme com nascimento, WhatsApp ou e-mail. Dados já cadastrados não serão exibidos nem poderão ser alterados por esta página.</p></div><form onSubmit={handleSubmit} className="lookup-form"><Field label="Nome completo"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Digite seu nome completo" autoComplete="name" required/></Field><Field label="Data de nascimento"><input value={birthDate} onChange={e=>setBirthDate(e.target.value)} type="date" autoComplete="bday"/></Field><div className="two-fields"><Field label="WhatsApp"><input value={lookupPhone} onChange={e=>setLookupPhone(e.target.value)} inputMode="tel" placeholder="(51) 99999-9999"/></Field><Field label="E-mail"><input value={lookupEmail} onChange={e=>setLookupEmail(e.target.value)} type="email" placeholder="nome@email.com"/></Field></div>{result==='error'&&<div className="lookup-error">{message}</div>}<button disabled={result==='loading'}><Search size={19}/>{result==='loading'?'Consultando...':'Consultar cadastro'}</button></form><div className="privacy-note"><ShieldCheck size={18}/><span>Nome abreviado só é aceito quando duas confirmações adicionais correspondem ao cadastro.</span></div></>}

    {(result==='found'||result==='updating')&&<><div className="lookup-intro compact"><span>CADASTRO LOCALIZADO</span><h1>Complete apenas o que estiver faltando</h1><p>Por segurança, informações já registradas ficam ocultas e bloqueadas. Correções em dados existentes devem ser solicitadas à secretaria.</p></div><form className="lookup-form update-form" onSubmit={saveUpdate}><div className="read-only"><small>Nome confirmado</small><strong>{member.fullName}</strong></div>
      {!hasMissing&&<div className="privacy-note"><LockKeyhole size={18}/><span>Os dados básicos deste cadastro já estão preenchidos. Procure a secretaria para solicitar alguma correção.</span></div>}
      {member.missing.birthDate?<Field label="Data de nascimento"><input value={member.birthDate} onChange={e=>update('birthDate',e.target.value)} type="date" required/></Field>:<Protected label="Data de nascimento"/>}
      <div className="two-fields">{member.missing.phone?<Field label="WhatsApp"><input value={member.phone} onChange={e=>update('phone',e.target.value)} inputMode="tel" required/></Field>:<Protected label="WhatsApp"/>}{member.missing.email?<Field label="E-mail"><input value={member.email} onChange={e=>update('email',e.target.value)} type="email"/></Field>:<Protected label="E-mail"/>}</div>
      {member.missing.address?<Field label="Endereço"><input value={member.address} onChange={e=>update('address',e.target.value)}/></Field>:<Protected label="Endereço"/>}
      <div className="two-fields">{member.missing.neighborhood?<Field label="Bairro"><input value={member.neighborhood} onChange={e=>update('neighborhood',e.target.value)}/></Field>:<Protected label="Bairro"/>}{member.missing.city?<Field label="Cidade"><input value={member.city} onChange={e=>update('city',e.target.value)}/></Field>:<Protected label="Cidade"/>}</div>
      {member.missing.maritalStatus?<Field label="Estado civil"><select value={member.maritalStatus} onChange={e=>update('maritalStatus',e.target.value)}><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>União estável</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option></select></Field>:<Protected label="Estado civil"/>}
      {member.missing.spouseName&&['Casado','União estável'].includes(member.maritalStatus)&&<Field label="Nome do cônjuge"><input value={member.spouseName} onChange={e=>update('spouseName',e.target.value)}/></Field>}
      <div className="privacy-note"><LockKeyhole size={18}/><span>Batismo, Fundamentos da Fé, filhos e ministérios são dados atualizados somente pela secretaria.</span></div>{message&&<div className="lookup-error">{message}</div>}{hasMissing&&<button disabled={result==='updating'}>{result==='updating'?'Salvando...':'Salvar informações faltantes'}</button>}<button type="button" onClick={reset} className="secondary-action">Finalizar</button></form></>}

    {result==='saved'&&<section className="lookup-result success"><CheckCircle2/><span>CADASTRO COMPLETADO</span><h1>Obrigado!</h1><p>As informações que estavam faltando foram registradas com sucesso.</p><button type="button" onClick={reset} className="secondary-action">Finalizar</button></section>}
    {result==='not-found'&&<section className="lookup-result pending"><UserPlus/><span>CADASTRO NÃO CONFIRMADO</span><h1>Não conseguimos confirmar sua identidade</h1><p>Confira seu nome completo e tente com outro dado de confirmação. Caso ainda não tenha cadastro, preencha a ficha do Integra.</p><Link href="/integra" className="primary-link">Preencher ficha do Integra <ArrowRight size={19}/></Link><button type="button" onClick={reset} className="secondary-action">Tentar novamente</button></section>}
  </section></main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span>{label}</span>{children}</label>}
function Protected({label}:{label:string}){return <div className="read-only"><small>{label}</small><strong>Já cadastrado e protegido</strong></div>}
