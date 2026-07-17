'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, ShieldCheck, UserPlus, X } from 'lucide-react';
import './consultar.css';
import './correction-modal.css';

type Result = 'idle' | 'loading' | 'found' | 'submitting' | 'saved' | 'not-found' | 'error';
type YesNo = '' | 'yes' | 'no';
type SummaryStatus = 'filled' | 'partial' | 'missing';
type SummaryField = { value: string; status: SummaryStatus };
type SummaryKey = 'birthDate' | 'phone' | 'email' | 'address' | 'family' | 'waterBaptized' | 'holySpiritBaptized' | 'fundamentosFe' | 'talents' | 'ministries';
type MemberSummary = Record<SummaryKey, SummaryField>;
type SelectedCorrections = Record<SummaryKey, boolean>;

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

const emptySummary: MemberSummary = {
  birthDate: { value: 'Não informado', status: 'missing' },
  phone: { value: 'Não informado', status: 'missing' },
  email: { value: 'Não informado', status: 'missing' },
  address: { value: 'Não informado', status: 'missing' },
  family: { value: 'Não informado', status: 'missing' },
  waterBaptized: { value: 'Não informado', status: 'missing' },
  holySpiritBaptized: { value: 'Não informado', status: 'missing' },
  fundamentosFe: { value: 'Não informado', status: 'missing' },
  talents: { value: 'Não informado', status: 'missing' },
  ministries: { value: 'Não informado', status: 'missing' },
};

const emptySelected: SelectedCorrections = {
  birthDate: false,
  phone: false,
  email: false,
  address: false,
  family: false,
  waterBaptized: false,
  holySpiritBaptized: false,
  fundamentosFe: false,
  talents: false,
  ministries: false,
};

const emptyForm: ReviewForm = {
  displayName: '',
  birthDate: '',
  phone: '',
  email: '',
  address: '',
  neighborhood: '',
  city: '',
  maritalStatus: '',
  spouseName: '',
  hasChildren: '',
  childrenNames: '',
  waterBaptized: '',
  holySpiritBaptized: '',
  fundamentosFe: '',
  talents: '',
  ministries: [],
  notes: '',
};

const summaryLabels: Record<SummaryKey, string> = {
  birthDate: 'Data de nascimento',
  phone: 'WhatsApp',
  email: 'E-mail',
  address: 'Endereço',
  family: 'Família',
  waterBaptized: 'Batismo nas águas',
  holySpiritBaptized: 'Batismo no Espírito Santo',
  fundamentosFe: 'Fundamentos da Fé',
  talents: 'Talentos e habilidades',
  ministries: 'Ministérios',
};

const summaryOrder = Object.keys(summaryLabels) as SummaryKey[];

