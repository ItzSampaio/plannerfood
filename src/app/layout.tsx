import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartBasket — Planeie a sua semana',
  description: 'Prepare um plano de refeições adaptado à sua casa, às suas preferências e ao seu orçamento.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
