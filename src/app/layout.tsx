import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SmartBasket — Planeie a sua semana',
  description: 'Prepare um plano de refeições adaptado à sua casa, às suas preferências e ao seu orçamento.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>
        <nav className="site-nav" aria-label="Navegação principal">
          <Link href="/">SmartBasket</Link><div><Link href="/plan">Plano</Link><Link href="/catalogo">Catálogo</Link><Link href="/historico">Histórico</Link><Link href="/sobre-precos">Sobre preços</Link><Link href="/definicoes">Definições</Link></div>
        </nav>
        {children}
      </body>
    </html>
  );
}
