'use client';

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

export default function CoursesShortcut() {
  return (
    <Link href="/cursos" className="courses-shortcut" aria-label="Abrir cursos e check-in">
      <GraduationCap size={19} />
      <span>Cursos</span>
    </Link>
  );
}
