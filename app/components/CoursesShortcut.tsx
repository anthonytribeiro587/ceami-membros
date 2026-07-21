'use client';

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

export default function CoursesShortcut() {
  const supabase = useMemo(() => createClient(), []);
  const [target, setTarget] = useState<Element | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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

  if (!isAdmin || !target) return null;

  return createPortal(
    <Link href="/cursos" className="courses-shortcut" aria-label="Abrir cursos e check-in">
      <GraduationCap size={19} />
      <span>Cursos</span>
    </Link>,
    target,
  );
}
