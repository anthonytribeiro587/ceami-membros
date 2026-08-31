import type { Metadata } from 'next';
import PublicFormClient from './PublicFormClient';
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
  return <PublicFormClient slug={slug} />;
}
