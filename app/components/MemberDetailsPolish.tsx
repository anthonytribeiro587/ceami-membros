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

function field(label: string, value: string, className = '') {
  return `<div class="field ${className}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
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
        ${field('Talentos e habilidades', display(member.talents), 'long-value')}
        ${field('Observações', display(member.notes), 'long-value')}
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
    body{padding:14px 0}
    .sheet{width:210mm;height:297mm;min-height:297mm;max-height:297mm;margin:0 auto 12mm;background:#fff;padding:7mm 9mm 7mm;position:relative;overflow:hidden;page-break-after:always;break-after:page;box-shadow:0 18px 55px rgba(8,48,66,.13)}
    .sheet:last-child{page-break-after:auto;break-after:auto}
    .sheet-header{display:grid;grid-template-columns:11mm minmax(0,1fr) auto;align-items:center;gap:3mm;padding-bottom:2.5mm;border-bottom:.4mm solid #e9eff1}
    .brand-mark{width:10mm;height:10mm;border-radius:3mm;display:grid;place-items:center;background:#ef5a25;color:#fff;font-size:10.5pt;font-weight:900}
    .brand-copy{display:grid;gap:.35mm}.brand-copy span{font-size:5.8pt;letter-spacing:.08em;color:#ef5a25;font-weight:800}.brand-copy strong{font-size:13.5pt;line-height:1}.brand-copy small{font-size:7pt;color:#6d7f88}
    .sheet-meta{text-align:right;display:grid;gap:.6mm}.sheet-meta span,.status-box span,.identity>div>span{font-size:6.2pt;letter-spacing:.12em;color:#ef5a25;font-weight:900}.sheet-meta strong{font-size:9pt}
    .identity{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5mm;align-items:end;padding:3.5mm 0 3mm}.identity h1{margin:1mm 0 0;font-size:17pt;line-height:1.05;letter-spacing:-.02em}.status-box{min-width:27mm;border:.3mm solid #dfe8eb;border-radius:3mm;padding:2mm 2.8mm;text-align:right}.status-box strong{display:block;margin-top:.8mm;font-size:8.5pt;text-transform:capitalize}
    .grid{display:grid;gap:2.5mm;margin-bottom:2.5mm;align-items:stretch}.grid.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
    .card{border:.3mm solid #dce6e9;border-radius:3mm;padding:2.6mm 3mm;break-inside:avoid;page-break-inside:avoid;min-width:0}.card.wide{margin-bottom:2.5mm}.card h2{margin:0 0 1.4mm;font-size:9.5pt;color:#073f57}
    .field{display:grid;grid-template-columns:39% minmax(0,1fr);gap:2mm;align-items:start;padding:1.35mm 0;border-top:.2mm solid #edf2f3;line-height:1.18;min-width:0}.field:first-of-type{border-top:0}.field span{font-size:7.2pt;color:#70848d}.field strong{font-size:7.7pt;font-weight:700;overflow-wrap:anywhere;word-break:break-word}.field.long-value strong{max-height:9mm;overflow:hidden}
    .review-box{display:grid;grid-template-columns:1.35fr .65fr;gap:7mm;margin-top:2mm;padding-top:2.5mm;border-top:.25mm dashed #cfdadd}.review-box div{display:grid;gap:1.5mm}.review-box span{font-size:7pt;color:#71848d;font-weight:700}.review-box i{display:block;height:4mm;border-bottom:.25mm solid #9eafb6}
    .sheet-footer{position:absolute;left:9mm;right:9mm;bottom:3.5mm;padding-top:1.5mm;border-top:.2mm solid #edf1f2;display:flex;justify-content:space-between;gap:6mm;color:#82949b;font-size:5.8pt}

    @media screen and (max-width:800px){
      body{padding:0}.sheet{width:100%;height:auto;min-height:100vh;max-height:none;margin:0;padding:20px;overflow:visible;box-shadow:none}
      .sheet-header{grid-template-columns:46px 1fr}.sheet-meta{grid-column:1/-1;text-align:left}.identity{grid-template-columns:1fr}.status-box{width:100%;text-align:left}
      .grid.two{grid-template-columns:1fr}.field{grid-template-columns:1fr;gap:3px}.field.long-value strong{max-height:none}.sheet-footer{position:static;margin-top:20px}.review-box{grid-template-columns:1fr}
    }

    @media print{
      html,body{width:210mm;background:#fff;padding:0!important;margin:0!important}
      .sheet{width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0!important;padding:7mm 9mm 7mm!important;overflow:hidden!important;box-shadow:none!important;page-break-after:always!important;break-after:page!important}
      .sheet:last-child{page-break-after:auto!important;break-after:auto!important}
      .sheet-header{grid-template-columns:11mm minmax(0,1fr) auto!important}
      .identity{grid-template-columns:minmax(0,1fr) auto!important}
      .grid.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
      .field{grid-template-columns:39% minmax(0,1fr)!important}
      .sheet-meta{text-align:right!important;grid-column:auto!important}
      .status-box{text-align:right!important;width:auto!important}
      .sheet-footer{position:absolute!important}
      @page{size:A4 portrait;margin:0}
    }
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
