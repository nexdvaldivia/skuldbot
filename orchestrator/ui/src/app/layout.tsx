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
      <body className="min-h-screen bg-background">
        <Providers>
          <div className="flex h-screen">
            {/* Sidebar */}
            <Sidebar />

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6">
                <div className="max-w-7xl mx-auto animate-fade-in">
                  {children}
                </div>
              </main>
            </div>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
