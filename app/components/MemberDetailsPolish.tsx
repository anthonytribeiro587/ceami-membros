'use client';

import { useEffect } from 'react';

type MemberSheet = Record<string, unknown>;

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

function display(value: unknown) {
  return escapeHtml(value) || 'Não informado';
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

function field(label: string, value: string) {
  return `<div class="field"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function memberSheetHtml(member: MemberSheet) {
  const address = [member.address, member.neighborhood, member.city, member.zip_code]
    .map(text)
    .filter(Boolean)
    .join(' · ');

  return `
    <article class="sheet">
      <header class="sheet-header">
        <div class="brand-mark">CE</div>
        <div class="brand-copy">
          <span>COMUNIDADE EVANGÉLICA AMIGO MAIS QUE IRMÃO</span>
          <strong>CEAMI MEMBROS</strong>
          <small>Ficha cadastral</small>
        </div>
        <div class="sheet-meta">
          <span>INTEGRA</span>
          <strong>${formatDate(member.integra_date)}</strong>
        </div>
      </header>

      <section class="identity">
        <div>
          <span>MEMBRO</span>
          <h1>${display(member.full_name)}</h1>
        </div>
        <div class="status-box">
          <span>SITUAÇÃO</span>
          <strong>${display(member.status)}</strong>
        </div>
      </section>

      <div class="grid two">
        <section class="card">
          <h2>Informações pessoais</h2>
          ${field('Nome completo', display(member.full_name))}
          ${field('Data de nascimento', formatDate(member.birth_date))}
          ${field('Estado civil', display(member.marital_status))}
          ${field('Cônjuge', display(member.spouse_name))}
          ${field('Data do Integra', formatDate(member.integra_date))}
        </section>

        <section class="card">
          <h2>Contato e endereço</h2>
          ${field('WhatsApp', display(member.phone))}
          ${field('E-mail', display(member.email))}
          ${field('Endereço', address ? escapeHtml(address) : 'Não informado')}
        </section>
      </div>

      <div class="grid two">
        <section class="card">
          <h2>Família</h2>
          ${field('Tem filhos', yesNo(member.has_children))}
          ${field('Filhos', display(member.children_names))}
          ${field('Frequentava outra igreja', yesNo(member.previous_church))}
          ${field('Igreja anterior', display(member.previous_church_name))}
        </section>

        <section class="card">
          <h2>Vida cristã</h2>
          ${field('Batizado nas águas', yesNo(member.water_baptized))}
          ${field('Igreja do batismo', display(member.baptism_church))}
          ${field('Data do batismo', formatDate(member.baptism_date))}
          ${field('Batizado no Espírito Santo', yesNo(member.holy_spirit_baptized))}
          ${field('Fundamentos da Fé', yesNo(member.fundamentos_fe))}
          ${field('Data de conclusão', formatDate(member.fundamentos_fe_date))}
        </section>
      </div>

      <section class="card wide">
        <h2>Ministério, habilidades e observações</h2>
        ${field('Ministério', display(member.ministry))}
        ${field('Talentos e habilidades', display(member.talents))}
        ${field('Observações', display(member.notes))}
      </section>

      <section class="review-box">
        <div><span>Conferido por</span><i></i></div>
        <div><span>Data da conferência</span><i></i></div>
      </section>

      <footer class="sheet-footer">
        <span>CEAMI · Comunidade Evangélica Amigo Mais Que Irmão</span>
        <span>Impresso em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}</span>
      </footer>
    </article>`;
}

function printDocument(members: MemberSheet[], title: string, popup: Window) {
  const sheets = members.map(memberSheetHtml).join('');
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#e9eef0;color:#073f57;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{padding:16px 0}
    .sheet{width:210mm;min-height:297mm;margin:0 auto 14mm;background:#fff;padding:11mm 12mm 12mm;position:relative;page-break-after:always;box-shadow:0 18px 55px rgba(8,48,66,.13)}
    .sheet:last-child{page-break-after:auto}
    .sheet-header{display:grid;grid-template-columns:14mm minmax(0,1fr) auto;align-items:center;gap:4mm;padding-bottom:4mm;border-bottom:.55mm solid #e9eff1}
    .brand-mark{width:13mm;height:13mm;border-radius:4mm;display:grid;place-items:center;background:#ef5a25;color:#fff;font-size:14pt;font-weight:900}
    .brand-copy{display:grid;gap:.8mm}.brand-copy span{font-size:6.8pt;letter-spacing:.08em;color:#ef5a25;font-weight:800}.brand-copy strong{font-size:16pt;line-height:1}.brand-copy small{font-size:8.5pt;color:#6d7f88}
    .sheet-meta{text-align:right;display:grid;gap:1mm}.sheet-meta span,.status-box span,.identity>div>span{font-size:7pt;letter-spacing:.13em;color:#ef5a25;font-weight:900}.sheet-meta strong{font-size:11pt}
    .identity{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8mm;align-items:end;padding:6mm 0 5mm}.identity h1{margin:1.6mm 0 0;font-size:21pt;line-height:1.08;letter-spacing:-.02em}.status-box{min-width:34mm;border:1px solid #dfe8eb;border-radius:4mm;padding:3.2mm 4mm;text-align:right}.status-box strong{display:block;margin-top:1.5mm;font-size:10pt;text-transform:capitalize}
    .grid{display:grid;gap:3.5mm;margin-bottom:3.5mm}.grid.two{grid-template-columns:1fr 1fr}.card{border:.35mm solid #dce6e9;border-radius:4mm;padding:4mm 4.5mm;break-inside:avoid}.card.wide{margin-bottom:3.5mm}.card h2{margin:0 0 2.5mm;font-size:11.5pt;color:#073f57}
    .field{display:grid;grid-template-columns:41% minmax(0,1fr);gap:3mm;align-items:start;padding:2.2mm 0;border-top:.25mm solid #edf2f3;line-height:1.25}.field:first-of-type{border-top:0}.field span{font-size:8.6pt;color:#70848d}.field strong{font-size:9.2pt;font-weight:700;overflow-wrap:anywhere}
    .review-box{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:5mm;padding-top:4mm;border-top:.35mm dashed #cfdadd}.review-box div{display:grid;gap:3mm}.review-box span{font-size:8pt;color:#71848d;font-weight:700}.review-box i{display:block;height:7mm;border-bottom:.3mm solid #9eafb6}
    .sheet-footer{position:absolute;left:12mm;right:12mm;bottom:7mm;padding-top:2.5mm;border-top:.3mm solid #edf1f2;display:flex;justify-content:space-between;gap:8mm;color:#82949b;font-size:6.8pt}
    @media(max-width:800px){body{padding:0}.sheet{width:100%;min-height:auto;margin:0;padding:22px;box-shadow:none}.sheet-header{grid-template-columns:50px 1fr}.sheet-meta{grid-column:1/-1;text-align:left}.identity{grid-template-columns:1fr}.status-box{width:100%;text-align:left}.grid.two{grid-template-columns:1fr}.field{grid-template-columns:1fr;gap:4px}.sheet-footer{position:static;margin-top:24px}.review-box{grid-template-columns:1fr}}
    @media print{html,body{background:#fff;padding:0}.sheet{width:210mm;min-height:297mm;margin:0;box-shadow:none}@page{size:A4;margin:0}}
  </style>
</head>
<body>${sheets}<script>window.onload=()=>setTimeout(()=>{window.focus();window.print()},350);<\/script></body>
</html>`);
  popup.document.close();
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a ficha.');
  return result;
}

