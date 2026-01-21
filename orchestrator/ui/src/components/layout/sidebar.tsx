'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Play,
  Server,
  Calendar,
  Settings,
  FileText,
  Users,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkuldLogoDark } from '@/components/ui/skuld-logo';
import { Separator } from '@/components/ui/separator';

const mainNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Bots', href: '/bots', icon: Bot },
  { name: 'Runs', href: '/runs', icon: Play },
  { name: 'Runners', href: '/runners', icon: Server },
  { name: 'Schedules', href: '/schedules', icon: Calendar },
];

const secondaryNavigation = [
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Logs', href: '/logs', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
      {/* Logo */}
      <div className="h-16 flex items-center px-4">
        <SkuldLogoDark size="md" />
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {mainNavigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary/10 text-sidebar-primary'
                    : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </div>

        <Separator className="my-4 bg-sidebar-border" />

        <div className="space-y-1">
          {secondaryNavigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary/10 text-sidebar-primary'
                    : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-muted">SkuldBot Orchestrator v0.1.0</p>
      </div>
    </aside>
  );
}
