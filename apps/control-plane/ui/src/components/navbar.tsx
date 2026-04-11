'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { SkuldLogo } from '@/components/ui/skuld-logo';
import {
  LayoutDashboard,
  Building2,
  Server,
  Key,
  Users,
  CreditCard,
  Store,
  Settings,
  ChevronDown,
  LogOut,
  Bell,
  Search,
  Command,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Clients', href: '/clients', icon: Building2 },
  { name: 'Orchestrators', href: '/tenants', icon: Server },
  { name: 'Licenses', href: '/licenses', icon: Key },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Billing', href: '/billing', icon: CreditCard },
  { name: 'Marketplace', href: '/marketplace', icon: Store },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut for search
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-14 items-center px-4 lg:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 mr-6">
          <SkuldLogo size={28} className="text-brand-400" />
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-zinc-900 text-[15px]">Skuld</span>
            <span className="text-[11px] font-medium text-zinc-400 hidden sm:inline">Control Plane</span>
          </div>
        </Link>

        {/* Main Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right Side Actions */}
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-400 hover:bg-zinc-100 hover:border-zinc-300 transition-colors text-sm"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-[13px]">Search...</span>
            <kbd className="hidden md:inline-flex h-5 items-center gap-0.5 rounded border border-zinc-200 bg-white px-1.5 font-mono text-[10px] text-zinc-400">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>

          {/* Mobile Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="sm:hidden p-2 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Notifications */}
          <button className="relative p-2 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-400 ring-2 ring-white" />
          </button>

          {/* Settings */}
          <Link
            href="/settings"
            className={cn(
              'p-2 rounded-md transition-colors',
              pathname === '/settings'
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
            )}
          >
            <Settings className="h-4 w-4" />
          </Link>

          {/* Divider */}
          <div className="h-6 w-px bg-zinc-200 mx-1" />

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-zinc-100 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-medium">
                AD
              </div>
              <div className="hidden md:block text-left">
                <p className="text-[13px] font-medium text-zinc-900 leading-none">Admin</p>
                <p className="text-[11px] text-zinc-500 leading-none mt-0.5">admin@skuld.io</p>
              </div>
              <ChevronDown className={cn(
                'h-3.5 w-3.5 text-zinc-400 transition-transform',
                userMenuOpen && 'rotate-180'
              )} />
            </button>

            {/* Dropdown */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-lg bg-white border border-zinc-200 shadow-lg py-1.5 animate-in fade-in-0 zoom-in-95">
                <div className="px-3 py-2 border-b border-zinc-100">
                  <p className="text-sm font-medium text-zinc-900">Admin User</p>
                  <p className="text-xs text-zinc-500">admin@skuld.io</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/settings"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings className="h-4 w-4 text-zinc-400" />
                    Settings
                  </Link>
                </div>
                <div className="border-t border-zinc-100 pt-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
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

      {/* Mobile Navigation */}
      <nav className="lg:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900'
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Search Modal */}
      {searchOpen && (
        <>
          <div
            className="fixed inset-0 bg-zinc-900/20 backdrop-blur-sm z-50"
            onClick={() => setSearchOpen(false)}
          />
          <div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg z-50 px-4">
            <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100">
                <Search className="h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search clients, tenants, users..."
                  className="flex-1 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none bg-transparent"
                  autoFocus
                />
                <kbd className="h-5 px-1.5 rounded border border-zinc-200 bg-zinc-50 font-mono text-[10px] text-zinc-400 flex items-center">
                  ESC
                </kbd>
              </div>
              <div className="p-2 max-h-80 overflow-y-auto">
                <p className="px-3 py-6 text-center text-sm text-zinc-400">
                  Start typing to search...
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
