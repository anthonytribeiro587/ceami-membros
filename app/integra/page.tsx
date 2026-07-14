'use client';

import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

type FormDataState = {
  full_name: string;
  phone: string;
  email: string;
  birth_date: string;
  marital_status: string;
  spouse_name: string;
  address: string;
  neighborhood: string;
  city: string;
  zip_code: string;
  has_children: boolean;
  children_names: string;
  previous_church: boolean;
  previous_church_name: string;
  water_baptized: boolean;
  baptism_church: string;
  baptism_date: string;
  holy_spirit_baptized: boolean;
  fundamentos_fe: boolean;
  fundamentos_fe_date: string;
  talents: string;
  ministry: string;
  notes: string;
  whatsapp_consent: boolean;
};

const initialData: FormDataState = {
  full_name: '', phone: '', email: '', birth_date: '', marital_status: '', spouse_name: '',
  address: '', neighborhood: '', city: '', zip_code: '', has_children: false, children_names: '',
  previous_church: false, previous_church_name: '', water_baptized: false, baptism_church: '',
  baptism_date: '', holy_spirit_baptized: false, fundamentos_fe: false, fundamentos_fe_date: '',
  talents: '', ministry: 'Sem ministério', notes: '', whatsapp_consent: true,
};

const steps = ['Seus dados', 'Família e endereço', 'Caminhada de fé', 'Talentos e ministério'];

