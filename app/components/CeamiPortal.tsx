'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarDays,
  HeartHandshake,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
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
];

export default function CeamiPortal({ modules }: { modules: CeamiModuleAccess[] }) {
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
