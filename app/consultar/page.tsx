'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, ShieldCheck, UserPlus } from 'lucide-react';
import './consultar.css';

type Result = 'idle' | 'loading' | 'found' | 'updating' | 'saved' | 'not-found' | 'error';
type MemberForm = {
  fullName:string; birthDate:string; phone:string; email:string; address:string; neighborhood:string; city:string;
  maritalStatus:string; spouseName:string; hasChildren:boolean; childrenNames:string; waterBaptized:boolean;
  holySpiritBaptized:boolean; fundamentosFe:boolean;
};

const emptyMember:MemberForm={fullName:'',birthDate:'',phone:'',email:'',address:'',neighborhood:'',city:'',maritalStatus:'',spouseName:'',hasChildren:false,childrenNames:'',waterBaptized:false,holySpiritBaptized:false,fundamentosFe:false};

export default function ConsultarCadastroPage() {
  const [name,setName]=useState(''); const [birthDate,setBirthDate]=useState(''); const [lookupPhone,setLookupPhone]=useState(''); const [lookupEmail,setLookupEmail]=useState(''); const [result,setResult]=useState<Result>('idle');
  const [message,setMessage]=useState(''); const [token,setToken]=useState(''); const [member,setMember]=useState<MemberForm>(emptyMember);

  async function handleSubmit(event:FormEvent<HTMLFormElement>){event.preventDefault();setResult('loading');setMessage('');
    try{const response=await fetch('/api/public/check-member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,birthDate,phone:lookupPhone,email:lookupEmail})});const data=await response.json();
      if(!response.ok){setResult('error');setMessage(data.error||'Não foi possível consultar agora.');return}
      if(data.found){setToken(data.token);setMember({...emptyMember,...data.member});setResult('found')}else setResult('not-found');
    }catch{setResult('error');setMessage('Não foi possível consultar agora. Tente novamente em instantes.')}}

  async function saveUpdate(event:FormEvent<HTMLFormElement>){event.preventDefault();setResult('updating');setMessage('');
    try{const response=await fetch('/api/public/update-member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...member,token})});const data=await response.json();
      if(!response.ok){setResult('found');setMessage(data.error||'Não foi possível salvar.');return}setResult('saved');
    }catch{setResult('found');setMessage('Não foi possível salvar. Tente novamente.')}}

  function update<K extends keyof MemberForm>(key:K,value:MemberForm[K]){setMember(current=>({...current,[key]:value}))}
  function reset(){setResult('idle');setMessage('');setToken('');setMember(emptyMember);setName('');setBirthDate('');setLookupPhone('');setLookupEmail('')}

  return <main className="lookup-page"><section className="lookup-card"><header className="lookup-brand"><div className="lookup-symbol">CE</div><div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div></header>
    {(['idle','loading','error'] as Result[]).includes(result)&&<><div className="lookup-intro"><span>ATUALIZAÇÃO DE CADASTRO</span><h1>Consulte e complete seus dados</h1><p>Digite seu nome e confirme com pelo menos uma opção: nascimento, WhatsApp ou e-mail. O nome pode estar abreviado ou escrito de forma um pouco diferente.</p></div><form onSubmit={handleSubmit} className="lookup-form"><Field label="Nome"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Digite seu nome" autoComplete="name" required/></Field><Field label="Data de nascimento"><input value={birthDate} onChange={e=>setBirthDate(e.target.value)} type="date" autoComplete="bday"/></Field><div className="two-fields"><Field label="WhatsApp"><input value={lookupPhone} onChange={e=>setLookupPhone(e.target.value)} inputMode="tel" placeholder="(51) 99999-9999"/></Field><Field label="E-mail"><input value={lookupEmail} onChange={e=>setLookupEmail(e.target.value)} type="email" placeholder="nome@email.com"/></Field></div>{result==='error'&&<div className="lookup-error">{message}</div>}<button disabled={result==='loading'}><Search size={19}/>{result==='loading'?'Consultando...':'Consultar cadastro'}</button></form><div className="privacy-note"><ShieldCheck size={18}/><span>É necessário que o nome e pelo menos um dado de confirmação correspondam ao cadastro.</span></div></>}

    {(result==='found'||result==='updating')&&<><div className="lookup-intro compact"><span>CADASTRO LOCALIZADO</span><h1>Revise e complete seus dados</h1><p>Os campos vazios vieram incompletos do cadastro anterior. Preencha o que souber e salve.</p></div><form className="lookup-form update-form" onSubmit={saveUpdate}><div className="read-only"><small>Nome</small><strong>{member.fullName}</strong></div><Field label="Data de nascimento"><input value={member.birthDate} onChange={e=>update('birthDate',e.target.value)} type="date" required/></Field><div className="two-fields"><Field label="WhatsApp"><input value={member.phone} onChange={e=>update('phone',e.target.value)} inputMode="tel" required/></Field><Field label="E-mail"><input value={member.email} onChange={e=>update('email',e.target.value)} type="email"/></Field></div><Field label="Endereço"><input value={member.address} onChange={e=>update('address',e.target.value)}/></Field><div className="two-fields"><Field label="Bairro"><input value={member.neighborhood} onChange={e=>update('neighborhood',e.target.value)}/></Field><Field label="Cidade"><input value={member.city} onChange={e=>update('city',e.target.value)}/></Field></div><Field label="Estado civil"><select value={member.maritalStatus} onChange={e=>update('maritalStatus',e.target.value)}><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>União estável</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option></select></Field>{['Casado','União estável'].includes(member.maritalStatus)&&<Field label="Nome do cônjuge"><input value={member.spouseName} onChange={e=>update('spouseName',e.target.value)}/></Field>}<Toggle checked={member.hasChildren} onChange={v=>update('hasChildren',v)} label="Tenho filhos"/>{member.hasChildren&&<Field label="Nome dos filhos"><textarea value={member.childrenNames} onChange={e=>update('childrenNames',e.target.value)}/></Field>}<div className="toggle-list"><Toggle checked={member.waterBaptized} onChange={v=>update('waterBaptized',v)} label="Batizado nas águas"/><Toggle checked={member.holySpiritBaptized} onChange={v=>update('holySpiritBaptized',v)} label="Batizado no Espírito Santo"/><Toggle checked={member.fundamentosFe} onChange={v=>update('fundamentosFe',v)} label="Concluí Fundamentos da Fé"/></div>{message&&<div className="lookup-error">{message}</div>}<button disabled={result==='updating'}>{result==='updating'?'Salvando...':'Salvar atualização'}</button><button type="button" onClick={reset} className="secondary-action">Cancelar</button></form></>}

    {result==='saved'&&<section className="lookup-result success"><CheckCircle2/><span>CADASTRO ATUALIZADO</span><h1>Obrigado!</h1><p>Seus dados foram atualizados com sucesso na base de membros da CEAMI.</p><button type="button" onClick={reset} className="secondary-action">Finalizar</button></section>}
    {result==='not-found'&&<section className="lookup-result pending"><UserPlus/><span>CADASTRO NÃO LOCALIZADO</span><h1>Não conseguimos confirmar seus dados</h1><p>Tente novamente usando outra confirmação. Caso não tenha cadastro, preencha a ficha completa do Integra.</p><Link href="/integra" className="primary-link">Preencher ficha do Integra <ArrowRight size={19}/></Link><button type="button" onClick={reset} className="secondary-action">Tentar novamente</button></section>}
  </section></main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span>{label}</span>{children}</label>}
function Toggle({checked,onChange,label}:{checked:boolean;onChange:(value:boolean)=>void;label:string}){return <label className={`public-toggle ${checked?'checked':''}`}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span>{label}</span><i>{checked?'✓':''}</i></label>}
