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
    <main className="ceami-portal ceami-launcher">
      <header className="ceami-launcher-header">
        <div className="ceami-launcher-brand">
          <img src="/brand/ceami-icon.svg?v=official-2" alt="CEAMI" />
          <div>
            <strong>CEAMI</strong>
            <span>Central de aplicativos</span>
          </div>
        </div>

        <div className="ceami-launcher-account">
          <span className="ceami-launcher-user">{fullName || 'Conta CEAMI'}</span>
          <Link href="/conta" aria-label="Minha conta"><KeyRound size={17} /><span>Minha conta</span></Link>
          {isAdmin && (
            <Link href="/acessos" aria-label="Gerenciar acessos"><ShieldCheck size={17} /><span>Acessos</span></Link>
          )}
          <button type="button" onClick={() => void signOut()} aria-label="Sair">
            <LogOut size={17} /><span>Sair</span>
          </button>
        </div>
      </header>

      <section className="ceami-launcher-intro">
        <span>SEUS APLICATIVOS</span>
        <h1>Onde você quer trabalhar agora?</h1>
        <p>Escolha um módulo. Sua sessão continua ativa ao alternar entre eles.</p>
      </section>

      <section className="ceami-launcher-grid" aria-label="Aplicativos CEAMI">
        {visible.map(({ key, name, eyebrow, description, icon: Icon }) => (
          <Link
            key={key}
            href={CEAMI_MODULE_PATHS[key]}
            className={`ceami-launcher-card ceami-launcher-card-${key}`}
            onClick={() => rememberModule(key)}
          >
            <div className="ceami-launcher-card-top">
              <div className="ceami-launcher-card-icon"><Icon size={23} /></div>
              <ArrowRight className="ceami-launcher-card-arrow" size={19} />
            </div>
            <div className="ceami-launcher-card-copy">
              <span>{eyebrow}</span>
              <h2>{name}</h2>
              <p>{description}</p>
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

      <footer className="ceami-launcher-footer">
        <span>Um login para toda a plataforma.</span>
        <span>A CEAMI lembra o último módulo usado neste navegador.</span>
      </footer>
    </main>
  );
}
