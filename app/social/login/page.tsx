import { redirect } from 'next/navigation';

export default function SocialLoginPage() {
  redirect('/login?next=/social');
}
