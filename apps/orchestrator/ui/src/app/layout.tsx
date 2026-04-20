import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'SkuldBot Orchestrator',
  description: 'RPA Bot Orchestration Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50">
        <Providers>
          <div className="min-h-screen bg-zinc-50">
            <Sidebar />
            <Header />
            <main className="pt-14 min-h-screen transition-all duration-300 lg:pl-60">
              <div className="px-4 lg:px-6 py-6 pb-8">
                <div className="max-w-7xl mx-auto animate-fade-in">{children}</div>
              </div>
            </main>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
