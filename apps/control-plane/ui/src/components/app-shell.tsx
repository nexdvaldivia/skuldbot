'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { TopHeader } from './top-header';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * AppShell - Main application layout wrapper with sidebar navigation
 *
 * Layout:
 * - Fixed left sidebar (collapsible)
 * - Fixed top header with search/notifications/user
 * - Scrollable main content area
 */
export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Persist sidebar state
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true');
    }
  }, []);

  const handleToggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggle={handleToggleSidebar} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-zinc-900/50 z-40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <Sidebar collapsed={false} onToggle={() => setMobileSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Top Header */}
      <TopHeader
        sidebarCollapsed={sidebarCollapsed}
        onMenuClick={() => setMobileSidebarOpen(true)}
      />

      {/* Main Content */}
      <main
        className={cn(
          'pt-14 min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'lg:pl-[68px]' : 'lg:pl-60'
        )}
      >
        <div className="pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
