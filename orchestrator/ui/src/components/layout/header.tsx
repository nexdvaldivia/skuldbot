'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, Search, ChevronDown, LogOut, Settings, Menu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    router.push('/login');
  };

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-60 z-30 h-14 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-zinc-200/80">
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        <div className="flex items-center flex-1 max-w-md gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input type="text" placeholder="Search bots, runs, runners..." className="pl-10 bg-white h-9" />
          </div>
        </div>

        <div className="flex items-center gap-2 pl-4">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4 text-zinc-500" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-400 ring-2 ring-white" />
          </Button>

          <div className="h-6 w-px bg-zinc-200 mx-1" />

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-zinc-100 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-medium">
                AD
              </div>
              <div className="hidden md:block text-left">
                <p className="text-[13px] font-medium text-zinc-900 leading-none">Admin</p>
                <p className="text-[11px] text-zinc-500 leading-none mt-0.5">admin@skuld.io</p>
              </div>
              <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-400 transition-transform', showUserMenu && 'rotate-180')} />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-lg bg-white border border-zinc-200 shadow-lg py-1.5 animate-in fade-in-0 zoom-in-95">
                <div className="px-3 py-2 border-b border-zinc-100">
                  <p className="text-sm font-medium text-zinc-900">Admin User</p>
                  <p className="text-xs text-zinc-500">admin@skuld.io</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/settings"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings className="h-4 w-4 text-zinc-400" />
                    Settings
                  </Link>
                </div>
                <div className="border-t border-zinc-100 pt-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-error-600 hover:bg-error-50 w-full"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
