'use client';

import Link from 'next/link';
import { GraduationCap, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

export default function CoursesShortcut() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [target, setTarget] = useState<Element | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (active) setIsAdmin(profile?.role === 'admin');
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    const locate = () => setTarget(document.querySelector('.sidebar nav'));
    locate();

    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (!target) return null;

  return createPortal(
    <>
      {isAdmin && (
        <Link href="/cursos" className="courses-shortcut" aria-label="Abrir cursos e check-in">
          <GraduationCap size={19} />
          <span>Cursos</span>
        </Link>
      )}
      <button
        type="button"
        className="panel-signout"
        onClick={() => void signOut()}
        disabled={signingOut}
      >
        <LogOut size={19} />
        <span>{signingOut ? 'Saindo...' : 'Sair'}</span>
      </button>
    </>,
    target,
  );
}
