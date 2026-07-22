'use client';

import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { FormEvent, KeyboardEvent, useMemo, useState } from 'react';

type FormDataState = {
  full_name: string;
  phone: string;
  email: string;
  birth_date: string;
  integra_date: string;
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
  has_skills: boolean;
  talents: string;
  notes: string;
};

const initialData: FormDataState = {
  full_name: '',
  phone: '',
  email: '',
  birth_date: '',
  integra_date: '',
  marital_status: '',
  spouse_name: '',
  address: '',
  neighborhood: '',
  city: '',
  zip_code: '',
  has_children: false,
  children_names: '',
  previous_church: false,
  previous_church_name: '',
  water_baptized: false,
  baptism_church: '',
  baptism_date: '',
  holy_spirit_baptized: false,
  fundamentos_fe: false,
  fundamentos_fe_date: '',
  has_skills: false,
  talents: '',
  notes: '',
};

const steps = ['Seus dados', 'Família e endereço', 'Caminhada de fé', 'Habilidades e observações'];
const identityFields = new Set<keyof FormDataState>(['full_name', 'phone', 'email', 'birth_date']);

function formatReviewDate(value: string) {
  if (!value) return 'Não informado';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export default function IntegraPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormDataState>(initialData);
  const [loading, setLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [existingMember, setExistingMember] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const progress = useMemo(() => `${step * 25}%`, [step]);

  const update = <K extends keyof FormDataState>(key: K, value: FormDataState[K]) => {
    setData((current) => ({ ...current, [key]: value }));
    if (identityFields.has(key)) {
      setExistingMember(false);
      setError('');
    }
  };

  async function next() {
    if (step !== 1) {
      setError('');
      setReviewing(false);
      setStep((current) => Math.min(4, current + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (data.full_name.trim().length < 3) {
      setError('Informe seu nome completo para continuar.');
      return;
    }

    if (!data.integra_date) {
      setError('Informe a data em que você está participando do Integra.');
      return;
    }

    const phoneDigits = data.phone.replace(/\D/g, '');
    if (!data.birth_date && phoneDigits.length < 8 && !data.email.trim()) {
      setError('Informe a data de nascimento, o WhatsApp ou o e-mail para conferirmos se você já possui cadastro.');
      return;
    }

    setCheckingExisting(true);
    setExistingMember(false);
    setError('');

    try {
      const response = await fetch('/api/public/check-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.full_name,
          birthDate: data.birth_date,
          phone: data.phone,
          email: data.email,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Não foi possível conferir seu cadastro agora.');
        return;
      }

      if (result.found) {
        setExistingMember(true);
        return;
      }

      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Não foi possível conferir seu cadastro. Tente novamente em instantes.');
    } finally {
      setCheckingExisting(false);
    }
  }

  function openReview() {
    setError('');
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    setError('');
    if (reviewing) {
      setReviewing(false);
      return;
    }
    setStep((current) => Math.max(1, current - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function preventPrematureSubmit(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && !reviewing && event.target instanceof HTMLInputElement) {
      event.preventDefault();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reviewing) {
      setError('Revise a ficha antes de confirmar o envio.');
      return;
    }

    if (!privacyAccepted) {
      setError('Leia e confirme o aviso de privacidade antes de enviar.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/integra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, privacy_accepted: privacyAccepted }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 || result.existing) setExistingMember(true);
        throw new Error(result.error || 'Não foi possível enviar sua ficha.');
      }
      setSuccess(true);
      localStorage.removeItem('ceami-integra-draft');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar sua ficha.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="integra-page">
        <section className="integra-success">
          <div className="success-icon"><Check size={30} /></div>
          <span>FICHA ENVIADA</span>
          <h1>Que alegria ter você conosco!</h1>
          <p>Recebemos suas informações. A equipe da CEAMI poderá manter contato e acompanhar seus próximos passos.</p>
          <div className="welcome-note">Seja bem-vindo(a) à sua nova casa.</div>
        </section>
      </main>
    );
  }

  return (
    <main className="integra-page">
      <header className="integra-brand">
        <div className="integra-mark">CE</div>
        <div><strong>CEAMI</strong><span>Comunidade Evangélica Amigo Mais Que Irmão</span></div>
      </header>

      <form className="integra-card" onSubmit={submit} onKeyDown={preventPrematureSubmit}>
        <div className="integra-heading">
          <span>INTEGRA CEAMI</span>
          <h1>{reviewing ? 'Confira antes de enviar' : 'Queremos conhecer você'}</h1>
          <p>{reviewing ? 'Revise o resumo. A ficha só será enviada após sua confirmação.' : 'Preencha sua ficha com calma. Leva apenas alguns minutos.'}</p>
        </div>
        <div className="integra-step">
          <div><small>{reviewing ? 'REVISÃO FINAL' : `ETAPA ${step} DE 4`}</small><strong>{reviewing ? 'Confirmação dos dados' : steps[step - 1]}</strong></div>
          <span>100%</span>
        </div>
        <div className="integra-progress"><i style={{ width: progress }} /></div>

        <div className="integra-fields">
          {!reviewing && step === 1 && (
            <>
              <div className="integra-check-note"><Search size={17} /><span>Antes de avançar, conferimos se você já possui cadastro para evitar duplicidade.</span></div>
              <Field label="Nome completo"><input value={data.full_name} onChange={(event) => update('full_name', event.target.value)} autoComplete="name" required /></Field>
              <Field label="WhatsApp"><input value={data.phone} onChange={(event) => update('phone', event.target.value)} inputMode="tel" autoComplete="tel" placeholder="(51) 99999-9999" /></Field>
              <Field label="E-mail"><input value={data.email} onChange={(event) => update('email', event.target.value)} type="email" autoComplete="email" /></Field>
              <div className="integra-two">
                <Field label="Data de nascimento"><input className="date-field" value={data.birth_date} onChange={(event) => update('birth_date', event.target.value)} type="date" /></Field>
                <Field label="Data do Integra"><input className="date-field" value={data.integra_date} onChange={(event) => update('integra_date', event.target.value)} type="date" required /></Field>
              </div>
              <Field label="Estado civil"><select value={data.marital_status} onChange={(event) => update('marital_status', event.target.value)}><option value="">Selecione</option><option>Solteiro</option><option>Casado</option><option>Separado</option><option>Divorciado</option><option>Viúvo</option><option>União estável</option></select></Field>
              {['Casado', 'União estável'].includes(data.marital_status) && <Field label="Nome do cônjuge"><input value={data.spouse_name} onChange={(event) => update('spouse_name', event.target.value)} /></Field>}
              {existingMember && <div className="integra-existing"><strong>Encontramos um cadastro com esses dados.</strong><p>Não crie uma segunda ficha. Entre na consulta para conferir ou solicitar a atualização do cadastro existente.</p><Link href="/consultar">Consultar meu cadastro</Link></div>}
            </>
          )}

          {!reviewing && step === 2 && (
            <>
              <Field label="Endereço"><input value={data.address} onChange={(event) => update('address', event.target.value)} autoComplete="street-address" /></Field>
              <div className="integra-two"><Field label="Bairro"><input value={data.neighborhood} onChange={(event) => update('neighborhood', event.target.value)} /></Field><Field label="Cidade"><input value={data.city} onChange={(event) => update('city', event.target.value)} /></Field></div>
              <Field label="CEP"><input value={data.zip_code} onChange={(event) => update('zip_code', event.target.value)} inputMode="numeric" autoComplete="postal-code" /></Field>
              <Toggle label="Tenho filhos" checked={data.has_children} onChange={(value) => update('has_children', value)} />
              {data.has_children && <Field label="Nome dos filhos"><textarea value={data.children_names} onChange={(event) => update('children_names', event.target.value)} placeholder="Um nome por linha" /></Field>}
            </>
          )}

          {!reviewing && step === 3 && (
            <>
              <Toggle label="Eu frequentava outra igreja" checked={data.previous_church} onChange={(value) => update('previous_church', value)} />
              {data.previous_church && <Field label="Qual igreja?"><input value={data.previous_church_name} onChange={(event) => update('previous_church_name', event.target.value)} /></Field>}
              <Toggle label="Sou batizado(a) nas águas" checked={data.water_baptized} onChange={(value) => update('water_baptized', value)} />
              {data.water_baptized && <><Field label="Igreja do batismo"><input value={data.baptism_church} onChange={(event) => update('baptism_church', event.target.value)} /></Field><Field label="Data do batismo"><input className="date-field" value={data.baptism_date} onChange={(event) => update('baptism_date', event.target.value)} type="date" /></Field></>}
              <Toggle label="Sou batizado(a) no Espírito Santo" checked={data.holy_spirit_baptized} onChange={(value) => update('holy_spirit_baptized', value)} />
              <Toggle label="Já concluí Fundamentos da Fé" checked={data.fundamentos_fe} onChange={(value) => update('fundamentos_fe', value)} />
              {data.fundamentos_fe && <Field label="Data de conclusão"><input className="date-field" value={data.fundamentos_fe_date} onChange={(event) => update('fundamentos_fe_date', event.target.value)} type="date" /></Field>}
            </>
          )}

          {!reviewing && step === 4 && (
            <>
              <div className="integra-last-step-note"><strong>Última etapa</strong><span>O vínculo com ministérios será definido posteriormente pela liderança.</span></div>
              <Toggle label="Tenho alguma habilidade ou experiência que gostaria de compartilhar" checked={data.has_skills} onChange={(value) => update('has_skills', value)} />
              {data.has_skills && <Field label="Quais habilidades?"><textarea value={data.talents} onChange={(event) => update('talents', event.target.value)} placeholder="Ex.: música, fotografia, ensino, recepção, trabalho com crianças..." /></Field>}
              <Field label="Algo que gostaria de compartilhar?"><textarea value={data.notes} onChange={(event) => update('notes', event.target.value)} /></Field>
            </>
          )}

          {reviewing && (
            <section className="integra-review">
              <ReviewGroup title="Dados pessoais" rows={[
                ['Nome', data.full_name],
                ['WhatsApp', data.phone || 'Não informado'],
                ['E-mail', data.email || 'Não informado'],
                ['Nascimento', formatReviewDate(data.birth_date)],
                ['Data do Integra', formatReviewDate(data.integra_date)],
                ['Estado civil', data.marital_status || 'Não informado'],
              ]} />
              <ReviewGroup title="Família e endereço" rows={[
                ['Endereço', [data.address, data.neighborhood, data.city].filter(Boolean).join(' • ') || 'Não informado'],
                ['Filhos', data.has_children ? data.children_names || 'Informado' : 'Não'],
              ]} />
              <ReviewGroup title="Caminhada de fé" rows={[
                ['Batizado nas águas', data.water_baptized ? 'Sim' : 'Não'],
                ['Batizado no Espírito Santo', data.holy_spirit_baptized ? 'Sim' : 'Não'],
                ['Fundamentos da Fé', data.fundamentos_fe ? 'Concluído' : 'Não concluído'],
              ]} />
              <ReviewGroup title="Habilidades e observações" rows={[
                ['Possui habilidades', data.has_skills ? 'Sim' : 'Não informado'],
                ['Habilidades', data.has_skills ? data.talents || 'Não detalhadas' : 'Não informado'],
                ['Observações', data.notes || 'Nenhuma'],
              ]} />
              <label className={`integra-privacy-consent ${privacyAccepted ? 'checked' : ''}`}>
                <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
                <i>{privacyAccepted && <Check size={15} />}</i>
                <span>Li o <Link href="/privacidade" target="_blank">Aviso de Privacidade</Link> e estou ciente do uso destes dados pela CEAMI para cadastro, cuidado de membros, cursos e comunicação.</span>
              </label>
              <div className="integra-confirm-note"><Check size={18} /><span>Ao confirmar, esta ficha será enviada uma única vez para a CEAMI.</span></div>
            </section>
          )}
        </div>

        {error && <div className="integra-error">{error}</div>}
        <footer className="integra-actions">
          {step > 1 || reviewing ? <button type="button" className="secondary" onClick={goBack}><ChevronLeft size={17} />{reviewing ? 'Editar respostas' : 'Voltar'}</button> : <span />}
          {step < 4 && !reviewing && <button type="button" className="primary" onClick={() => void next()} disabled={checkingExisting || existingMember}>{checkingExisting ? 'Conferindo...' : <>Continuar<ChevronRight size={17} /></>}</button>}
          {step === 4 && !reviewing && <button type="button" className="primary" onClick={openReview}>Revisar ficha<ChevronRight size={17} /></button>}
          {reviewing && <button type="submit" className="primary" disabled={loading}>{loading ? 'Enviando...' : 'Confirmar e enviar'}</button>}
        </footer>
      </form>
      <p className="integra-footer">Seus dados serão usados para as finalidades informadas no <Link href="/privacidade">Aviso de Privacidade</Link>.</p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="integra-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={`integra-toggle ${checked ? 'checked' : ''}`}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i>{checked && <Check size={15} />}</i></label>;
}

function ReviewGroup({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="integra-review-group"><h2>{title}</h2>{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>;
}