export default function MemberDetailsPolish() {
  useEffect(() => {
    function polishButtons() {
      const single = document.querySelector('[data-ceami-print-single]') as HTMLButtonElement | null;
      if (single) {
        single.classList.add('member-v3-print-button');
        single.style.marginLeft = '0';
        single.title = 'Imprimir ficha cadastral deste membro';
      }

      const today = document.querySelector('[data-ceami-print-today]') as HTMLButtonElement | null;
      if (today) today.classList.add('member-v3-print-today');
    }

    async function handlePrintClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button') as HTMLButtonElement | null;
      if (!button) return;

      const isSingle = button.matches('[data-ceami-print-single]');
      const isToday = button.matches('[data-ceami-print-today]');
      if (!isSingle && !isToday) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const popup = window.open('', '_blank', 'width=1020,height=1180');
      if (!popup) {
        window.alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente.');
        return;
      }

      popup.document.write('<div style="font-family:Arial;padding:32px;color:#073f57"><strong>Preparando ficha para impressão...</strong></div>');

      try {
        if (isSingle) {
          const name = document.querySelector('.member-v3-profile-title h2')?.textContent?.trim() || '';
          if (!name) throw new Error('Não foi possível identificar o membro.');
          const result = await fetchJson(`/api/admin/members?name=${encodeURIComponent(name)}`);
          printDocument([result.member], `Ficha cadastral - ${name}`, popup);
          return;
        }

        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const result = await fetchJson(`/api/admin/members?integraDate=${encodeURIComponent(today)}`);
        const members = Array.isArray(result.members) ? result.members : [];
        if (!members.length) throw new Error('Ainda não há fichas cadastradas no Integra de hoje.');
        printDocument(members, `Fichas do Integra - ${formatDate(today)}`, popup);
      } catch (error) {
        popup.close();
        window.alert(error instanceof Error ? error.message : 'Não foi possível preparar a impressão.');
      }
    }

    polishButtons();
    const observer = new MutationObserver(polishButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handlePrintClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handlePrintClick, true);
    };
  }, []);

  return null;
}
