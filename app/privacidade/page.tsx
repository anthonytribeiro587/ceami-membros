import Link from 'next/link';

export const metadata = {
  title: 'Privacidade',
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f4f7f8', padding: '32px 16px 96px', color: '#073f57' }}>
      <article style={{ width: 'min(820px, 100%)', margin: '0 auto', background: '#fff', border: '1px solid #e3eaed', borderRadius: 24, padding: 'clamp(22px, 5vw, 42px)', lineHeight: 1.7 }}>
        <span style={{ color: '#ef5a25', fontWeight: 900, letterSpacing: '.12em', fontSize: 12 }}>CEAMI MEMBROS</span>
        <h1 style={{ margin: '8px 0 10px', fontSize: 'clamp(30px, 6vw, 44px)' }}>Aviso de privacidade</h1>
        <p style={{ color: '#5f747e' }}>Versão 2026-07-22-v1</p>

        <h2>Por que os dados são usados</h2>
        <p>A CEAMI utiliza as informações fornecidas para cadastro e cuidado de membros, organização do Integra, acompanhamento de cursos e presenças, contato pastoral e administrativo e celebração de aniversários.</p>

        <h2>Quais informações podem ser tratadas</h2>
        <p>Nome, telefone, e-mail, nascimento, endereço, informações familiares, participação no Integra, caminhada de fé, habilidades, vínculo ministerial, inscrições em cursos e registros de presença.</p>

        <h2>Quem pode acessar</h2>
        <p>Somente pessoas autorizadas pela administração da CEAMI, conforme a função exercida. Organizadores exclusivos de cursos recebem acesso restrito ao módulo de formação.</p>

        <h2>Serviços utilizados</h2>
        <p>Os dados são armazenados e processados por fornecedores de infraestrutura contratados para hospedar o sistema e o banco de dados. A integração com WhatsApp é utilizada somente nos fluxos autorizados pela CEAMI.</p>

        <h2>Segurança e conservação</h2>
        <p>O sistema utiliza autenticação, controle de acesso, registros de auditoria e cópias de segurança conforme a configuração dos serviços contratados. Os dados devem ser mantidos apenas pelo período necessário às finalidades da comunidade e às obrigações aplicáveis.</p>

        <h2>Seus direitos</h2>
        <p>O titular pode solicitar confirmação de tratamento, acesso, correção, atualização e análise de pedidos de eliminação ou bloqueio, observadas as hipóteses legais aplicáveis. As solicitações devem ser encaminhadas à secretaria ou à liderança da CEAMI pelos canais oficiais da igreja.</p>

        <h2>Responsabilidade administrativa</h2>
        <p>A CEAMI define as finalidades e regras de uso das informações. A NextLead atua no desenvolvimento e suporte técnico conforme as orientações da administração da igreja.</p>

        <p style={{ marginTop: 32 }}><Link href="/integra" style={{ color: '#ef5a25', fontWeight: 800 }}>Voltar ao Integra</Link></p>
      </article>
    </main>
  );
}
