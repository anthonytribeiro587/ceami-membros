import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUiRole } from '@/lib/server/current-profile';
import {
  getServiceClient,
  readLimitedJson,
  requestComesFromSameSite,
} from '@/lib/server/security';
import { isCeamiModuleKey, type CeamiModuleKey } from '@/lib/types/ceami-module';

type Body = {
  profileId?: unknown;
  moduleKey?: unknown;
  enabled?: unknown;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function accessLevelFor(moduleKey: CeamiModuleKey, role: string) {
  if (moduleKey !== 'members') return 'manager';
  return ['admin', 'secretaria', 'pastor'].includes(role) ? 'manager' : 'viewer';
}

export async function PATCH(request: NextRequest) {
  if (!requestComesFromSameSite(request)) {
    return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 });
  }

  const role = await getCurrentUiRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito ao administrador Master.' }, { status: 403 });
  }

  const body = await readLimitedJson<Body>(request, 4_000);
  const profileId = String(body.profileId || '').trim();
  const moduleKey = String(body.moduleKey || '').trim();
  const enabled = body.enabled === true;

  if (!isUuid(profileId) || !isCeamiModuleKey(moduleKey)) {
    return NextResponse.json({ error: 'Dados de acesso inválidos.' }, { status: 400 });
  }

  const service = getServiceClient();
  if (!service) {
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, role, is_active, course_only, visitors_only')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  }

  if (profile.role === 'admin' && !enabled) {
    return NextResponse.json(
      { error: 'Administradores Master sempre possuem acesso a todos os módulos.' },
      { status: 400 },
    );
  }

  const { error } = await service
    .from('profile_module_access')
    .upsert(
      {
        profile_id: profileId,
        module_key: moduleKey,
        access_level: accessLevelFor(moduleKey, String(profile.role)),
        can_access: profile.role === 'admin' ? true : enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,module_key' },
    );

  if (error) {
    console.error('Module access update failed:', error.message);
    return NextResponse.json({ error: 'Não foi possível atualizar o acesso.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, enabled: profile.role === 'admin' ? true : enabled });
}
