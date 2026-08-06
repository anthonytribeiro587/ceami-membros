'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, ShieldCheck, UserPlus, X } from 'lucide-react';
import './consultar.css';
import './correction-modal.css';

type Result = 'idle' | 'loading' | 'found' | 'submitting' | 'not-found' | 'error';
type YesNo = '' | 'yes' | 'no';
type SummaryStatus = 'filled' | 'partial' | 'missing';
type SummaryField = { value: string; status: SummaryStatus };
type SummaryKey = 'birthDate' | 'phone' | 'email' | 'address' | 'family' | 'waterBaptized' | 'holySpiritBaptized' | 'fundamentosFe' | 'talents' | 'ministries';
type EditableSummaryKey = Exclude<SummaryKey, 'ministries'>;
type MemberSummary = Record<SummaryKey, SummaryField>;
type SavedCorrections = Record<SummaryKey, boolean>;

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
  ministries: { value: 'Nenhum informado', status: 'missing' },
};

const emptySaved: SavedCorrections = {
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

function typedDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isoToBr(value: unknown) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return typedDate(raw);
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
}

function asYesNo(value: unknown): YesNo {
  return value === 'yes' || value === 'no' ? value : '';
}

function yesNoText(value: YesNo) {
  if (value === 'yes') return 'Sim';
  if (value === 'no') return 'Não';
  return 'Não informado';
}

