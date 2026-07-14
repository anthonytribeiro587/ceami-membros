'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, ShieldCheck, UserPlus } from 'lucide-react';
import './consultar.css';

type Result = 'idle' | 'loading' | 'found' | 'updating' | 'saved' | 'not-found' | 'error';
type MemberForm = {
  fullName:string; birthDate:string; phone:string; email:string; address:string; neighborhood:string; city:string;
  maritalStatus:string; spouseName:string; hasChildren:boolean; childrenNames:string; waterBaptized:boolean;
  holySpiritBaptized:boolean; fundamentosFe:boolean; whatsappConsent:boolean;
};

const emptyMember:MemberForm={fullName:'',birthDate:'',phone:'',email:'',address:'',neighborhood:'',city:'',maritalStatus:'',spouseName:'',hasChildren:false,childrenNames:'',waterBaptized:false,holySpiritBaptized:false,fundamentosFe:false,whatsappConsent:true};

export default function ConsultarCadastroPage() {
  const [name,setName]=useState(''); const [birthDate,setBirthDate]=useState(''); const [result,setResult]=useState<Result>('idle');
  const [message,setMessage]=useState(''); const [token,setToken]=useState(''); const [member,setMember]=useState<MemberForm>(emptyMember);

  async function handleSubmit(event:FormEvent<HTMLFormElement>){event.preventDefault();setResult('loading');setMessage('');
    try{const response=await fetch('/api/public/check-member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,birthDate})});const data=await response.json();
      if(!response.ok){setResult('error');setMessage(data.error||'Não foi possível consultar agora.');return}
      if(data.found){setToken(data.token);setMember({...emptyMember,...data.member});setResult('found')}else setResult('not-found');
    }catch{setResult('error');setMessage('Não foi possível consultar agora. Tente novamente em instantes.')}}

  async function saveUpdate(event:FormEvent<HTMLFormElement>){event.preventDefault();setResult('updating');setMessage('');
    try{const response=await fetch('/api/public/update-member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...member,token})});const data=await response.json();
      if(!response.ok){setResult('found');setMessage(data.error||'Não foi possível salvar.');return}setResult('saved');
    }catch{setResult('found');setMessage('Não foi possível salvar. Tente novamente.')}}

  function update<K extends keyof MemberForm>(key:K,value:MemberForm[K]){setMember(current=>({...current,[key]:value}))}
  function reset(){setResult('idle');setMessage('');setToken('');setMember(emptyMember)}

  return <main className="lookup-page"><section className="lookup-card"><header className="lookup-brand"><div className="lookup-symbol">CE</div><div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div></header>
    {(['idle','loading','error'] as Result[]).includes(result)&&<><div className="lookup-intro"><span>ATUALIZAÇÃO DE CADASTRO</span><h1>Consulte e complete seus dados</h1><p>Informe seu nome completo e sua data de nascimento. Encontrando seu cadastro, você poderá revisar e completar as informações.</p></div><form onSubmit={handleSubmit} className="lookup-form"><Field label="Nome completo"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Digite seu nome completo" autoComplete="name" required/></Field><Field label="Data de nascimento"><input value={birthDate} onChange={e=>setBirthDate(e.target.value)} type="date" autoComplete="bday" required/></Field>{result==='error'&&<div className="lookup-error">{message}</div>}<button disabled={result==='loading'}><Search size={19}/>{result==='loading'?'Consultando...':'Consultar cadastro'}</button></form><div className="privacy-note"><ShieldCheck size={18}/><span>Seus dados são usados apenas para identificar e atualizar seu próprio cadastro.</span></div></>}

    {(result==='found'||result==='updating')&&<><div className="lookup-intro compact"><span>CADASTRO LOCALIZADO</span><h1>Revise e complete seus dados</h1><p>Os campos vazios vieram incompletos do cadastro anterior. Preencha o que souber e salve.</p></div><form className="lookup-form update-form" onSubmit={saveUpdate}><div className="read-only"><small>Nome</small><strong>{member.fullName}</strong></div><div className="read-only"><small>Data de nascimento</small><strong>{member.birthDate.split('-').reverse().join('/')}</strong></div><div className="two-fields"><Field label="WhatsApp"><input value={member.phone} onChange={e=>update('phone',e.target.value)} inputMode="tel" required/></Field><Field label="E-mail"><input value={member.email} onChange={e=>update('email',e.target.value)} type="email"/></Field></div><Field label="Endereço"><input value={member.address} onChange={e=>update('address',e.target.value)}/></Field><div className="two-fields"><Field label="Bairro"><input value={member.neighborhood} onChange={e=>update('neighborhood',e.target.value)}/></Field><Field label="Cidade"><input value={member.city} onChange={e=>update('city',e.target.value)}/></Field></div><Field label="Estado civil"><select value={member.maritalStatus} onChange={e=>update('maritalStatus',e.target.value)}><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>União estável</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option></select></Field>{['Casado','União estável'].includes(member.maritalStatus)&&<Field label="Nome do cônjuge"><input value={member.spouseName} onChange={e=>update('spouseName',e.target.value)}/></Field>}<Toggle checked={member.hasChildren} onChange={v=>update('hasChildren',v)} label="Tenho filhos"/>{member.hasChildren&&<Field label="Nome dos filhos"><textarea value={member.childrenNames} onChange={e=>update('childrenNames',e.target.value)}/></Field>}<div className="toggle-list"><Toggle checked={member.waterBaptized} onChange={v=>update('waterBaptized',v)} label="Batizado nas águas"/><Toggle checked={member.holySpiritBaptized} onChange={v=>update('holySpiritBaptized',v)} label="Batizado no Espírito Santo"/><Toggle checked={member.fundamentosFe} onChange={v=>update('fundamentosFe',v)} label="Concluí Fundamentos da Fé"/><Toggle checked={member.whatsappConsent} onChange={v=>update('whatsappConsent',v)} label="Autorizo contato pelo WhatsApp"/></div>{message&&<div className="lookup-error">{message}</div>}<button disabled={result==='updating'}>{result==='updating'?'Salvando...':'Salvar atualização'}</button><button type="button" onClick={reset} className="secondary-action">Cancelar</button></form></>}

    {result==='saved'&&<section className="lookup-result success"><CheckCircle2/><span>CADASTRO ATUALIZADO</span><h1>Obrigado!</h1><p>Seus dados foram atualizados com sucesso na base de membros da CEAMI.</p><button type="button" onClick={reset} className="secondary-action">Finalizar</button></section>}
    {result==='not-found'&&<section className="lookup-result pending"><UserPlus/><span>CADASTRO NÃO LOCALIZADO</span><h1>Vamos fazer seu cadastro?</h1><p>Seus dados ainda não constam no sistema. Preencha a ficha completa do Integra.</p><Link href="/integra" className="primary-link">Preencher ficha do Integra <ArrowRight size={19}/></Link><button type="button" onClick={reset} className="secondary-action">Conferir novamente</button></section>}
  </section></main>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span>{label}</span>{children}</label>}
function Toggle({checked,onChange,label}:{checked:boolean;onChange:(value:boolean)=>void;label:string}){return <label className={`public-toggle ${checked?'checked':''}`}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span>{label}</span><i>{checked?'✓':''}</i></label>}
