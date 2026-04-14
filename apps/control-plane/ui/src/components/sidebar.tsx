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
  Activity,
  FileText,
  Headphones,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

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
    title: 'Core Operations',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
      {
        name: 'Clients',
        href: '/clients',
        icon: Building2,
        children: [
          { name: 'Directory', href: '/clients' },
          { name: 'Orchestrators', href: '/tenants' },
        ],
      },
      { name: 'Orchestrator Fleet', href: '/tenants', icon: Server },
      { name: 'Licenses', href: '/licenses', icon: Key },
      {
        name: 'Contracts',
        href: '/contracts',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Revenue',
    items: [
      {
        name: 'Billing',
        href: '/billing',
        icon: CreditCard,
        children: [
          { name: 'Subscriptions', href: '/billing' },
          { name: 'Revenue Share', href: '/billing/revenue-share' },
        ],
      },
    ],
  },
  {
    title: 'Marketplace',
    items: [
      {
        name: 'Marketplace',
        href: '/marketplace',
        icon: Store,
        children: [
          { name: 'Catalog', href: '/marketplace' },
          { name: 'Submissions', href: '/marketplace/submissions' },
          { name: 'Partners', href: '/marketplace/partners' },
        ],
      },
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
          { name: 'Roles & Permissions', href: '/users/roles' },
        ],
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        name: 'Support',
        href: '/support',
        icon: Headphones,
        children: [
          { name: 'Dashboard', href: '/support' },
          { name: 'Tickets', href: '/support/tickets' },
        ],
      },
    ],
  },
  {
    title: 'Observability',
    items: [
      {
        name: 'Telemetry',
        href: '/telemetry/mcp',
        icon: Activity,
        children: [{ name: 'MCP Telemetry', href: '/telemetry/mcp' }],
      },
    ],
  },
];

const platformSection: NavSection = {
  title: 'Platform',
  items: [
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      children: [
        { name: 'General', href: '/settings' },
        { name: 'Integrations', href: '/settings/integrations' },
      ],
    },
  ],
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

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

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const renderSection = (section: NavSection) => (
    <div key={section.title} className="mb-5 last:mb-0">
      {!collapsed && (
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          {section.title}
        </p>
      )}

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
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-brand-50 text-brand-600 border border-brand-100'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50',
                )}
                title={collapsed ? `${section.title}: ${item.name}` : undefined}
              >
                <item.icon
                  className={cn(
                    'flex-shrink-0',
                    collapsed ? 'h-5 w-5' : 'h-4 w-4',
                    isActive ? 'text-brand-500' : 'text-zinc-400',
                  )}
                />
                {!collapsed && <span>{item.name}</span>}
              </Link>

              {!collapsed && item.children && item.children.length > 0 && (
                <div className="ml-7 mt-1 pl-2 border-l border-zinc-100 space-y-1">
                  {item.children.map((child) => {
                    const childActive = isPathActive(pathname, child.href);

                    return (
                      <Link
                        key={child.name}
                        href={child.href}
                        className={cn(
                          'block rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors',
                          childActive
                            ? 'text-brand-700 bg-brand-50/70'
                            : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50',
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
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-white border-r border-zinc-200/80 transition-all duration-300 flex flex-col overflow-hidden',
        collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      <div
        className={cn(
          'h-14 flex items-center border-b border-zinc-200/80 px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
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

      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-4 px-3">
        {mainSections.map((section) => renderSection(section))}
      </nav>

      <div className="shrink-0 border-t border-zinc-200/80 p-3">
        {renderSection(platformSection)}
      </div>
    </aside>
  );
}