function summaryFromForm(key: EditableSummaryKey, form: ReviewForm): SummaryField {
  if (key === 'birthDate') return { value: form.birthDate || 'Não informado', status: form.birthDate ? 'filled' : 'missing' };
  if (key === 'phone') return { value: form.phone || 'Não informado', status: form.phone ? 'filled' : 'missing' };
  if (key === 'email') return { value: form.email || 'Não informado', status: form.email ? 'filled' : 'missing' };
  if (key === 'address') {
    const pieces = [form.address, form.neighborhood, form.city].map(value => value.trim()).filter(Boolean);
    return {
      value: pieces.length ? pieces.join(' • ') : 'Não informado',
      status: pieces.length === 3 ? 'filled' : pieces.length ? 'partial' : 'missing',
    };
  }
  if (key === 'family') {
    const pieces: string[] = [];
    if (form.maritalStatus) pieces.push(form.maritalStatus);
    if (form.spouseName) pieces.push(`Cônjuge: ${form.spouseName}`);
    if (form.hasChildren === 'no') pieces.push('Sem filhos');
    if (form.hasChildren === 'yes') pieces.push(form.childrenNames.trim() ? `Filhos: ${form.childrenNames.trim().replace(/\n+/g, ', ')}` : 'Tem filhos');
    return { value: pieces.length ? pieces.join(' • ') : 'Não informado', status: pieces.length ? 'filled' : 'missing' };
  }
  if (key === 'waterBaptized') return { value: yesNoText(form.waterBaptized), status: form.waterBaptized ? 'filled' : 'missing' };
  if (key === 'holySpiritBaptized') return { value: yesNoText(form.holySpiritBaptized), status: form.holySpiritBaptized ? 'filled' : 'missing' };
  if (key === 'fundamentosFe') return { value: yesNoText(form.fundamentosFe), status: form.fundamentosFe ? 'filled' : 'missing' };
  return { value: form.talents.trim() || 'Não informado', status: form.talents.trim() ? 'filled' : 'missing' };
}

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
  const [saved, setSaved] = useState<SavedCorrections>(emptySaved);
  const [activeCorrection, setActiveCorrection] = useState<EditableSummaryKey | null>(null);

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

      const current = data.member?.current || {};
      const currentMinistries = Array.isArray(current.ministries)
        ? current.ministries
        : Array.isArray(data.currentMinistries)
          ? data.currentMinistries
          : [];

      setToken(data.token);
      setSummary({ ...emptySummary, ...(data.member?.summary || {}) });
      setSaved(emptySaved);
      setForm({
        displayName: data.member?.displayName || 'Membro localizado',
        birthDate: isoToBr(current.birthDate),
        phone: String(current.phone || ''),
        email: String(current.email || ''),
        address: String(current.address || ''),
        neighborhood: String(current.neighborhood || ''),
        city: String(current.city || ''),
        maritalStatus: String(current.maritalStatus || ''),
        spouseName: String(current.spouseName || ''),
        hasChildren: asYesNo(current.hasChildren),
        childrenNames: String(current.childrenNames || ''),
        waterBaptized: asYesNo(current.waterBaptized),
        holySpiritBaptized: asYesNo(current.holySpiritBaptized),
        fundamentosFe: asYesNo(current.fundamentosFe),
        talents: String(current.talents || ''),
        ministries: currentMinistries.map(String),
      });
      setResult('found');
    } catch {
      setResult('error');
      setMessage('Não foi possível consultar agora. Tente novamente em instantes.');
    }
  }

  function update<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function openCorrection(key: SummaryKey) {
    if (key === 'ministries') return;
    setActiveCorrection(key);
    setMessage('');
  }

  function reset() {
    setResult('idle');
    setMessage('');
    setToken('');
    setForm(emptyForm);
    setSummary(emptySummary);
    setSaved(emptySaved);
    setActiveCorrection(null);
    setName('');
    setBirthDate('');
    setLookupPhone('');
    setLookupEmail('');
  }

  function buildChange(key: EditableSummaryKey): { changes?: Record<string, unknown>; error?: string } {
    if (key === 'birthDate') {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(form.birthDate)) return { error: 'Informe a data no formato DD/MM/AAAA.' };
      return { changes: { birthDate: form.birthDate } };
    }
    if (key === 'phone') {
      if (form.phone.replace(/\D/g, '').length < 10) return { error: 'Informe o WhatsApp com DDD.' };
      return { changes: { phone: form.phone } };
    }
    if (key === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return { error: 'Informe um e-mail válido.' };
      return { changes: { email: form.email } };
    }
    if (key === 'address') {
      if (![form.address, form.neighborhood, form.city].some(value => value.trim())) return { error: 'Informe ao menos uma informação de endereço.' };
      return { changes: { address: { address: form.address, neighborhood: form.neighborhood, city: form.city } } };
    }
    if (key === 'family') {
      return {
        changes: {
          family: {
            maritalStatus: form.maritalStatus,
            spouseName: form.spouseName,
            hasChildren: form.hasChildren === '' ? null : form.hasChildren === 'yes',
            childrenNames: form.childrenNames,
          },
        },
      };
    }
    if (key === 'waterBaptized') {
      if (!form.waterBaptized) return { error: 'Selecione Sim ou Não.' };
      return { changes: { waterBaptized: form.waterBaptized === 'yes' } };
    }
    if (key === 'holySpiritBaptized') {
      if (!form.holySpiritBaptized) return { error: 'Selecione Sim ou Não.' };
      return { changes: { holySpiritBaptized: form.holySpiritBaptized === 'yes' } };
    }
    if (key === 'fundamentosFe') {
      if (!form.fundamentosFe) return { error: 'Selecione Sim ou Não.' };
      return { changes: { fundamentosFe: form.fundamentosFe === 'yes' } };
    }
    return { changes: { talents: form.talents } };
  }

  async function saveActiveCorrection() {
    if (!activeCorrection || result === 'submitting') return;
    const key = activeCorrection;
    const prepared = buildChange(key);
    if (!prepared.changes) {
      setMessage(prepared.error || 'Confira a informação preenchida.');
      return;
    }

    setResult('submitting');
    setMessage('');
    try {
      const response = await fetch('/api/public/update-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, changes: prepared.changes }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResult('found');
        setMessage(data.error || 'Não foi possível salvar a alteração.');
        return;
      }

      setSummary(current => ({ ...current, [key]: summaryFromForm(key, form) }));
      setSaved(current => ({ ...current, [key]: true }));
      setActiveCorrection(null);
      setResult('found');
      setMessage(`${summaryLabels[key]} atualizado com sucesso.`);
    } catch {
      setResult('found');
      setMessage('Não foi possível salvar a alteração. Tente novamente.');
    }
  }

  function renderCorrectionFields(key: EditableSummaryKey) {
    if (key === 'birthDate') {
      return <Field label="Data correta"><input value={form.birthDate} onChange={event => update('birthDate', typedDate(event.target.value))} inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA" autoFocus /></Field>;
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
    if (key === 'waterBaptized') return <YesNoField label="Resposta correta" value={form.waterBaptized} onChange={value => update('waterBaptized', value)} />;
    if (key === 'holySpiritBaptized') return <YesNoField label="Resposta correta" value={form.holySpiritBaptized} onChange={value => update('holySpiritBaptized', value)} />;
    if (key === 'fundamentosFe') return <YesNoField label="Concluiu o curso?" value={form.fundamentosFe} onChange={value => update('fundamentosFe', value)} />;
    return <Field label="Talentos e habilidades"><textarea value={form.talents} onChange={event => update('talents', event.target.value)} autoFocus placeholder="Ex.: música, ensino, recepção, crianças..." /></Field>;
  }

  const savedCount = Object.values(saved).filter(Boolean).length;

  return <main className="lookup-page"><section className="lookup-card">
    <header className="lookup-brand"><div className="lookup-symbol">CE</div><div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div></header>

    {(['idle', 'loading', 'error'] as Result[]).includes(result) && <>
      <div className="lookup-intro"><span>ATUALIZAÇÃO DE CADASTRO</span><h1>Consulte seu cadastro</h1><p>Digite seu nome — pode ser apenas o primeiro ou nome + sobrenome — e sua data de nascimento.</p></div>
      <form onSubmit={handleSubmit} className="lookup-form">
        <Field label="Nome"><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Maria Silva" required /></Field>
        <Field label="Data de nascimento"><input value={birthDate} onChange={event => setBirthDate(typedDate(event.target.value))} inputMode="numeric" autoComplete="bday" maxLength={10} placeholder="DD/MM/AAAA" /></Field>
        <details className="alternative-lookup"><summary>Não encontrou pela data de nascimento?</summary><p>Use seu WhatsApp ou e-mail como alternativa.</p><div className="two-fields"><Field label="WhatsApp"><input value={lookupPhone} onChange={event => setLookupPhone(event.target.value)} inputMode="tel" /></Field><Field label="E-mail"><input value={lookupEmail} onChange={event => setLookupEmail(event.target.value)} type="email" /></Field></div></details>
        {result === 'error' && <div className="lookup-error">{message}</div>}
        <button disabled={result === 'loading'}><Search size={19} />{result === 'loading' ? 'Consultando...' : 'Consultar cadastro'}</button>
      </form>
      <div className="privacy-note"><ShieldCheck size={18} /><span>Os dados completos só aparecem quando nome e uma informação de confirmação correspondem a um único cadastro.</span></div>
    </>}

    {(result === 'found' || result === 'submitting') && <>
      <div className="lookup-intro compact"><span>CADASTRO LOCALIZADO</span><h1>Confira seus dados</h1><p>Se algo estiver errado, toque em “Editar”. Ao salvar, o cadastro é atualizado na hora.</p></div>
      <div className="read-only identity-card"><small>Cadastro confirmado</small><strong>{form.displayName}</strong></div>

      {message && !activeCorrection && <div className="no-corrections" style={{ marginBottom: 18 }}><CheckCircle2 size={22} /><div><strong>Alteração salva</strong><span>{message}</span></div></div>}

      <section className="summary-section">
        <div className="summary-heading"><div><h2>Dados cadastrados</h2><p>Confira campo por campo. Ministérios são definidos e mantidos pela liderança.</p></div>{savedCount > 0 && <span>{savedCount} atualizado{savedCount === 1 ? '' : 's'}</span>}</div>
        <div className="summary-grid">
          {summaryOrder.map(key => <SummaryCard key={key} label={summaryLabels[key]} field={summary[key]} saved={saved[key]} editable={key !== 'ministries'} onOpen={() => openCorrection(key)} />)}
        </div>
      </section>

      <div className="no-corrections"><CheckCircle2 size={22} /><div><strong>Está tudo certo?</strong><span>Se os dados estiverem corretos, é só finalizar. Não precisa enviar nada.</span></div></div>
      <button type="button" onClick={reset} className="secondary-action">Finalizar consulta</button>
    </>}

    {result === 'not-found' && <section className="lookup-result pending"><UserPlus /><span>CADASTRO NÃO CONFIRMADO</span><h1>Não conseguimos confirmar seu cadastro</h1><p>Confira o nome e a data de nascimento. Caso não tenha cadastro, preencha a ficha completa do Integra.</p><Link href="/integra" className="primary-link">Preencher ficha do Integra <ArrowRight size={19} /></Link><button type="button" onClick={reset} className="secondary-action">Tentar novamente</button></section>}
  </section>

  {activeCorrection && <div className="correction-modal-backdrop" onMouseDown={() => result !== 'submitting' && setActiveCorrection(null)}>
    <section className="correction-modal" role="dialog" aria-modal="true" aria-labelledby="correction-modal-title" onMouseDown={event => event.stopPropagation()}>
      <header>
        <div><small>{summary[activeCorrection].status === 'missing' ? 'PREENCHER INFORMAÇÃO' : 'EDITAR INFORMAÇÃO'}</small><h2 id="correction-modal-title">{summaryLabels[activeCorrection]}</h2><p>O valor atual já aparece preenchido. Altere somente o que estiver errado.</p></div>
        <button type="button" disabled={result === 'submitting'} onClick={() => setActiveCorrection(null)} aria-label="Fechar"><X size={21} /></button>
      </header>
      <div className="correction-modal-body lookup-form">
        {renderCorrectionFields(activeCorrection)}
        {message && <div className="lookup-error">{message}</div>}
      </div>
      <footer>
        <button type="button" className="remove-correction" disabled={result === 'submitting'} onClick={() => setActiveCorrection(null)}>Cancelar</button>
        <button type="button" className="confirm-correction" disabled={result === 'submitting'} onClick={() => void saveActiveCorrection()}>{result === 'submitting' ? 'Salvando...' : 'Salvar alteração'}</button>
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

function SummaryCard({ label, field, saved, editable, onOpen }: { label: string; field: SummaryField; saved: boolean; editable: boolean; onOpen: () => void }) {
  return <article className={`summary-card ${field.status} ${saved ? 'selected' : ''}`}><div><small>{label}</small><strong>{field.value}</strong></div>{editable ? <button type="button" onClick={onOpen}>{saved ? 'Editar novamente' : field.status === 'missing' ? 'Preencher' : 'Editar'}</button> : <span style={{ fontSize: 12, fontWeight: 800, color: '#6d7f88', textAlign: 'right' }}>Definido pela liderança</span>}</article>;
}
