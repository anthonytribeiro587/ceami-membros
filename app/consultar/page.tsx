'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, Search, ShieldCheck, UserPlus } from 'lucide-react';
import './consultar.css';

type Result = 'idle' | 'loading' | 'found' | 'submitting' | 'saved' | 'not-found' | 'error';
type YesNo = '' | 'yes' | 'no';

type ReviewForm = {
  displayName: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  neighborhood: string;
  city: string;
  maritalStatus: string;
  spouseName: string;
  hasChildren: YesNo;
  childrenNames: string;
  waterBaptized: YesNo;
  holySpiritBaptized: YesNo;
  fundamentosFe: YesNo;
  talents: string;
  ministries: string[];
  notes: string;
};

const emptyForm: ReviewForm = {
  displayName: '', birthDate: '', phone: '', email: '', address: '', neighborhood: '', city: '', maritalStatus: '', spouseName: '',
  hasChildren: '', childrenNames: '', waterBaptized: '', holySpiritBaptized: '', fundamentosFe: '', talents: '', ministries: [], notes: '',
};

export default function ConsultarCadastroPage() {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [result, setResult] = useState<Result>('idle');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [form, setForm] = useState<ReviewForm>(emptyForm);
  const [ministryOptions, setMinistryOptions] = useState<string[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setResult('loading'); setMessage('');
    try {
      const response = await fetch('/api/public/check-member', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, birthDate, phone: lookupPhone, email: lookupEmail }),
      });
      const data = await response.json();
      if (!response.ok) { setResult('error'); setMessage(data.error || 'Não foi possível consultar agora.'); return; }
      if (!data.found) { setResult('not-found'); return; }
      setToken(data.token);
      setMinistryOptions(Array.isArray(data.ministryOptions) ? data.ministryOptions : []);
      setForm({ ...emptyForm, displayName: data.member?.displayName || 'Membro localizado' });
      setResult('found');
    } catch {
      setResult('error'); setMessage('Não foi possível consultar agora. Tente novamente em instantes.');
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setResult('submitting'); setMessage('');
    const mapYesNo = (value: YesNo) => value === '' ? null : value === 'yes';
    try {
      const response = await fetch('/api/public/update-member', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, token,
          hasChildren: mapYesNo(form.hasChildren),
          waterBaptized: mapYesNo(form.waterBaptized),
          holySpiritBaptized: mapYesNo(form.holySpiritBaptized),
          fundamentosFe: mapYesNo(form.fundamentosFe),
        }),
      });
      const data = await response.json();
      if (!response.ok) { setResult('found'); setMessage(data.error || 'Não foi possível enviar.'); return; }
      setResult('saved');
    } catch {
      setResult('found'); setMessage('Não foi possível enviar. Tente novamente.');
    }
  }

  function update<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) { setForm(current => ({ ...current, [key]: value })); }
  function toggleMinistry(option: string) { update('ministries', form.ministries.includes(option) ? form.ministries.filter(item => item !== option) : [...form.ministries, option]); }
  function reset() { setResult('idle'); setMessage(''); setToken(''); setForm(emptyForm); setMinistryOptions([]); setName(''); setBirthDate(''); setLookupPhone(''); setLookupEmail(''); }

  return <main className="lookup-page"><section className="lookup-card">
    <header className="lookup-brand"><div className="lookup-symbol">CE</div><div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div></header>

    {(['idle', 'loading', 'error'] as Result[]).includes(result) && <>
      <div className="lookup-intro"><span>ATUALIZAÇÃO DE CADASTRO</span><h1>Consulte seu cadastro</h1><p>Confirme sua identidade. Nenhum dado já salvo será exibido nesta página.</p></div>
      <form onSubmit={handleSubmit} className="lookup-form">
        <Field label="Nome"><input value={name} onChange={e => setName(e.target.value)} required /></Field>
        <Field label="Data de nascimento"><input value={birthDate} onChange={e => setBirthDate(e.target.value)} type="date" /></Field>
        <div className="two-fields"><Field label="WhatsApp"><input value={lookupPhone} onChange={e => setLookupPhone(e.target.value)} inputMode="tel" /></Field><Field label="E-mail"><input value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} type="email" /></Field></div>
        {result === 'error' && <div className="lookup-error">{message}</div>}
        <button disabled={result === 'loading'}><Search size={19} />{result === 'loading' ? 'Consultando...' : 'Consultar cadastro'}</button>
      </form>
      <div className="privacy-note"><ShieldCheck size={18} /><span>É necessário nome e pelo menos uma confirmação correspondente.</span></div>
    </>}

    {(result === 'found' || result === 'submitting') && <>
      <div className="lookup-intro compact"><span>IDENTIDADE CONFIRMADA</span><h1>Solicite a atualização dos seus dados</h1><p>Por segurança, os dados atuais não são mostrados. Preencha somente aquilo que deseja informar ou corrigir. A secretaria revisará antes de alterar o cadastro.</p></div>
      <form className="lookup-form update-form" onSubmit={submitRequest}>
        <div className="read-only"><small>Cadastro confirmado</small><strong>{form.displayName}</strong></div>
        <div className="privacy-note"><LockKeyhole size={18} /><span>Nomes de cônjuge, filhos, contatos e demais informações existentes permanecem ocultos.</span></div>
        <Field label="Nova data de nascimento ou correção"><input value={form.birthDate} onChange={e => update('birthDate', e.target.value)} type="date" /></Field>
        <div className="two-fields"><Field label="WhatsApp novo ou corrigido"><input value={form.phone} onChange={e => update('phone', e.target.value)} inputMode="tel" /></Field><Field label="E-mail novo ou corrigido"><input value={form.email} onChange={e => update('email', e.target.value)} type="email" /></Field></div>
        <Field label="Endereço novo ou corrigido"><input value={form.address} onChange={e => update('address', e.target.value)} /></Field>
        <div className="two-fields"><Field label="Bairro"><input value={form.neighborhood} onChange={e => update('neighborhood', e.target.value)} /></Field><Field label="Cidade"><input value={form.city} onChange={e => update('city', e.target.value)} /></Field></div>
        <Field label="Estado civil"><select value={form.maritalStatus} onChange={e => update('maritalStatus', e.target.value)}><option value="">Não desejo informar/alterar</option><option>Solteiro</option><option>Casado</option><option>União estável</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option></select></Field>
        <Field label="Nome do cônjuge"><input value={form.spouseName} onChange={e => update('spouseName', e.target.value)} placeholder="Preencha apenas se desejar informar ou corrigir" /></Field>
        <YesNoField label="Tem filhos?" value={form.hasChildren} onChange={value => update('hasChildren', value)} />
        <Field label="Nome dos filhos"><textarea value={form.childrenNames} onChange={e => update('childrenNames', e.target.value)} placeholder="Preencha apenas se desejar informar ou corrigir" /></Field>
        <YesNoField label="Batizado(a) nas águas?" value={form.waterBaptized} onChange={value => update('waterBaptized', value)} />
        <YesNoField label="Batizado(a) no Espírito Santo?" value={form.holySpiritBaptized} onChange={value => update('holySpiritBaptized', value)} />
        <YesNoField label="Concluiu Fundamentos da Fé?" value={form.fundamentosFe} onChange={value => update('fundamentosFe', value)} />
        <Field label="Talentos e habilidades"><textarea value={form.talents} onChange={e => update('talents', e.target.value)} /></Field>
        <div className="ministry-field"><span>Ministérios em que participa</span><p>Marque apenas se deseja informar ou corrigir.</p><div className="ministry-options">{ministryOptions.map(option => <button key={option} type="button" className={form.ministries.includes(option) ? 'selected' : ''} onClick={() => toggleMinistry(option)}>{form.ministries.includes(option) ? '✓ ' : ''}{option}</button>)}</div></div>
        <Field label="Observação para a secretaria"><textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Explique alguma correção importante" /></Field>
        {message && <div className="lookup-error">{message}</div>}
        <button disabled={result === 'submitting'}>{result === 'submitting' ? 'Enviando...' : 'Enviar para revisão'}</button>
        <button type="button" onClick={reset} className="secondary-action">Cancelar</button>
      </form>
    </>}

    {result === 'saved' && <section className="lookup-result success"><CheckCircle2 /><span>SOLICITAÇÃO ENVIADA</span><h1>Obrigado!</h1><p>A secretaria recebeu sua atualização e fará a conferência antes de aplicar as alterações.</p><button type="button" onClick={reset} className="secondary-action">Finalizar</button></section>}
    {result === 'not-found' && <section className="lookup-result pending"><UserPlus /><span>CADASTRO NÃO CONFIRMADO</span><h1>Não conseguimos confirmar sua identidade</h1><p>Confira os dados ou preencha a ficha completa do Integra.</p><Link href="/integra" className="primary-link">Preencher ficha do Integra <ArrowRight size={19} /></Link><button type="button" onClick={reset} className="secondary-action">Tentar novamente</button></section>}
  </section></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span>{label}</span>{children}</label>; }
function YesNoField({ label, value, onChange }: { label: string; value: YesNo; onChange: (value: YesNo) => void }) { return <Field label={label}><select value={value} onChange={e => onChange(e.target.value as YesNo)}><option value="">Não desejo informar/alterar</option><option value="yes">Sim</option><option value="no">Não</option></select></Field>; }