export default function IntegraPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormDataState>(initialData);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const progress = useMemo(() => `${step * 25}%`, [step]);
  const update = <K extends keyof FormDataState>(key: K, value: FormDataState[K]) =>
    setData(current => ({ ...current, [key]: value }));

  function next() {
    if (step === 1 && !data.full_name.trim()) {
      setError('Informe seu nome completo para continuar.');
      return;
    }
    setError('');
    setStep(current => Math.min(4, current + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/integra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar sua ficha.');
      setSuccess(true);
      localStorage.removeItem('ceami-integra-draft');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar sua ficha.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return <main className="integra-page"><section className="integra-success">
      <div className="success-icon"><Check size={34} /></div>
      <span>FICHA ENVIADA</span>
      <h1>Que alegria ter você conosco!</h1>
      <p>Recebemos suas informações. A equipe da CEAMI poderá manter contato e acompanhar seus próximos passos.</p>
      <div className="welcome-note">Seja bem-vindo(a) à sua nova casa.</div>
    </section></main>;
  }

  return <main className="integra-page">
    <header className="integra-brand">
      <div className="integra-mark">CE</div>
      <div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div>
    </header>

    <form className="integra-card" onSubmit={submit}>
      <div className="integra-heading">
        <span>INTEGRA CEAMI</span>
        <h1>Queremos conhecer você</h1>
        <p>Preencha sua ficha com calma. Leva apenas alguns minutos.</p>
      </div>
      <div className="integra-step"><div><small>ETAPA {step} DE 4</small><strong>{steps[step - 1]}</strong></div><span>{step * 25}%</span></div>
      <div className="integra-progress"><i style={{ width: progress }} /></div>

      <div className="integra-fields">
        {step === 1 && <>
          <Field label="Nome completo"><input value={data.full_name} onChange={e => update('full_name', e.target.value)} autoComplete="name" required /></Field>
          <Field label="WhatsApp"><input value={data.phone} onChange={e => update('phone', e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(51) 99999-9999" /></Field>
          <Field label="E-mail"><input value={data.email} onChange={e => update('email', e.target.value)} type="email" autoComplete="email" /></Field>
          <Field label="Data de nascimento"><input className="date-field" value={data.birth_date} onChange={e => update('birth_date', e.target.value)} type="date" /></Field>
          <Field label="Estado civil"><select value={data.marital_status} onChange={e => update('marital_status', e.target.value)}><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option><option>União estável</option></select></Field>
          {['Casado', 'União estável'].includes(data.marital_status) && <Field label="Nome do cônjuge"><input value={data.spouse_name} onChange={e => update('spouse_name', e.target.value)} /></Field>}
        </>}

        {step === 2 && <>
          <Field label="Endereço"><input value={data.address} onChange={e => update('address', e.target.value)} autoComplete="street-address" /></Field>
          <div className="integra-two"><Field label="Bairro"><input value={data.neighborhood} onChange={e => update('neighborhood', e.target.value)} /></Field><Field label="Cidade"><input value={data.city} onChange={e => update('city', e.target.value)} /></Field></div>
          <Field label="CEP"><input value={data.zip_code} onChange={e => update('zip_code', e.target.value)} inputMode="numeric" autoComplete="postal-code" /></Field>
          <Toggle label="Tenho filhos" checked={data.has_children} onChange={value => update('has_children', value)} />
          {data.has_children && <Field label="Nome dos filhos"><textarea value={data.children_names} onChange={e => update('children_names', e.target.value)} placeholder="Um nome por linha" /></Field>}
        </>}

        {step === 3 && <>
          <Toggle label="Eu frequentava outra igreja" checked={data.previous_church} onChange={value => update('previous_church', value)} />
          {data.previous_church && <Field label="Qual igreja?"><input value={data.previous_church_name} onChange={e => update('previous_church_name', e.target.value)} /></Field>}
          <Toggle label="Sou batizado(a) nas águas" checked={data.water_baptized} onChange={value => update('water_baptized', value)} />
          {data.water_baptized && <><Field label="Igreja do batismo"><input value={data.baptism_church} onChange={e => update('baptism_church', e.target.value)} /></Field><Field label="Data do batismo"><input className="date-field" value={data.baptism_date} onChange={e => update('baptism_date', e.target.value)} type="date" /></Field></>}
          <Toggle label="Sou batizado(a) no Espírito Santo" checked={data.holy_spirit_baptized} onChange={value => update('holy_spirit_baptized', value)} />
          <Toggle label="Já concluí Fundamentos da Fé" checked={data.fundamentos_fe} onChange={value => update('fundamentos_fe', value)} />
          {data.fundamentos_fe && <Field label="Data de conclusão"><input className="date-field" value={data.fundamentos_fe_date} onChange={e => update('fundamentos_fe_date', e.target.value)} type="date" /></Field>}
        </>}

        {step === 4 && <>
          <Field label="Talentos e habilidades"><textarea value={data.talents} onChange={e => update('talents', e.target.value)} placeholder="Ex.: música, ensino, recepção, crianças..." /></Field>
          <Field label="Ministério que participa"><select value={data.ministry} onChange={e => update('ministry', e.target.value)}><option>Sem ministério</option><option>Louvor</option><option>Jovens</option><option>Infantil</option><option>Ação social</option><option>Intercessão</option><option>Recepção</option><option>Outro</option></select></Field>
          <Field label="Algo que gostaria de compartilhar?"><textarea value={data.notes} onChange={e => update('notes', e.target.value)} /></Field>
          <Toggle label="Autorizo a CEAMI a entrar em contato comigo pelo WhatsApp" checked={data.whatsapp_consent} onChange={value => update('whatsapp_consent', value)} />
          <p className="consent-help">Essa opção já vem marcada para permitir avisos da igreja, acompanhamento e felicitações. Você pode desmarcar.</p>
        </>}
      </div>

      {error && <div className="integra-error">{error}</div>}
      <footer className="integra-actions">
        {step > 1 ? <button type="button" className="secondary" onClick={() => setStep(step - 1)}><ChevronLeft size={18} />Voltar</button> : <span />}
        {step < 4 ? <button type="button" className="primary" onClick={next}>Continuar<ChevronRight size={18} /></button> : <button type="submit" className="primary" disabled={loading}>{loading ? 'Enviando...' : 'Enviar minha ficha'}</button>}
      </footer>
    </form>
    <p className="integra-footer">Seus dados serão usados somente para o cuidado e relacionamento da CEAMI.</p>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="integra-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={`integra-toggle ${checked ? 'checked' : ''}`}><span>{label}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><i>{checked && <Check size={16} />}</i></label>;
}