export default function ConsultarCadastroPage() {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [result, setResult] = useState<Result>('idle');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [form, setForm] = useState<ReviewForm>(emptyForm);
  const [summary, setSummary] = useState<MemberSummary>(emptySummary);
  const [selected, setSelected] = useState<SelectedCorrections>(emptySelected);
  const [ministryOptions, setMinistryOptions] = useState<string[]>([]);
  const [activeCorrection, setActiveCorrection] = useState<SummaryKey | null>(null);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);
  const selectedKeys = useMemo(() => summaryOrder.filter(key => selected[key]), [selected]);

  useEffect(() => {
    if (!activeCorrection) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeCorrection]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult('loading');
    setMessage('');

    try {
      const response = await fetch('/api/public/check-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, birthDate, phone: lookupPhone, email: lookupEmail }),
      });
      const data = await response.json();

      if (!response.ok) {
        setResult('error');
        setMessage(data.error || 'Não foi possível consultar agora.');
        return;
      }

      if (!data.found) {
        setResult('not-found');
        return;
      }

      const currentMinistries = Array.isArray(data.currentMinistries) ? data.currentMinistries : [];
      setToken(data.token);
      setMinistryOptions(Array.isArray(data.ministryOptions) ? data.ministryOptions : []);
      setSummary({ ...emptySummary, ...(data.member?.summary || {}) });
      setSelected(emptySelected);
      setForm({
        ...emptyForm,
        displayName: data.member?.displayName || 'Membro localizado',
        ministries: currentMinistries,
      });
      setResult('found');
    } catch {
      setResult('error');
      setMessage('Não foi possível consultar agora. Tente novamente em instantes.');
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (!selectedCount) {
      setMessage('Marque pelo menos um item para corrigir ou completar.');
      return;
    }

    const requiredText: Array<[SummaryKey, string, string]> = [
      ['birthDate', form.birthDate, 'Informe a data de nascimento correta.'],
      ['phone', form.phone, 'Informe o novo WhatsApp.'],
      ['email', form.email, 'Informe o novo e-mail.'],
    ];

    for (const [key, value, errorMessage] of requiredText) {
      if (selected[key] && !value.trim()) {
        setMessage(errorMessage);
        setActiveCorrection(key);
        return;
      }
    }

    const changes: Record<string, unknown> = {};
    if (selected.birthDate) changes.birthDate = form.birthDate;
    if (selected.phone) changes.phone = form.phone;
    if (selected.email) changes.email = form.email;
    if (selected.address) changes.address = {
      address: form.address,
      neighborhood: form.neighborhood,
      city: form.city,
    };
    if (selected.family) {
      changes.family = {
        maritalStatus: form.maritalStatus,
        spouseName: form.spouseName,
        hasChildren: form.hasChildren === '' ? null : form.hasChildren === 'yes',
        childrenNames: form.childrenNames,
      };
    }

    const booleanChanges: Array<[SummaryKey, keyof ReviewForm, string]> = [
      ['waterBaptized', 'waterBaptized', 'Batismo nas águas'],
      ['holySpiritBaptized', 'holySpiritBaptized', 'Batismo no Espírito Santo'],
      ['fundamentosFe', 'fundamentosFe', 'Fundamentos da Fé'],
    ];

    for (const [selectionKey, formKey, label] of booleanChanges) {
      if (!selected[selectionKey]) continue;
      const value = form[formKey] as YesNo;
      if (value === '') {
        setMessage(`Selecione Sim ou Não em “${label}”.`);
        setActiveCorrection(selectionKey);
        return;
      }
      changes[selectionKey] = value === 'yes';
    }

    if (selected.talents) changes.talents = form.talents;
    if (selected.ministries) changes.ministries = form.ministries;

    setResult('submitting');
    try {
      const response = await fetch('/api/public/update-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, changes, notes: form.notes }),
      });
      const data = await response.json();

      if (!response.ok) {
        setResult('found');
        setMessage(data.error || 'Não foi possível enviar.');
        return;
      }

      setResult('saved');
    } catch {
      setResult('found');
      setMessage('Não foi possível enviar. Tente novamente.');
    }
  }

  function update<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function openCorrection(key: SummaryKey) {
    setSelected(current => ({ ...current, [key]: true }));
    setActiveCorrection(key);
    setMessage('');
  }

  function removeCorrection(key: SummaryKey) {
    setSelected(current => ({ ...current, [key]: false }));
    setActiveCorrection(null);
    setMessage('');
  }

  function toggleMinistry(option: string) {
    update(
      'ministries',
      form.ministries.includes(option)
        ? form.ministries.filter(item => item !== option)
        : [...form.ministries, option],
    );
  }

  function reset() {
    setResult('idle');
    setMessage('');
    setToken('');
    setForm(emptyForm);
    setSummary(emptySummary);
    setSelected(emptySelected);
    setMinistryOptions([]);
    setActiveCorrection(null);
    setName('');
    setBirthDate('');
    setLookupPhone('');
    setLookupEmail('');
  }

  function renderCorrectionFields(key: SummaryKey) {
    if (key === 'birthDate') {
      return <Field label="Data correta"><input value={form.birthDate} onChange={event => update('birthDate', event.target.value)} type="date" autoFocus /></Field>;
    }
    if (key === 'phone') {
      return <Field label="Novo número"><input value={form.phone} onChange={event => update('phone', event.target.value)} inputMode="tel" autoFocus placeholder="(51) 99999-9999" /></Field>;
    }
    if (key === 'email') {
      return <Field label="Novo e-mail"><input value={form.email} onChange={event => update('email', event.target.value)} type="email" autoFocus /></Field>;
    }
    if (key === 'address') {
      return <>
        <Field label="Endereço"><input value={form.address} onChange={event => update('address', event.target.value)} autoFocus /></Field>
        <div className="two-fields">
          <Field label="Bairro"><input value={form.neighborhood} onChange={event => update('neighborhood', event.target.value)} /></Field>
          <Field label="Cidade"><input value={form.city} onChange={event => update('city', event.target.value)} /></Field>
        </div>
      </>;
    }
    if (key === 'family') {
      return <>
        <Field label="Estado civil"><select value={form.maritalStatus} onChange={event => update('maritalStatus', event.target.value)} autoFocus><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>União estável</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option></select></Field>
        <Field label="Nome do cônjuge"><input value={form.spouseName} onChange={event => update('spouseName', event.target.value)} /></Field>
        <YesNoField label="Tem filhos?" value={form.hasChildren} onChange={value => update('hasChildren', value)} />
        {form.hasChildren === 'yes' && <Field label="Nome dos filhos"><textarea value={form.childrenNames} onChange={event => update('childrenNames', event.target.value)} /></Field>}
      </>;
    }
    if (key === 'waterBaptized') {
      return <YesNoField label="Resposta correta" value={form.waterBaptized} onChange={value => update('waterBaptized', value)} />;
    }
    if (key === 'holySpiritBaptized') {
      return <YesNoField label="Resposta correta" value={form.holySpiritBaptized} onChange={value => update('holySpiritBaptized', value)} />;
    }
    if (key === 'fundamentosFe') {
      return <YesNoField label="Concluiu o curso?" value={form.fundamentosFe} onChange={value => update('fundamentosFe', value)} />;
    }
    if (key === 'talents') {
      return <Field label="Talentos e habilidades"><textarea value={form.talents} onChange={event => update('talents', event.target.value)} autoFocus placeholder="Ex.: música, ensino, recepção, crianças..." /></Field>;
    }
    return <div className="ministry-field">
      <span>Selecione como deve ficar</span>
      <p>As funções específicas importadas do Voluts não serão apagadas.</p>
      <div className="ministry-options">
        {ministryOptions.map(option => <button key={option} type="button" className={form.ministries.includes(option) ? 'selected' : ''} onClick={() => toggleMinistry(option)}>{form.ministries.includes(option) ? '✓ ' : ''}{option}</button>)}
      </div>
    </div>;
  }

  return <main className="lookup-page"><section className="lookup-card">
    <header className="lookup-brand"><div className="lookup-symbol">CE</div><div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div></header>

    {(['idle', 'loading', 'error'] as Result[]).includes(result) && <>
      <div className="lookup-intro"><span>ATUALIZAÇÃO DE CADASTRO</span><h1>Consulte seu cadastro</h1><p>Digite seu nome — pode ser apenas o primeiro — e sua data de nascimento.</p></div>
      <form onSubmit={handleSubmit} className="lookup-form">
        <Field label="Nome"><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Anthony" required /></Field>
        <Field label="Data de nascimento"><input value={birthDate} onChange={event => setBirthDate(event.target.value)} type="date" /></Field>
        <details className="alternative-lookup"><summary>Não encontrou pela data de nascimento?</summary><p>Use seu WhatsApp ou e-mail como alternativa.</p><div className="two-fields"><Field label="WhatsApp"><input value={lookupPhone} onChange={event => setLookupPhone(event.target.value)} inputMode="tel" /></Field><Field label="E-mail"><input value={lookupEmail} onChange={event => setLookupEmail(event.target.value)} type="email" /></Field></div></details>
        {result === 'error' && <div className="lookup-error">{message}</div>}
        <button disabled={result === 'loading'}><Search size={19} />{result === 'loading' ? 'Consultando...' : 'Consultar cadastro'}</button>
      </form>
      <div className="privacy-note"><ShieldCheck size={18} /><span>Dados pessoais aparecem apenas de forma mascarada ou resumida.</span></div>
    </>}

    {(result === 'found' || result === 'submitting') && <>
      <div className="lookup-intro compact"><span>IDENTIDADE CONFIRMADA</span><h1>Confira o que já está cadastrado</h1><p>Toque em “Corrigir” ou “Preencher”. O campo será aberto sem tirar você desta parte da página.</p></div>
      <div className="read-only identity-card"><small>Cadastro confirmado</small><strong>{form.displayName}</strong></div>

      <section className="summary-section">
        <div className="summary-heading"><div><h2>Resumo do cadastro</h2><p>Informações sensíveis continuam protegidas.</p></div><span>{selectedCount} selecionado{selectedCount === 1 ? '' : 's'}</span></div>
        <div className="summary-grid">
          {summaryOrder.map(key => <SummaryCard key={key} label={summaryLabels[key]} field={summary[key]} selected={selected[key]} onOpen={() => openCorrection(key)} />)}
        </div>
      </section>

      {selectedCount > 0 ? <form className="lookup-form correction-submit" onSubmit={submitRequest}>
        <div className="correction-heading"><span>ALTERAÇÕES SELECIONADAS</span><h2>Revise antes de enviar</h2><p>Toque em um item para editar novamente. A secretaria fará a conferência antes de alterar o cadastro.</p></div>
        <div className="selected-corrections">
          {selectedKeys.map(key => <button type="button" key={key} onClick={() => setActiveCorrection(key)}><span>{summaryLabels[key]}</span><strong>Editar</strong></button>)}
        </div>
        <Field label="Observação para a secretaria"><textarea value={form.notes} onChange={event => update('notes', event.target.value)} placeholder="Explique algo importante sobre a correção" /></Field>
        {message && <div className="lookup-error">{message}</div>}
        <button disabled={result === 'submitting'}>{result === 'submitting' ? 'Enviando...' : `Enviar ${selectedCount} ${selectedCount === 1 ? 'alteração' : 'alterações'} para revisão`}</button>
      </form> : <div className="no-corrections"><CheckCircle2 size={22} /><div><strong>Está tudo certo?</strong><span>Nenhuma ação é necessária. Você pode finalizar a consulta.</span></div></div>}

      <button type="button" onClick={reset} className="secondary-action">Finalizar</button>
    </>}

    {result === 'saved' && <section className="lookup-result success"><CheckCircle2 /><span>SOLICITAÇÃO ENVIADA</span><h1>Obrigado!</h1><p>A secretaria recebeu apenas os itens selecionados e fará a conferência antes de alterar o cadastro.</p><button type="button" onClick={reset} className="secondary-action">Finalizar</button></section>}
    {result === 'not-found' && <section className="lookup-result pending"><UserPlus /><span>CADASTRO NÃO CONFIRMADO</span><h1>Não conseguimos confirmar sua identidade</h1><p>Confira o nome e a data de nascimento. Caso não tenha cadastro, preencha a ficha completa do Integra.</p><Link href="/integra" className="primary-link">Preencher ficha do Integra <ArrowRight size={19} /></Link><button type="button" onClick={reset} className="secondary-action">Tentar novamente</button></section>}
  </section>

  {activeCorrection && <div className="correction-modal-backdrop" onMouseDown={() => setActiveCorrection(null)}>
    <section className="correction-modal" role="dialog" aria-modal="true" aria-labelledby="correction-modal-title" onMouseDown={event => event.stopPropagation()}>
      <header>
        <div><small>{summary[activeCorrection].status === 'missing' ? 'PREENCHER INFORMAÇÃO' : 'CORRIGIR INFORMAÇÃO'}</small><h2 id="correction-modal-title">{summaryLabels[activeCorrection]}</h2><p>Informe somente o dado novo ou correto.</p></div>
        <button type="button" onClick={() => setActiveCorrection(null)} aria-label="Fechar"><X size={21} /></button>
      </header>
      <div className="correction-modal-body lookup-form">{renderCorrectionFields(activeCorrection)}</div>
      <footer>
        <button type="button" className="remove-correction" onClick={() => removeCorrection(activeCorrection)}>Remover alteração</button>
        <button type="button" className="confirm-correction" onClick={() => setActiveCorrection(null)}>Concluir</button>
      </footer>
    </section>
  </div>}
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span>{label}</span>{children}</label>;
}

function YesNoField({ label, value, onChange }: { label: string; value: YesNo; onChange: (value: YesNo) => void }) {
  return <Field label={label}><select value={value} onChange={event => onChange(event.target.value as YesNo)}><option value="">Selecione</option><option value="yes">Sim</option><option value="no">Não</option></select></Field>;
}

function SummaryCard({ label, field, selected, onOpen }: { label: string; field: SummaryField; selected: boolean; onOpen: () => void }) {
  return <article className={`summary-card ${field.status} ${selected ? 'selected' : ''}`}><div><small>{label}</small><strong>{field.value}</strong></div><button type="button" onClick={onOpen}>{selected ? 'Editar' : field.status === 'missing' ? 'Preencher' : 'Corrigir'}</button></article>;
}
