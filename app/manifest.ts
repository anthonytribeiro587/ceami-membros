import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CEAMI Membros',
    short_name: 'CEAMI',
    description: 'Cadastro de membros e aniversários automáticos da CEAMI.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f7f8',
    theme_color: '#df6034',
    icons: [
      {
        src: '/brand/ceami-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
