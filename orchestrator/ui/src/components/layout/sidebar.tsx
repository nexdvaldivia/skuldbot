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
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkuldLogo } from '@/components/ui/skuld-logo';

type NavChild = {
  name: string;
  href: string;
};

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
  children?: NavChild[];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const mainSections: NavSection[] = [
  {
    title: 'Core Runtime',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
      {
        name: 'Bots',
        href: '/bots',
        icon: Bot,
        children: [{ name: 'Catalog', href: '/bots' }],
      },
      {
        name: 'Runs',
        href: '/runs',
        icon: Play,
        children: [{ name: 'Executions', href: '/runs' }],
      },
      { name: 'Runners', href: '/runners', icon: Server },
      { name: 'Schedules', href: '/schedules', icon: Calendar },
    ],
  },
  {
    title: 'Identity',
    items: [
      {
        name: 'Users',
        href: '/users',
        icon: Users,
        children: [
          { name: 'Team', href: '/users' },
          { name: 'Roles', href: '/users/roles' },
        ],
      },
    ],
  },
];

const platformSection: NavSection = {
  title: 'Platform',
  items: [
    { name: 'Traceability', href: '/traceability', icon: ShieldCheck },
    { name: 'Logs', href: '/logs', icon: FileText },
    { name: 'Settings', href: '/settings', icon: Settings },
  ],
};

function isPathActive(pathname: string, href: string, exact = false): boolean {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemHasActiveChild(pathname: string, item: NavItem): boolean {
  if (!item.children) {
    return false;
  }

  return item.children.some((child) => isPathActive(pathname, child.href));
}

export function Sidebar() {
  const pathname = usePathname();
  const renderSection = (section: NavSection) => (
    <div key={section.title} className="mb-5 last:mb-0">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
        {section.title}
      </p>
      <div className="space-y-1">
        {section.items.map((item) => {
          const activeByHref = isPathActive(pathname, item.href, item.exact);
          const activeByChild = itemHasActiveChild(pathname, item);
          const isActive = activeByHref || activeByChild;

          return (
            <div key={item.name}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-all',
                  isActive
                    ? 'border-brand-100 bg-brand-50 text-brand-600'
                    : 'border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
                )}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isActive ? 'text-brand-500' : 'text-zinc-400',
                  )}
                />
                <span>{item.name}</span>
              </Link>

              {item.children && item.children.length > 0 && (
                <div className="ml-7 mt-1 space-y-1 border-l border-zinc-100 pl-2">
                  {item.children.map((child) => {
                    const childActive = isPathActive(pathname, child.href);
                    return (
                      <Link
                        key={child.name}
                        href={child.href}
                        className={cn(
                          'block rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors',
                          childActive
                            ? 'bg-brand-50/70 text-brand-700'
                            : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900',
                        )}
                      >
                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[240px] flex-col overflow-hidden border-r border-zinc-200/80 bg-white lg:flex">
      <div className="flex h-14 items-center border-b border-zinc-200/80 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <SkuldLogo size={28} showText={false} />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold text-zinc-900">Skuld</span>
            <span className="text-[11px] font-medium text-zinc-400">Orchestrator</span>
          </div>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {mainSections.map((section) => renderSection(section))}
      </nav>

      <div className="shrink-0 border-t border-zinc-200/80 p-3">
        {renderSection(platformSection)}
      </div>

      <div className="border-t border-zinc-100 px-4 py-3">
        <p className="text-[11px] font-medium text-zinc-400">SkuldBot Orchestrator v0.1.0</p>
      </div>
    </aside>
  );
}
