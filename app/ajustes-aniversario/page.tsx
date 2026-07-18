'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Setting = {
  enabled: boolean;
  send_time: string;
  test_mode: boolean;
  test_member_id: string | null;
  group_id: string;
  last_sent_at: string | null;
  last_status: string | null;
  last_error: string | null;
};

type Member = {
  id: string;
  full_name: string;
  phone: string | null;
};

type Diagnostics = {
  ok: boolean;
  instance: string;
  groupId: string;
  groupFound?: boolean;
  groupName?: string;
  groupsFound?: number;
  error?: string | null;
};

type BirthdayPreview = {
  birthdays?: Array<{ id: string; name: string; phone: string }>;
};

function statusLabel(status: string | null) {
  if (status === 'queued' || status === 'accepted') {
    return 'Aceita pela Evolution — aguardando confirmação no WhatsApp';
  }
  if (status === 'sent') {
    return 'Marcada como enviada pelo registro antigo — entrega não confirmada';
  }
  if (status === 'failed') return 'Falha';
  return status || '—';
}

export default function Page() {
  const supabase = useMemo(() => createClient(), []);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [msg, setMsg] = useState('');
  const [checking, setChecking] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    void load();
    void validateConnection(false);
  }, []);

  async function load() {
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase
        .from('birthday_automation_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle(),
      supabase
        .from('members')
        .select('id,full_name,phone')
        .not('phone', 'is', null)
        .order('full_name'),
    ]);

    setSetting(s as Setting);
    setMembers((m || []) as Member[]);
  }

  async function save() {
    if (!setting) return;
    setMsg('');

    const { error } = await supabase
      .from('birthday_automation_settings')
      .update({
        enabled: setting.enabled,
        send_time: setting.send_time,
        test_mode: setting.test_mode,
        test_member_id: setting.test_mode ? setting.test_member_id : null,
        last_sent_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default');

    setMsg(error ? error.message : 'Configuração salva com sucesso.');
    if (!error) await load();
  }

  async function validateConnection(showMessage = true) {
    setChecking(true);
    if (showMessage) setMsg('');

    try {
      const response = await fetch('/api/birthdays/diagnostics', { cache: 'no-store' });
      const data = (await response.json()) as Diagnostics;
      setDiagnostics(data);

      if (showMessage) {
        setMsg(
          data.ok
            ? `Conexão validada: ${data.instance} está no grupo ${data.groupName || data.groupId}.`
            : data.error || 'A configuração da Evolution não foi validada.',
        );
      }

      return data;
    } catch {
      const data: Diagnostics = {
        ok: false,
        instance: '',
        groupId: '',
        error: 'Não foi possível validar a Evolution.',
      };
      setDiagnostics(data);
      if (showMessage) setMsg(data.error || '');
      return data;
    } finally {
      setChecking(false);
    }
  }

  async function retryToday() {
    setRetrying(true);
    setMsg('');

    try {
      const check = await validateConnection(false);
      if (!check.ok) {
        setMsg(check.error || 'A conexão não foi validada. O reenvio foi bloqueado.');
        return;
      }

      const previewResponse = await fetch('/api/birthdays/test', { cache: 'no-store' });
      const preview = (await previewResponse.json()) as BirthdayPreview & { error?: string };

      if (!previewResponse.ok) {
        setMsg(preview.error || 'Não foi possível carregar os aniversariantes de hoje.');
        return;
      }

      const names = (preview.birthdays || []).map((item) => item.name);
      if (!names.length) {
        setMsg('Não há aniversariantes hoje para reenviar.');
        return;
      }

      const confirmed = window.confirm(
        `Reenviar agora para “${check.groupName || check.groupId}”?\n\nAniversariantes:\n• ${names.join('\n• ')}\n\nUse somente porque a mensagem das 07:30 não apareceu no grupo.`,
      );

      if (!confirmed) {
        setMsg('Reenvio cancelado.');
        return;
      }

      const response = await fetch('/api/birthdays/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'today', force: true }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMsg(data.error || 'O reenvio falhou.');
        await load();
        return;
      }

      setMsg(
        `Mensagem aceita pela Evolution para ${data.groupName || data.groupId}. Status do provedor: ${data.providerStatus || 'PENDING'}. Confira o grupo agora.`,
      );
      await load();
    } catch {
      setMsg('Não foi possível executar o reenvio.');
    } finally {
      setRetrying(false);
    }
  }

  if (!setting) {
    return (
      <main className="auto">
        <section>
          <h1>Automação não instalada</h1>
          <p>Execute as migrations no Supabase.</p>
        </section>
        <Style />
      </main>
    );
  }

  return (
    <main className="auto">
      <section>
        <header>
          <div>
            <small>CEAMI MEMBROS</small>
            <h1>Automação de aniversários</h1>
            <p>O Supabase verifica o horário uma vez por minuto.</p>
          </div>
          <Link href="/">Voltar</Link>
        </header>

        <label className="check">
          <input
            type="checkbox"
            checked={setting.enabled}
            onChange={(event) => setSetting({ ...setting, enabled: event.target.checked })}
          />
          Automação ativada
        </label>

        <label>
          Horário diário
          <input
            type="time"
            value={setting.send_time.slice(0, 5)}
            onChange={(event) => setSetting({ ...setting, send_time: event.target.value })}
          />
        </label>

        <label>
          Modo
          <select
            value={setting.test_mode ? 'test' : 'official'}
            onChange={(event) =>
              setSetting({ ...setting, test_mode: event.target.value === 'test' })
            }
          >
            <option value="test">Teste automático</option>
            <option value="official">Aniversariantes reais</option>
          </select>
        </label>

        {setting.test_mode && (
          <label>
            Membro simulado
            <select
              value={setting.test_member_id || ''}
              onChange={(event) =>
                setSetting({ ...setting, test_member_id: event.target.value || null })
              }
            >
              <option value="">Selecione</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name} — {member.phone}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={`connection ${diagnostics?.ok ? 'ok' : diagnostics ? 'bad' : ''}`}>
          <div>
            <b>Instância na Vercel:</b> {diagnostics?.instance || 'Verificando...'}
          </div>
          <div>
            <b>Grupo:</b> {diagnostics?.groupName || setting.group_id}
          </div>
          <div>
            <b>Validação:</b>{' '}
            {diagnostics?.ok
              ? 'Instância conectada ao grupo'
              : diagnostics?.error || 'Verificando...'}
          </div>
        </div>

        <div className="info">
          <b>Última execução:</b>{' '}
          {setting.last_sent_at
            ? new Date(setting.last_sent_at).toLocaleString('pt-BR')
            : 'Ainda não executada'}
          <br />
          <b>Status:</b> {statusLabel(setting.last_status)}
          {setting.last_error && (
            <>
              <br />
              <b>Erro:</b> {setting.last_error}
            </>
          )}
        </div>

        <p className="warning">
          “Aceita pela Evolution” significa que a API recebeu a mensagem. A confirmação final
          continua sendo a mensagem aparecer no grupo.
        </p>

        {msg && <p className="msg">{msg}</p>}

        <div className="diagnostic-actions">
          <button type="button" className="neutral" onClick={() => void validateConnection()} disabled={checking}>
            {checking ? 'Validando...' : 'Validar conexão'}
          </button>
          <button
            type="button"
            className="retry"
            onClick={() => void retryToday()}
            disabled={retrying || !diagnostics?.ok}
          >
            {retrying ? 'Reenviando...' : 'Reenviar aniversariantes de hoje'}
          </button>
        </div>

        <footer>
          <Link href="/teste-aniversario">Teste manual</Link>
          <button type="button" onClick={() => void save()}>
            Salvar automação
          </button>
        </footer>
      </section>
      <Style />
    </main>
  );
}

function Style() {
  return (
    <style jsx global>{`
      .auto{min-height:100vh;background:#f3f6f7;color:#173746;padding:24px 14px}
      .auto>section{width:min(760px,100%);margin:auto;background:#fff;border:1px solid #dfe7ea;border-radius:20px;padding:24px;display:grid;gap:16px}
      .auto header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
      .auto h1{font-size:28px;line-height:1.15;margin:4px 0 7px}
      .auto p{color:#71838c;margin:0;line-height:1.45}
      .auto small{color:#df6034;font-weight:800;letter-spacing:.12em}
      .auto a{color:#173746;font-weight:700;text-decoration:none}
      .auto label{display:grid;gap:7px;font-weight:700}
      .auto input,.auto select{height:48px;border:1px solid #d7e1e5;border-radius:12px;padding:0 13px;background:#fff;color:#173746;font-size:15px}
      .auto .check{display:flex;align-items:center;gap:10px}
      .auto .check input{width:22px;height:22px}
      .info,.connection{background:#f6f8f9;padding:14px;border-radius:13px;line-height:1.65;overflow-wrap:anywhere}
      .connection.ok{background:#eaf7f0;color:#246e4a}
      .connection.bad{background:#fff0ec;color:#9b4426}
      .warning{font-size:12px;padding:11px 12px;border-radius:11px;background:#fff8e8;color:#765b1b!important}
      .msg{background:#eaf7f0;color:#26734c!important;padding:12px;border-radius:12px;font-weight:700}
      .diagnostic-actions,.auto footer{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .auto footer a,.auto button{min-height:48px;padding:12px 15px;border-radius:12px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:14px}
      .auto footer a,.neutral{background:#e8eef0;color:#173746;border:0;font-weight:700}
      .auto footer button,.retry{border:0;background:#df6034;color:#fff;font-weight:800}
      .retry{background:#173746}
      .auto button:disabled{opacity:.55;cursor:not-allowed}
      @media(max-width:600px){
        .auto{padding:12px 8px 90px}
        .auto>section{padding:17px 14px;border-radius:17px;gap:14px}
        .auto header{display:grid;gap:10px}
        .auto h1{font-size:23px}
        .auto p{font-size:13px}
        .diagnostic-actions,.auto footer{grid-template-columns:1fr}
        .auto footer a,.auto button{min-height:46px;font-size:13px}
        .info,.connection{font-size:13px}
      }
    `}</style>
  );
}
