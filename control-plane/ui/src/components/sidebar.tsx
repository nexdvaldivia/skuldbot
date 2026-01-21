'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  ChevronLeft,
  ChevronRight,
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

const bottomNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-white border-r border-zinc-200/80 transition-all duration-300 flex flex-col',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
    >
      {/* Logo Header */}
      <div className={cn(
        'h-14 flex items-center border-b border-zinc-200/80 px-4',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <SkuldLogo size={28} className="text-brand-400 flex-shrink-0" />
          {!collapsed && (
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-zinc-900 text-[15px]">Skuld</span>
              <span className="text-[11px] font-medium text-zinc-400">Control Plane</span>
            </div>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Collapse button when collapsed */}
      {collapsed && (
        <div className="flex justify-center py-3 border-b border-zinc-100">
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-brand-50 text-brand-600 border border-brand-100'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                )}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className={cn(
                  'flex-shrink-0',
                  collapsed ? 'h-5 w-5' : 'h-4 w-4',
                  isActive ? 'text-brand-500' : 'text-zinc-400'
                )} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-zinc-200/80 p-3">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-brand-50 text-brand-600 border border-brand-100'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn(
                'flex-shrink-0',
                collapsed ? 'h-5 w-5' : 'h-4 w-4',
                isActive ? 'text-brand-500' : 'text-zinc-400'
              )} />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
