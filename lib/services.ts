export const SERVICE_FORM_SLUG = 'solicitar-servico';

export type ServiceRequestStatus = 'aberto' | 'concluido' | 'cancelado';

export type ServiceSettings = {
  version: 1;
  kind: 'ceami-services';
  notifyPhone: string;
  disclaimer: string;
};

export const DEFAULT_SERVICE_DISCLAIMER =
  'Os serviços são prestados por profissionais independentes e são cobrados. Valores, prazos, materiais, garantias e demais condições devem ser combinados diretamente entre o solicitante e o prestador. A CEAMI apenas facilita o contato e não participa da negociação, do pagamento ou da execução do serviço, nem se responsabiliza pela contratação, qualidade, segurança, atrasos ou eventuais danos.';

export const DEFAULT_SERVICE_DESCRIPTION =
  'Conte o que você precisa e a CEAMI fará a ponte com prestadores de serviços da comunidade.';

export function defaultServiceSettings(): ServiceSettings {
  return {
    version: 1,
    kind: 'ceami-services',
    notifyPhone: '',
    disclaimer: DEFAULT_SERVICE_DISCLAIMER,
  };
}

export function parseServiceSettings(value: unknown): ServiceSettings {
  if (typeof value !== 'string' || !value.trim()) return defaultServiceSettings();

  try {
    const parsed = JSON.parse(value) as Partial<ServiceSettings>;
    if (parsed.kind !== 'ceami-services') return defaultServiceSettings();

    return {
      version: 1,
      kind: 'ceami-services',
      notifyPhone: String(parsed.notifyPhone || '').trim(),
      disclaimer:
        String(parsed.disclaimer || '').trim() || DEFAULT_SERVICE_DISCLAIMER,
    };
  } catch {
    return defaultServiceSettings();
  }
}

export function serializeServiceSettings(settings: ServiceSettings) {
  return JSON.stringify({
    version: 1,
    kind: 'ceami-services',
    notifyPhone: settings.notifyPhone.trim(),
    disclaimer: settings.disclaimer.trim() || DEFAULT_SERVICE_DISCLAIMER,
  } satisfies ServiceSettings);
}

export function serviceStatusFromAnswers(
  answers: Record<string, unknown> | null | undefined,
): ServiceRequestStatus {
  const value = String(answers?.__service_status || '').toLowerCase();
  if (value === 'concluido' || value === 'cancelado') return value;
  return 'aberto';
}
