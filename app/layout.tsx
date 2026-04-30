import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import PwaRegister from './pwa-register';

export const metadata: Metadata = {
  title: 'Mile Tracker',
  description: 'A mobile-first PWA for mileage reimbursement tracking.',
  appleWebApp: {
    capable: true,
    title: 'Mile Tracker',
    statusBarStyle: 'black-translucent'
  }
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mile Tracker" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="icon" href="/icon-512.png" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="mask-icon" href="/favicon.svg" color="#a855f7" />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
