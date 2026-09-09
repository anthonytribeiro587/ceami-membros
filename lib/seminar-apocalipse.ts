export const SEMINAR_APOCALIPSE_SLUG = 'seminario-apocalipse-2026';

// 11/09/2026 00:00 em America/Sao_Paulo (UTC-03).
// Assim, a apostila em PDF fica disponível durante toda a quinta-feira, 10/09.
export const SEMINAR_PDF_CUTOFF_ISO = '2026-09-11T03:00:00.000Z';

export type SeminarMaterialKind = 'physical' | 'pdf' | 'none' | 'other';

export function normalizeSeminarText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function seminarChoicePrice(value: unknown) {
  const text = String(value ?? '').trim();
  const normalized = normalizeSeminarText(text);
  if (!text || normalized.includes('sem custo') || normalized.includes('gratuit')) return 0;

  const match = text.match(/R\$\s*([0-9.]+(?:,[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
  if (match?.[1]) {
    let raw = match[1];
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes(',')) raw = raw.replace(',', '.');
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (normalized === 'sim' || normalized.includes('fisic')) return 35;
  if (normalized.includes('pdf') || normalized.includes('digital')) return 10;
  return 0;
}

export function seminarMaterialKind(value: unknown): SeminarMaterialKind {
  const text = String(value ?? '').trim();
  const normalized = normalizeSeminarText(text);

  if (
    !text
    || normalized === 'nao'
    || normalized.includes('sem apostila')
    || normalized.includes('sem custo')
    || normalized.includes('gratuit')
  ) {
    return 'none';
  }

  const price = seminarChoicePrice(value);
  if (normalized === 'sim' || normalized.includes('fisic') || price === 35) return 'physical';
  if (normalized.includes('pdf') || normalized.includes('digital') || price === 10) return 'pdf';
  return 'other';
}

export function isSeminarPdfAvailable(at: Date = new Date()) {
  return at.getTime() < Date.parse(SEMINAR_PDF_CUTOFF_ISO);
}

export function seminarChoiceAvailability(value: unknown, at: Date = new Date()) {
  const kind = seminarMaterialKind(value);

  if (kind === 'physical') {
    return {
      available: false,
      kind,
      shortLabel: 'Indisponível',
      message: 'A apostila física está indisponível para novas inscrições.',
    } as const;
  }

  if (kind === 'pdf' && !isSeminarPdfAvailable(at)) {
    return {
      available: false,
      kind,
      shortLabel: 'Encerrado em 10/09',
      message: 'As inscrições para a apostila em PDF foram encerradas em 10/09.',
    } as const;
  }

  if (kind === 'pdf') {
    return {
      available: true,
      kind,
      shortLabel: 'Disponível até quinta-feira (10/09)',
      message: '',
    } as const;
  }

  return {
    available: true,
    kind,
    shortLabel: '',
    message: '',
  } as const;
}
