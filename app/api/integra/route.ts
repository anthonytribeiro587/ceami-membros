import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fullName = String(body.full_name || '').trim();

    if (!fullName) {
      return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRole) {
      return NextResponse.json({ error: 'Integração com o banco ainda não foi configurada.' }, { status: 500 });
    }

    const supabase = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = {
      full_name: fullName,
      phone: body.phone || null,
      email: body.email || null,
      birth_date: body.birth_date || null,
      marital_status: body.marital_status || null,
      spouse_name: body.spouse_name || null,
      address: body.address || null,
      neighborhood: body.neighborhood || null,
      city: body.city || null,
      zip_code: body.zip_code || null,
      has_children: Boolean(body.has_children),
      children_names: body.children_names || null,
      previous_church: Boolean(body.previous_church),
      previous_church_name: body.previous_church_name || null,
      water_baptized: Boolean(body.water_baptized),
      baptism_church: body.baptism_church || null,
      baptism_date: body.baptism_date || null,
      holy_spirit_baptized: Boolean(body.holy_spirit_baptized),
      fundamentos_fe: Boolean(body.fundamentos_fe),
      fundamentos_fe_date: body.fundamentos_fe_date || null,
      talents: body.talents || null,
      ministry: body.ministry || 'Sem ministério',
      notes: body.notes || null,
      whatsapp_consent: Boolean(body.whatsapp_consent),
      status: 'ativo',
      joined_at: new Date().toISOString().slice(0, 10),
    };

    const { error } = await supabase.from('members').insert(payload);

    if (error) {
      console.error('Erro ao salvar ficha do Integra:', error);
      return NextResponse.json({ error: 'Não foi possível salvar a ficha. Tente novamente.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro inesperado no formulário Integra:', error);
    return NextResponse.json({ error: 'Ocorreu um erro inesperado.' }, { status: 500 });
  }
}
