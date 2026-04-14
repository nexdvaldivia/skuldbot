'use client';

import { useState } from 'react';
import {
  Settings,
  FolderOpen,
  Tag,
  AlertCircle,
  GitBranch,
  Clock,
  Calendar,
  Shield,
  Mail,
  UserCog,
  MessageSquare,
  FormInput,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

type SettingsTab =
  | 'categories'
  | 'tags'
  | 'priorities'
  | 'statuses'
  | 'business-hours'
  | 'holidays'
  | 'sla'
  | 'notifications'
  | 'assignment'
  | 'canned-responses'
  | 'custom-fields';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType; description: string }[] = [
  {
    id: 'categories',
    label: 'Categories',
    icon: FolderOpen,
    description: 'Ticket types with icons, colors, and required fields',
  },
  {
    id: 'tags',
    label: 'Tags',
    icon: Tag,
    description: 'Labels for organizing and filtering tickets',
  },
  {
    id: 'priorities',
    label: 'Priorities',
    icon: AlertCircle,
    description: 'Severity levels that drive SLA targets',
  },
  {
    id: 'statuses',
    label: 'Status Workflow',
    icon: GitBranch,
    description: 'Define ticket statuses and allowed transitions',
  },
  {
    id: 'business-hours',
    label: 'Business Hours',
    icon: Clock,
    description: 'Working schedules for SLA calculations',
  },
  {
    id: 'holidays',
    label: 'Holidays',
    icon: Calendar,
    description: 'Non-working days excluded from SLA time',
  },
  {
    id: 'sla',
    label: 'SLA Policies',
    icon: Shield,
    description: 'Response and resolution targets by priority and category',
  },
  {
    id: 'notifications',
    label: 'Email Templates',
    icon: Mail,
    description: 'Customize notification emails for ticket events',
  },
  {
    id: 'assignment',
    label: 'Auto-Assignment',
    icon: UserCog,
    description: 'Rules for routing tickets to agents or teams',
  },
  {
    id: 'canned-responses',
    label: 'Canned Responses',
    icon: MessageSquare,
    description: 'Pre-written reply templates for common issues',
  },
  {
    id: 'custom-fields',
    label: 'Custom Fields',
    icon: FormInput,
    description: 'Additional data fields per ticket category',
  },
];

function CategoriesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Ticket Categories</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            Define the types of support requests your team handles.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
          Add Category
        </button>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          No categories configured yet. Add your first category to organize tickets.
        </div>
      </div>
    </div>
  );
}

function PrioritiesPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Priority Levels</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          Severity levels determine SLA targets and escalation rules.
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
        {[
          { name: 'Critical', color: 'bg-red-500', sla: '1 hour response, 4 hour resolution' },
          { name: 'High', color: 'bg-amber-500', sla: '4 hour response, 8 hour resolution' },
          { name: 'Medium', color: 'bg-blue-500', sla: '8 hour response, 24 hour resolution' },
          { name: 'Low', color: 'bg-zinc-400', sla: '24 hour response, 72 hour resolution' },
        ].map((p) => (
          <div key={p.name} className="flex items-center gap-4 px-5 py-3.5">
            <div className={`w-3 h-3 rounded-full ${p.color}`} />
            <div className="flex-1">
              <span className="text-sm font-medium text-zinc-900">{p.name}</span>
              <p className="text-xs text-zinc-500">{p.sla}</p>
            </div>
            <button className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusWorkflowPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Status Workflow</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            Define ticket statuses and the allowed transitions between them.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
          Add Status
        </button>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
        {[
          { name: 'Open', type: 'open', transitions: ['In Progress', 'Pending', 'Closed'] },
          { name: 'In Progress', type: 'open', transitions: ['Pending', 'Resolved', 'Closed'] },
          { name: 'Pending', type: 'pending', transitions: ['Open', 'In Progress', 'Resolved'] },
          { name: 'Resolved', type: 'resolved', transitions: ['Open', 'Closed'] },
          { name: 'Closed', type: 'closed', transitions: ['Open'] },
        ].map((s) => (
          <div key={s.name} className="flex items-center gap-4 px-5 py-3.5">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900">{s.name}</span>
                <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                  {s.type}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Can transition to: {s.transitions.join(', ')}
              </p>
            </div>
            <button className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
              Edit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SLAPoliciesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">SLA Policies</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            Set response and resolution targets. Policies match by priority, category, and client
            tier.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
          Add Policy
        </button>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          No SLA policies configured. Create policies to track response and resolution times.
        </div>
      </div>
    </div>
  );
}

function BusinessHoursPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Business Hours</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            Working schedules used for SLA calculations. Time outside business hours is excluded.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
          Add Schedule
        </button>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          No business hours schedules configured. Add a schedule to enable SLA time calculations.
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Email Notification Templates</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          Customize email notifications sent for ticket events.
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
        {[
          {
            event: 'Ticket Created',
            recipient: 'Customer + Team',
            description: 'Sent when a new ticket is submitted',
          },
          {
            event: 'Ticket Assigned',
            recipient: 'Agent',
            description: 'Sent when a ticket is assigned to an agent',
          },
          {
            event: 'New Comment (Staff)',
            recipient: 'Customer',
            description: 'Sent when staff replies to a ticket',
          },
          {
            event: 'New Comment (Customer)',
            recipient: 'Agent',
            description: 'Sent when customer adds a comment',
          },
          {
            event: 'Status Changed',
            recipient: 'Customer',
            description: 'Sent when ticket status is updated',
          },
          {
            event: 'Ticket Resolved',
            recipient: 'Customer',
            description: 'Sent when ticket is marked as resolved',
          },
          {
            event: 'SLA Warning',
            recipient: 'Agent + Escalation',
            description: 'Sent at 80% of SLA time elapsed',
          },
          {
            event: 'SLA Breach',
            recipient: 'Agent + Escalation',
            description: 'Sent when SLA target is exceeded',
          },
          {
            event: 'CSAT Survey',
            recipient: 'Customer',
            description: 'Sent after ticket resolution for satisfaction rating',
          },
        ].map((t) => (
          <div key={t.event} className="flex items-center gap-4 px-5 py-3.5">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900">{t.event}</span>
                <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                  {t.recipient}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>
            </div>
            <button className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
              Customize
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignmentRulesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Auto-Assignment Rules</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            Route tickets automatically to agents or teams based on criteria.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
          Add Rule
        </button>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          No auto-assignment rules configured. Tickets will remain unassigned until manually
          assigned.
        </div>
      </div>
    </div>
  );
}

function CannedResponsesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Canned Responses</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            Pre-written reply templates for common support scenarios.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
          Add Response
        </button>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          No canned responses yet. Create templates to speed up agent replies.
        </div>
      </div>
    </div>
  );
}

function PlaceholderPanel({ tab }: { tab: SettingsTab }) {
  const config = tabs.find((t) => t.id === tab);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
      <p className="text-sm text-zinc-500">{config?.description || 'Configuration coming soon.'}</p>
    </div>
  );
}

export default function SupportSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('categories');

  const renderPanel = () => {
    switch (activeTab) {
      case 'categories':
        return <CategoriesPanel />;
      case 'priorities':
        return <PrioritiesPanel />;
      case 'statuses':
        return <StatusWorkflowPanel />;
      case 'sla':
        return <SLAPoliciesPanel />;
      case 'business-hours':
        return <BusinessHoursPanel />;
      case 'notifications':
        return <NotificationsPanel />;
      case 'assignment':
        return <AssignmentRulesPanel />;
      case 'canned-responses':
        return <CannedResponsesPanel />;
      default:
        return <PlaceholderPanel tab={activeTab} />;
    }
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <PageHeader
        icon={Settings}
        title="Support Settings"
        description="Configure categories, SLA policies, notifications, and assignment rules"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
        {/* Settings Navigation */}
        <nav className="space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 border border-brand-100'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-500' : 'text-zinc-400'}`}
                />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Settings Content */}
        <div className="lg:col-span-3">{renderPanel()}</div>
      </div>
    </div>
  );
}
