'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCircle2, RotateCcw } from 'lucide-react';

type UpdatedField = {
  label: string;
  value: string;
};

type CompletionState = {
  memberName: string;
  updates: UpdatedField[];
} | null;

export default function ConsultationCompletion() {
  const [completion, setCompletion] = useState<CompletionState>(null);

  useEffect(() => {
    function handleFinalize(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button.secondary-action') as HTMLButtonElement | null;
      if (!button || button.textContent?.trim() !== 'Finalizar consulta') return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const memberName = document.querySelector('.identity-card strong')?.textContent?.trim() || 'Membro';
      const updates = Array.from(document.querySelectorAll<HTMLElement>('.summary-card.selected')).map(card => ({
        label: card.querySelector('small')?.textContent?.trim() || 'Informação',
        value: card.querySelector('strong')?.textContent?.trim() || 'Atualizado',
      }));

      setCompletion({ memberName, updates });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.addEventListener('click', handleFinalize, true);
    return () => document.removeEventListener('click', handleFinalize, true);
  }, []);

  if (!completion) return null;

  const hasUpdates = completion.updates.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-completion-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'linear-gradient(180deg,#173746 0 210px,#f5f7f8 210px)',
        overflowY: 'auto',
        padding: '22px 14px',
        color: '#173746',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',
      }}
    >
      <section
        style={{
          width: 'min(720px,100%)',
          margin: '0 auto',
          background: '#fff',
          borderRadius: 22,
          padding: 24,
          boxShadow: '0 20px 55px rgba(10,30,38,.18)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 18, borderBottom: '1px solid #e4eaed' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: '#df6034', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>CE</div>
          <div>
            <strong style={{ display: 'block', fontSize: 19 }}>CEAMI</strong>
            <span style={{ display: 'block', fontSize: 10, color: '#71838c', marginTop: 2 }}>Comunidade Evangélica Amigo Mais Que Irmão</span>
          </div>
        </header>

        <div style={{ textAlign: 'center', padding: '34px 4px 12px' }}>
          <CheckCircle2 size={62} color="#2f8a60" style={{ marginBottom: 14 }} />
          <span style={{ display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '.14em', color: '#2f8a60' }}>CONSULTA FINALIZADA</span>
          <h1 id="consultation-completion-title" style={{ fontSize: 27, lineHeight: 1.18, margin: '8px 0', letterSpacing: '-.02em' }}>
            {hasUpdates ? 'Cadastro atualizado com sucesso' : 'Cadastro conferido com sucesso'}
          </h1>
          <p style={{ margin: 0, color: '#71838c', fontSize: 14, lineHeight: 1.5 }}>
            {hasUpdates
              ? `${completion.memberName}, suas alterações já foram salvas no cadastro da CEAMI.`
              : `${completion.memberName}, nenhuma alteração foi necessária. Seu cadastro foi apenas conferido.`}
          </p>
        </div>

        {hasUpdates ? (
          <section style={{ marginTop: 18 }}>
            <div style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>O que foi atualizado</h2>
              <p style={{ margin: '4px 0 0', color: '#71838c', fontSize: 11 }}>
                {completion.updates.length} {completion.updates.length === 1 ? 'informação alterada' : 'informações alteradas'} nesta consulta.
              </p>
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              {completion.updates.map(update => (
                <article
                  key={update.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '30px minmax(0,1fr)',
                    gap: 10,
                    alignItems: 'start',
                    padding: 13,
                    border: '1px solid #cfe7db',
                    background: '#f1faf5',
                    borderRadius: 13,
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 9, background: '#dff3e8', color: '#267451', display: 'grid', placeItems: 'center' }}>
                    <Check size={17} strokeWidth={2.5} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <small style={{ display: 'block', color: '#5b7d6d', fontSize: 10, marginBottom: 3 }}>{update.label}</small>
                    <strong style={{ display: 'block', fontSize: 13, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{update.value}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, padding: 13, borderRadius: 13, background: '#eef8f3', color: '#267451' }}>
            <CheckCircle2 size={22} />
            <div>
              <strong style={{ display: 'block', fontSize: 13 }}>Nenhuma atualização realizada</strong>
              <span style={{ display: 'block', fontSize: 11, marginTop: 2, color: '#5b7d6d' }}>Os dados foram conferidos e permaneceram como estavam.</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 22, padding: 13, borderRadius: 13, background: '#f7f9fa', color: '#71838c', fontSize: 11, lineHeight: 1.45, textAlign: 'center' }}>
          Pronto. Você pode fechar esta página. Se precisar conferir outro cadastro, use o botão abaixo.
        </div>

        <button
          type="button"
          onClick={() => window.location.assign('/consultar')}
          style={{
            width: '100%',
            minHeight: 48,
            marginTop: 12,
            border: 0,
            borderRadius: 12,
            background: '#173746',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <RotateCcw size={18} /> Fazer nova consulta
        </button>
      </section>
    </div>
  );
}
