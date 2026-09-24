'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarDays,
  GraduationCap,
  Handshake,
  HeartHandshake,
  KeyRound,
  LogOut,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  CEAMI_MODULE_PATHS,
  type CeamiModuleAccess,
  type CeamiModuleKey,
} from '@/lib/types/ceami-module';

type ModuleDefinition = {
  key: CeamiModuleKey;
  name: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
};

const DEFINITIONS: ModuleDefinition[] = [
  {
    key: 'members',
    name: 'Membros',
    eyebrow: 'GESTÃO DE PESSOAS',
    description: 'Cadastros, ministérios, aniversários, Integra e comunicação.',
    icon: Users,
  },
  {
    key: 'social',
    name: 'Social',
    eyebrow: 'AÇÃO SOCIAL',
    description: 'Doações, estoque, cestas, famílias atendidas e entregas.',
    icon: HeartHandshake,
  },
  {
    key: 'events',
    name: 'Eventos',
    eyebrow: 'EVENTOS E INSCRIÇÕES',
    description: 'Eventos, inscrições, participantes, pagamentos e materiais.',
    icon: CalendarDays,
  },
  {
    key: 'services',
    name: 'Serviços',
    eyebrow: 'ATENDIMENTOS',
    description: 'Solicitações da comunidade e acompanhamento dos atendimentos.',
    icon: Wrench,
  },
  {
    key: 'welcome',
    name: 'Acolhimentos',
    eyebrow: 'RECEPÇÃO E CUIDADO',
    description: 'Visitantes, retornos, contatos e acompanhamento da equipe de acolhimento.',
    icon: Handshake,
  },
  {
    key: 'courses',
    name: 'Cursos',
    eyebrow: 'FREQUÊNCIA E TURMAS',
    description: 'Turmas, aulas, alunos, presença manual e check-in por QR Code.',
    icon: GraduationCap,
  },
];

export default function CeamiPortal({
  modules,
  isAdmin,
  fullName,
}: {
  modules: CeamiModuleAccess[];
  isAdmin: boolean;
  fullName: string;
}) {
  const router = useRouter();
  const allowed = new Set(modules.map((module) => module.moduleKey));
  const visible = DEFINITIONS.filter((module) => allowed.has(module.key));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('selecionar') === '1') return;

    const lastModule = window.localStorage.getItem('ceami:last-module') as CeamiModuleKey | null;
    if (lastModule && allowed.has(lastModule)) {
      router.replace(CEAMI_MODULE_PATHS[lastModule]);
      return;
    }

    if (visible.length === 1) {
      router.replace(CEAMI_MODULE_PATHS[visible[0].key]);
    }
  }, [router, modules]);

  function rememberModule(moduleKey: CeamiModuleKey) {
    window.localStorage.setItem('ceami:last-module', moduleKey);
  }

  async function signOut() {
    window.localStorage.removeItem('ceami:last-module');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <main className="ceami-portal">
      <section className="ceami-portal-hero">
        <div className="ceami-portal-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div>
            <strong>CEAMI</strong>
            <span>Central de aplicativos</span>
          </div>
        </div>

        <div className="ceami-portal-copy">
          <span>UM ACESSO. TODOS OS MÓDULOS.</span>
          <h1>O que você deseja acessar?</h1>
          <p>
            Sua conta é única. Você pode alternar entre os aplicativos liberados
            para o seu perfil sem sair e entrar novamente.
          </p>
        </div>

        <div className="ceami-portal-account">
          <span>{fullName || 'Conta CEAMI'}</span>
          <Link href="/conta" className="ceami-portal-admin">
            <KeyRound size={17} />
            Minha conta
          </Link>
          {isAdmin && (
            <Link href="/acessos" className="ceami-portal-admin">
              <ShieldCheck size={17} />
              Gerenciar acessos
            </Link>
          )}
          <button type="button" onClick={() => void signOut()}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </section>

      <section className="ceami-portal-modules" aria-label="Aplicativos CEAMI">
        {visible.map(({ key, name, eyebrow, description, icon: Icon }) => (
          <Link
            key={key}
            href={CEAMI_MODULE_PATHS[key]}
            className={`ceami-portal-card ceami-portal-card-${key}`}
            onClick={() => rememberModule(key)}
          >
            <div className="ceami-portal-card-icon"><Icon size={24} /></div>
            <div className="ceami-portal-card-copy">
              <span>{eyebrow}</span>
              <h2>CEAMI {name}</h2>
              <p>{description}</p>
            </div>
            <div className="ceami-portal-card-action">
              <span>Acessar</span>
              <ArrowRight size={18} />
            </div>
          </Link>
        ))}

        {visible.length === 0 && (
          <div className="ceami-portal-empty">
            <strong>Nenhum aplicativo liberado para esta conta.</strong>
            <p>Peça à administração da CEAMI para revisar suas permissões.</p>
          </div>
        )}
      </section>

      <footer className="ceami-portal-note">
        A CEAMI lembra o último aplicativo usado neste navegador. Para escolher outro,
        use o seletor de aplicativos dentro de qualquer módulo.
      </footer>
    </main>
  );
}
