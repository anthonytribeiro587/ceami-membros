import { notFound } from 'next/navigation';
import SocialApp from '../SocialApp';

export default function SocialDesignPreviewPage() {
  if (process.env.VERCEL_ENV !== 'preview') notFound();
  return <SocialApp demoMode />;
}
