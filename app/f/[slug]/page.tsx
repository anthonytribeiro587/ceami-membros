import type { Metadata } from 'next';
import DynamicPublicFormClient from './DynamicPublicFormClient';
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
  return <DynamicPublicFormClient slug={slug} />;
}
