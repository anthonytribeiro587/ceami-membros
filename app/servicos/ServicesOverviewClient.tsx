'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  LoaderCircle,
  Wrench,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  SERVICE_FORM_SLUG,
  serviceStatusFromAnswers,
} from '@/lib/services';

type FormRow = {
  id: string;
  active: boolean;
  title: string;
};

type SubmissionRow = {
  id: string;
  respondent_name: string | null;
  answers: Record<string, unknown>;
  created_at: string;
};

function serviceName(submission: SubmissionRow) {
  return String(submission.answers?.tipo_servico || '').trim() || 'Solicitação de serviço';
}

export default function ServicesOverviewClient() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<FormRow | null>(null);
  const [fieldCount, setFieldCount] = useState(0);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data: formData } = await supabase
        .from('forms')
        .select('id, active, title')
        .eq('slug', SERVICE_FORM_SLUG)
        .maybeSingle();

      if (!active) return;
      const currentForm = (formData || null) as FormRow | null;
      setForm(currentForm);

      if (!currentForm) {
        setLoading(false);
        return;
      }

      const [fieldsResult, submissionsResult] = await Promise.all([
        supabase
          .from('form_fields')
          .select('id', { count: 'exact', head: true })
          .eq('form_id', currentForm.id),
        supabase
          .from('form_submissions')
          .select('id, respondent_name, answers, created_at')
          .eq('form_id', currentForm.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (!active) return;
      setFieldCount(fieldsResult.count || 0);
      setSubmissions((submissionsResult.data || []) as SubmissionRow[]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  const openCount = submissions.filter((item) => serviceStatusFromAnswers(item.answers) === 'aberto').length;
  const completedCount = submissions.filter((item) => serviceStatusFromAnswers(item.answers) === 'concluido').length;
  const recent = submissions.slice(0, 5);

  async function copyPublicLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/servicos/solicitar`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return <main className="services-admin-page services-admin-center"><LoaderCircle className="services-spin" /><p>Carregando CEAMI Serviços...</p></main>;
  }

  return (
    <main className="services-admin-page services-dashboard">
      <header className="services-admin-header">
        <div>
          <span>CEAMI SERVIÇOS</span>
          <h1><Wrench /> Serviços</h1>
          <p>Pedidos da comunidade, acompanhamento e formulário público em um só lugar.</p>
        </div>
        <div className="services-admin-header-actions">
          <button type="button" onClick={() => void copyPublicLink()}><Copy size={16} />{copied ? 'Link copiado' : 'Copiar link'}</button>
          <a href="/servicos/solicitar" target="_blank" rel="noreferrer"><ExternalLink size={16} />Abrir formulário</a>
        </div>
      </header>

      <section className="services-overview-stats">
        <div><span>Em atendimento</span><strong>{openCount}</strong></div>
        <div><span>Concluídos</span><strong>{completedCount}</strong></div>
        <div><span>Solicitações</span><strong>{submissions.length}</strong></div>
        <div><span>Formulário</span><strong className={form?.active ? 'is-live' : 'is-paused'}>{form?.active ? 'Publicado' : 'Pausado'}</strong></div>
      </section>

      <div className="services-overview-grid">
        <section className="services-overview-panel">
          <header>
            <div><span>FILA DE ATENDIMENTO</span><h2>Solicitações recentes</h2></div>
            <Link href="/servicos/solicitacoes">Ver todas <ArrowRight size={15} /></Link>
          </header>

          <div className="services-overview-list">
            {recent.length ? recent.map((submission) => {
              const status = serviceStatusFromAnswers(submission.answers);
              return (
                <Link href="/servicos/solicitacoes" key={submission.id}>
                  <span className={`services-overview-status ${status}`} />
                  <div>
                    <strong>{submission.respondent_name || 'Solicitante'}</strong>
                    <small>{serviceName(submission)}</small>
                  </div>
                  <time>{new Date(submission.created_at).toLocaleDateString('pt-BR')}</time>
                  <ArrowRight size={15} />
                </Link>
              );
            }) : (
              <div className="services-overview-empty">
                <CheckCircle2 size={22} />
                <strong>Nenhuma solicitação recebida</strong>
                <span>Os novos pedidos aparecerão aqui.</span>
              </div>
            )}
          </div>
        </section>

        <aside className="services-overview-panel services-form-health">
          <header><div><span>CANAL PÚBLICO</span><h2>Formulário de serviços</h2></div><FileText size={18} /></header>
          <div className="services-form-health-status">
            <span className={form?.active ? 'live' : 'paused'} />
            <div><strong>{form?.active ? 'Recebendo solicitações' : 'Formulário pausado'}</strong><small>{fieldCount} campos configurados</small></div>
          </div>
          <p>Edite os textos, o WhatsApp de destino e as perguntas sem misturar isso com a fila de atendimento.</p>
          <Link href="/servicos/formulario"><ClipboardList size={15} />Editar formulário</Link>
        </aside>
      </div>
    </main>
  );
}
