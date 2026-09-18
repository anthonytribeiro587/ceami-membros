import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import DynamicPublicFormClient from './DynamicPublicFormClient';
import SeminarPublicCopyCleanup from './SeminarPublicCopyCleanup';
import { SERVICE_FORM_SLUG } from '@/lib/services';
import './form-public.css';

export const metadata: Metadata = {
  title: 'Inscrição | CEAMI',
  description: 'Formulário de inscrição da Comunidade CEAMI.',
  robots: { index: false, follow: false },
};

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === SERVICE_FORM_SLUG) redirect('/servicos/solicitar');

  return (
    <>
      <DynamicPublicFormClient slug={slug} />
      <SeminarPublicCopyCleanup slug={slug} />
    </>
  );
}
