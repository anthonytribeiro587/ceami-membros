import { NextRequest, NextResponse } from 'next/server';
import { hasCurrentModuleAccess } from '@/lib/server/current-profile';
import { getServiceClient, readLimitedJson, requestComesFromSameSite } from '@/lib/server/security';
import {
  SERVICE_FORM_SLUG,
  type ServiceRequestStatus,
} from '@/lib/services';

type Body = {
  submissionId?: string;
  status?: ServiceRequestStatus;
};

const VALID_STATUSES = new Set<ServiceRequestStatus>(['aberto', 'concluido', 'cancelado']);

export async function POST(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  }

  if (!(await hasCurrentModuleAccess('services', true))) {
    return NextResponse.json({ error: 'Acesso restrito ao CEAMI Serviços.' }, { status: 403 });
  }

  const body = await readLimitedJson<Body>(request, 4_000);
  const submissionId = String(body.submissionId || '').trim();
  const status = String(body.status || '') as ServiceRequestStatus;

  if (!submissionId || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço indisponível.' }, { status: 503 });
  }

  const { data: submission, error: loadError } = await service
    .from('form_submissions')
    .select('id, form_id, answers')
    .eq('id', submissionId)
    .maybeSingle();

  if (loadError || !submission) {
    return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
  }

  const { data: form } = await service
    .from('forms')
    .select('slug')
    .eq('id', submission.form_id)
    .maybeSingle();

  if (!form || form.slug !== SERVICE_FORM_SLUG) {
    return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });
  }

  const currentAnswers =
    submission.answers && typeof submission.answers === 'object' && !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};

  const { error: updateError } = await service
    .from('form_submissions')
    .update({
      answers: {
        ...currentAnswers,
        __service_status: status,
        __service_status_updated_at: new Date().toISOString(),
      },
    })
    .eq('id', submissionId);

  if (updateError) {
    console.error('Service request status update failed:', updateError.message);
    return NextResponse.json({ error: 'Não foi possível atualizar a solicitação.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}
