import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { APP_TITLE } from '@/lib/config';
import InstallPrompt from '@/components/install-prompt';
const geoBro = localFont({ src: './fonts/SS-GEO-BRO-Medium.otf', display: 'swap', variable: '--font-geo-bro' });
export const metadata: Metadata = { title: APP_TITLE, description: 'ყოველდღიური გამოწვევა მეგობრებთან ერთად', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, title: APP_TITLE, statusBarStyle: 'default' }, icons: { icon: '/icon.svg', apple: '/icon-192.png' } };
export const viewport: Viewport = { themeColor: '#f7f9f5', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ka"><body className={geoBro.variable}>{children}<InstallPrompt/></body></html>; }
