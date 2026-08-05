'use client';

import { useEffect, useState } from 'react';

type MemberSheet = Record<string, unknown>;
type Toast = { message: string; type: 'success' | 'error' } | null;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function escapeHtml(value: unknown) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'Não informado';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
}

function yesNo(value: unknown) {
  return value === true ? 'Sim' : value === false ? 'Não' : 'Não informado';
}

function display(value: unknown) {
  return escapeHtml(value) || 'Não informado';
}

function row(label: string, value: string) {
  return `<div class="field"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function memberSheetHtml(member: MemberSheet) {
  const address = [member.address, member.neighborhood, member.city, member.zip_code]
    .map(text)
    .filter(Boolean)
    .join(' · ');

  return `
    <section class="sheet">
      <header class="sheet-header">
        <div class="brand-mark">CE</div>
        <div class="brand-copy"><strong>CEAMI MEMBROS</strong><span>Ficha cadastral</span></div>
        <div class="sheet-date"><small>Integra</small><strong>${formatDate(member.integra_date)}</strong></div>
      </header>

      <div class="member-name">
        <small>MEMBRO</small>
        <h1>${display(member.full_name)}</h1>
      </div>

      <div class="grid two">
        <section class="card">
          <h2>Informações pessoais</h2>
          ${row('Nome completo', display(member.full_name))}
          ${row('Data de nascimento', formatDate(member.birth_date))}
          ${row('Estado civil', display(member.marital_status))}
          ${row('Cônjuge', display(member.spouse_name))}
          ${row('Data do Integra', formatDate(member.integra_date))}
        </section>

        <section class="card">
          <h2>Contato e endereço</h2>
          ${row('WhatsApp', display(member.phone))}
          ${row('E-mail', display(member.email))}
          ${row('Endereço', address ? escapeHtml(address) : 'Não informado')}
        </section>
      </div>

      <div class="grid two">
        <section class="card">
          <h2>Família</h2>
          ${row('Tem filhos', yesNo(member.has_children))}
          ${row('Filhos', display(member.children_names))}
          ${row('Frequentava outra igreja', yesNo(member.previous_church))}
          ${row('Igreja anterior', display(member.previous_church_name))}
        </section>

        <section class="card">
          <h2>Vida cristã</h2>
          ${row('Batizado nas águas', yesNo(member.water_baptized))}
          ${row('Igreja do batismo', display(member.baptism_church))}
          ${row('Data do batismo', formatDate(member.baptism_date))}
          ${row('Batizado no Espírito Santo', yesNo(member.holy_spirit_baptized))}
          ${row('Fundamentos da Fé', yesNo(member.fundamentos_fe))}
          ${row('Data de conclusão', formatDate(member.fundamentos_fe_date))}
        </section>
      </div>

      <section class="card wide">
        <h2>Ministério, habilidades e observações</h2>
        ${row('Ministério', display(member.ministry))}
        ${row('Talentos e habilidades', display(member.talents))}
        ${row('Observações', display(member.notes))}
      </section>

      <footer class="sheet-footer">
        <span>CEAMI · Comunidade Evangélica Amigo Mais Que Irmão</span>
        <span>Ficha impressa em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}</span>
      </footer>
    </section>`;
}

function printDocument(members: MemberSheet[], title: string, popup: Window) {
  const sheets = members.map(memberSheetHtml).join('');
  popup.document.open();
  popup.document.write(`<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        *{box-sizing:border-box}html,body{margin:0;padding:0;background:#eef2f3;color:#073f57;font-family:Arial,Helvetica,sans-serif}
        .sheet{width:210mm;min-height:297mm;margin:0 auto 12mm;background:white;padding:14mm 15mm 12mm;page-break-after:always;position:relative}
        .sheet:last-child{page-break-after:auto}.sheet-header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #edf1f2;padding-bottom:12px}
        .brand-mark{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#ef5a25;color:white;font-weight:900;font-size:16px}
        .brand-copy{display:grid;gap:3px}.brand-copy strong{font-size:18px;letter-spacing:.03em}.brand-copy span{font-size:11px;color:#6d7f88}
        .sheet-date{margin-left:auto;text-align:right;display:grid;gap:3px}.sheet-date small{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#ef5a25;font-weight:800}.sheet-date strong{font-size:13px}
        .member-name{padding:18px 0 14px}.member-name small{font-size:9px;letter-spacing:.14em;color:#ef5a25;font-weight:900}.member-name h1{font-size:25px;margin:5px 0 0}
        .grid{display:grid;gap:10px;margin-bottom:10px}.grid.two{grid-template-columns:1fr 1fr}.card{border:1px solid #dfe7ea;border-radius:14px;padding:13px 14px;break-inside:avoid}.card.wide{margin-bottom:10px}
        .card h2{font-size:13px;margin:0 0 9px;color:#073f57}.field{display:grid;grid-template-columns:40% 1fr;gap:8px;padding:6px 0;border-top:1px solid #edf1f2;font-size:10.5px;line-height:1.35}.field:first-of-type{border-top:0}.field span{color:#70848d}.field strong{font-weight:700;overflow-wrap:anywhere}
        .sheet-footer{position:absolute;left:15mm;right:15mm;bottom:9mm;padding-top:8px;border-top:1px solid #edf1f2;display:flex;justify-content:space-between;gap:12px;font-size:8px;color:#82949b}
        @media print{html,body{background:white}.sheet{margin:0;width:100%;min-height:297mm;box-shadow:none}@page{size:A4;margin:0}}
        @media(max-width:800px){.sheet{width:100%;min-height:auto;padding:22px}.grid.two{grid-template-columns:1fr}.sheet-footer{position:static;margin-top:18px}.field{grid-template-columns:1fr}}
      </style>
    </head>
    <body>${sheets}<script>window.onload=()=>setTimeout(()=>{window.focus();window.print()},250);<\/script></body>
  </html>`);
  popup.document.close();
}

function fieldValue(modal: Element, label: string) {
  const fields = Array.from(modal.querySelectorAll('.member-v3-field'));
  const field = fields.find((item) => item.querySelector('span')?.textContent?.trim() === label);
  const input = field?.querySelector('input, select, textarea') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return input?.value ?? '';
}

function toggleValue(modal: Element, label: string) {
  const toggles = Array.from(modal.querySelectorAll('.member-v3-toggle'));
  const item = toggles.find((toggle) => toggle.querySelector('span')?.textContent?.trim() === label);
  return Boolean((item?.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked);
}

export default function AdminMemberEnhancements() {
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    let toastTimer = 0;
    let saving = false;

    function show(message: string, type: 'success' | 'error') {
      window.clearTimeout(toastTimer);
      setToast({ message, type });
      toastTimer = window.setTimeout(() => setToast(null), 3600);
    }

    async function printSingle(name: string) {
      const popup = window.open('', '_blank', 'width=980,height=1100');
      if (!popup) return show('O navegador bloqueou a janela de impressão.', 'error');
      popup.document.write('<p style="font-family:Arial;padding:24px">Preparando ficha...</p>');
      try {
        const response = await fetch(`/api/admin/members?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a ficha.');
        printDocument([result.member], `Ficha - ${name}`, popup);
      } catch (error) {
        popup.close();
        show(error instanceof Error ? error.message : 'Não foi possível imprimir a ficha.', 'error');
      }
    }

    async function printToday() {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const popup = window.open('', '_blank', 'width=980,height=1100');
      if (!popup) return show('O navegador bloqueou a janela de impressão.', 'error');
      popup.document.write('<p style="font-family:Arial;padding:24px">Preparando fichas do Integra...</p>');
      try {
        const response = await fetch(`/api/admin/members?integraDate=${encodeURIComponent(today)}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as fichas.');
        const members = Array.isArray(result.members) ? result.members : [];
        if (!members.length) {
          popup.close();
          return show('Ainda não há fichas cadastradas no Integra de hoje.', 'error');
        }
        printDocument(members, `Fichas do Integra - ${formatDate(today)}`, popup);
      } catch (error) {
        popup.close();
        show(error instanceof Error ? error.message : 'Não foi possível imprimir as fichas.', 'error');
      }
    }

    function enhance() {
      const profileHeader = document.querySelector('.member-v3-profile-header');
      if (profileHeader && !profileHeader.querySelector('[data-ceami-print-single]')) {
        const name = profileHeader.querySelector('.member-v3-profile-title h2')?.textContent?.trim();
        if (name) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.ceamiPrintSingle = 'true';
          button.innerHTML = '🖨️ Imprimir ficha';
          button.style.marginLeft = '8px';
          button.addEventListener('click', () => void printSingle(name));
          const editButton = Array.from(profileHeader.querySelectorAll('button')).find((item) => item.textContent?.includes('Editar'));
          if (editButton) profileHeader.insertBefore(button, editButton);
          else profileHeader.appendChild(button);
        }
      }

      const headings = Array.from(document.querySelectorAll('.member-v3-panel h2'));
      const integraHeading = headings.find((heading) => heading.textContent?.trim() === 'Integra CEAMI');
      const integraPanel = integraHeading?.closest('.member-v3-panel');
      const panelHead = integraPanel?.querySelector('.member-v3-panel-head');
      if (panelHead && !panelHead.querySelector('[data-ceami-print-today]')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'member-v3-primary';
        button.dataset.ceamiPrintToday = 'true';
        button.innerHTML = '🖨️ Imprimir fichas de hoje';
        button.addEventListener('click', () => void printToday());
        panelHead.appendChild(button);
      }
    }

    async function interceptSave(event: Event) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button || !button.closest('.member-v3-modal')) return;
      if (!button.textContent?.includes('Salvar alterações')) return;

      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      if (saving) return;

      const modal = button.closest('.member-v3-modal');
      const originalName = document.querySelector('.member-v3-profile-title h2')?.textContent?.trim() || '';
      if (!modal || !originalName) return show('Não foi possível identificar o membro.', 'error');

      saving = true;
      const originalText = button.textContent || 'Salvar alterações';
      (button as HTMLButtonElement).disabled = true;
      button.textContent = 'Salvando...';

      const data = {
        name: fieldValue(modal, 'Nome completo'),
        phone: fieldValue(modal, 'WhatsApp'),
        email: fieldValue(modal, 'E-mail'),
        birthDate: fieldValue(modal, 'Data de nascimento'),
        integraDate: fieldValue(modal, 'Data do Integra'),
        address: fieldValue(modal, 'Endereço'),
        neighborhood: fieldValue(modal, 'Bairro'),
        city: fieldValue(modal, 'Cidade'),
        maritalStatus: fieldValue(modal, 'Estado civil'),
        waterBaptized: toggleValue(modal, 'Batizado nas águas'),
        holySpiritBaptized: toggleValue(modal, 'Batizado no Espírito Santo'),
        fundamentosFe: toggleValue(modal, 'Concluiu Fundamentos da Fé'),
        notes: fieldValue(modal, 'Habilidades e observações'),
      };

      try {
        const response = await fetch('/api/admin/members', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalName, data }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível salvar as alterações.');
        show('Cadastro atualizado e salvo no banco.', 'success');
        button.textContent = 'Salvo ✓';
        window.setTimeout(() => window.location.reload(), 650);
      } catch (error) {
        show(error instanceof Error ? error.message : 'Não foi possível salvar as alterações.', 'error');
        button.textContent = originalText;
        (button as HTMLButtonElement).disabled = false;
      } finally {
        saving = false;
      }
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { subtree: true, childList: true });
    document.addEventListener('click', interceptSave, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', interceptSave, true);
      window.clearTimeout(toastTimer);
    };
  }, []);

  if (!toast) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 22,
        bottom: 24,
        zIndex: 99999,
        maxWidth: 390,
        padding: '13px 16px',
        borderRadius: 14,
        background: toast.type === 'success' ? '#e8f7ef' : '#fff0ed',
        color: toast.type === 'success' ? '#16643b' : '#9d331f',
        border: `1px solid ${toast.type === 'success' ? '#bfe7cf' : '#f2c9c0'}`,
        boxShadow: '0 14px 45px rgba(7,63,87,.16)',
        fontWeight: 750,
        fontSize: 14,
      }}
    >
      {toast.message}
    </div>
  );
}
