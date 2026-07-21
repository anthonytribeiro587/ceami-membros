'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

export default function CoursePortalSession() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [courseOnly, setCourseOnly] = useState(false);
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMode() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('course_only')
        .eq('id', user.id)
        .maybeSingle();

      if (active) setCourseOnly(Boolean(profile?.course_only));
    }

    void loadMode();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    document.documentElement.classList.toggle('course-only-mode', courseOnly);
    return () => document.documentElement.classList.remove('course-only-mode');
  }, [courseOnly]);

  useEffect(() => {
    if (!courseOnly) {
      setTarget(null);
      return;
    }

    const locate = () => {
      setTarget(
        document.querySelector('.courses-topbar .courses-actions') ||
          document.querySelector('.courses-topbar'),
      );
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [courseOnly]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login-cursos');
    router.refresh();
  }

  if (!courseOnly || !target) return null;

  return createPortal(
    <button type="button" className="secondary course-portal-signout" onClick={() => void signOut()}>
      <LogOut size={17} /> Sair
    </button>,
    target,
  );
}
