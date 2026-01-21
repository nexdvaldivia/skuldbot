'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Shield,
  Plus,
  Search,
  Edit2,
  Trash2,
  Users,
  Building2,
  Key,
  CreditCard,
  Store,
  Settings,
  Eye,
  PenLine,
  UserPlus,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
} from 'lucide-react';

// Modules del Control Plane con sus permisos
const modules = [
  {
    id: 'clients',
    name: 'Clients',
    icon: Building2,
    permissions: ['view', 'create', 'edit', 'delete'],
  },
  {
    id: 'tenants',
    name: 'Tenants',
    icon: Building2,
    permissions: ['view', 'create', 'edit', 'delete', 'manage_config'],
  },
  {
    id: 'licenses',
    name: 'Licenses',
    icon: Key,
    permissions: ['view', 'create', 'edit', 'delete', 'revoke', 'renew'],
  },
  {
    id: 'billing',
    name: 'Billing',
    icon: CreditCard,
    permissions: ['view', 'create_invoice', 'manage_subscriptions', 'view_revenue', 'export_reports'],
  },
  {
    id: 'marketplace',
    name: 'Marketplace',
    icon: Store,
    permissions: ['view', 'approve_bots', 'reject_bots', 'manage_partners', 'set_pricing'],
  },
  {
    id: 'users',
    name: 'Users',
    icon: Users,
    permissions: ['view', 'invite', 'edit', 'deactivate', 'manage_roles'],
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: Settings,
    permissions: ['view', 'edit_system', 'manage_integrations', 'view_audit_logs'],
  },
];

const permissionLabels: Record<string, { label: string; icon: React.ElementType }> = {
  view: { label: 'View', icon: Eye },
  create: { label: 'Create', icon: Plus },
  edit: { label: 'Edit', icon: PenLine },
  delete: { label: 'Delete', icon: Trash2 },
  manage_config: { label: 'Manage Config', icon: Settings },
  revoke: { label: 'Revoke', icon: Ban },
  renew: { label: 'Renew', icon: CheckCircle2 },
  create_invoice: { label: 'Create Invoice', icon: Plus },
  manage_subscriptions: { label: 'Manage Subscriptions', icon: CreditCard },
  view_revenue: { label: 'View Revenue', icon: Eye },
  export_reports: { label: 'Export Reports', icon: Copy },
  approve_bots: { label: 'Approve Bots', icon: CheckCircle2 },
  reject_bots: { label: 'Reject Bots', icon: Ban },
  manage_partners: { label: 'Manage Partners', icon: Users },
  set_pricing: { label: 'Set Pricing', icon: CreditCard },
  invite: { label: 'Invite', icon: UserPlus },
  deactivate: { label: 'Deactivate', icon: Ban },
  manage_roles: { label: 'Manage Roles', icon: Shield },
  edit_system: { label: 'Edit System', icon: Settings },
  manage_integrations: { label: 'Manage Integrations', icon: Settings },
  view_audit_logs: { label: 'View Audit Logs', icon: Eye },
};

// Mock roles data
const mockRoles = [
  {
    id: '1',
    name: 'Super Admin',
    description: 'Full access to all Control Plane features',
    isSystem: true,
    usersCount: 2,
    color: 'brand',
    permissions: {
      clients: ['view', 'create', 'edit', 'delete'],
      tenants: ['view', 'create', 'edit', 'delete', 'manage_config'],
      licenses: ['view', 'create', 'edit', 'delete', 'revoke', 'renew'],
      billing: ['view', 'create_invoice', 'manage_subscriptions', 'view_revenue', 'export_reports'],
      marketplace: ['view', 'approve_bots', 'reject_bots', 'manage_partners', 'set_pricing'],
      users: ['view', 'invite', 'edit', 'deactivate', 'manage_roles'],
      settings: ['view', 'edit_system', 'manage_integrations', 'view_audit_logs'],
    },
  },
  {
    id: '2',
    name: 'Admin',
    description: 'Manage clients, tenants, and licenses',
    isSystem: true,
    usersCount: 3,
    color: 'indigo',
    permissions: {
      clients: ['view', 'create', 'edit'],
      tenants: ['view', 'create', 'edit', 'manage_config'],
      licenses: ['view', 'create', 'edit', 'revoke', 'renew'],
      billing: ['view', 'view_revenue'],
      marketplace: ['view', 'approve_bots', 'reject_bots'],
      users: ['view', 'invite', 'edit'],
      settings: ['view'],
    },
  },
  {
    id: '3',
    name: 'Support',
    description: 'Read-only access with support capabilities',
    isSystem: true,
    usersCount: 4,
    color: 'info',
    permissions: {
      clients: ['view'],
      tenants: ['view'],
      licenses: ['view'],
      billing: ['view'],
      marketplace: ['view'],
      users: ['view'],
      settings: ['view', 'view_audit_logs'],
    },
  },
  {
    id: '4',
    name: 'Finance',
    description: 'Billing and revenue management',
    isSystem: false,
    usersCount: 1,
    color: 'warning',
    permissions: {
      clients: ['view'],
      tenants: ['view'],
      licenses: ['view'],
      billing: ['view', 'create_invoice', 'manage_subscriptions', 'view_revenue', 'export_reports'],
      marketplace: ['view'],
      users: [],
      settings: ['view'],
    },
  },
  {
    id: '5',
    name: 'Partner Manager',
    description: 'Manage marketplace and partners',
    isSystem: false,
    usersCount: 1,
    color: 'success',
    permissions: {
      clients: ['view'],
      tenants: [],
      licenses: [],
      billing: ['view'],
      marketplace: ['view', 'approve_bots', 'reject_bots', 'manage_partners', 'set_pricing'],
      users: [],
      settings: ['view'],
    },
  },
];

type Role = typeof mockRoles[0];

export default function RolesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRole, setExpandedRole] = useState<string | null>('1');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredRoles = mockRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const colorClasses: Record<string, string> = {
    brand: 'bg-brand-100 text-brand-700 border-brand-200',
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    info: 'bg-info-100 text-info-700 border-info-200',
    warning: 'bg-warning-100 text-warning-700 border-warning-200',
    success: 'bg-brand-100 text-brand-700 border-brand-200',
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Roles & Permissions</h1>
          <p className="text-zinc-500 mt-1">Define access control for Control Plane users</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Role
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <Shield className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-zinc-900">{mockRoles.length}</p>
            <p className="text-sm text-zinc-500 mt-0.5">Total Roles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Shield className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-zinc-900">{mockRoles.filter((r) => r.isSystem).length}</p>
            <p className="text-sm text-zinc-500 mt-0.5">System Roles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-lg bg-info-50 text-info-600 flex items-center justify-center">
                <Shield className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-zinc-900">{mockRoles.filter((r) => !r.isSystem).length}</p>
            <p className="text-sm text-zinc-500 mt-0.5">Custom Roles</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-zinc-900">{modules.length}</p>
            <p className="text-sm text-zinc-500 mt-0.5">Modules</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search roles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Roles List */}
      <div className="space-y-4">
        {filteredRoles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            isExpanded={expandedRole === role.id}
            onToggle={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
            colorClass={colorClasses[role.color] || colorClasses.brand}
          />
        ))}
      </div>

      {filteredRoles.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-900">No roles found</p>
            <p className="text-sm text-zinc-500 mt-1">Try adjusting your search or create a new role.</p>
          </CardContent>
        </Card>
      )}

      {/* Create Role Modal */}
      {showCreateModal && (
        <CreateRoleModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function RoleCard({
  role,
  isExpanded,
  onToggle,
  colorClass,
}: {
  role: Role;
  isExpanded: boolean;
  onToggle: () => void;
  colorClass: string;
}) {
  const totalPermissions = Object.values(role.permissions).flat().length;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
          onClick={onToggle}
        >
          <div className="flex items-center gap-4">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorClass}`}>
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-zinc-900">{role.name}</h3>
                {role.isSystem && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    System
                  </Badge>
                )}
              </div>
              <p className="text-sm text-zinc-500">{role.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-4 text-sm text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {role.usersCount} users
              </span>
              <span className="flex items-center gap-1.5">
                <Key className="h-4 w-4" />
                {totalPermissions} permissions
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!role.isSystem && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-error-500 hover:text-error-600 hover:bg-error-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-zinc-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-zinc-400" />
              )}
            </div>
          </div>
        </div>

        {/* Expanded Permissions */}
        {isExpanded && (
          <div className="border-t border-zinc-100 p-4 bg-zinc-50/50">
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
              Permissions by Module
            </h4>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => {
                const ModuleIcon = module.icon;
                const modulePermissions = role.permissions[module.id as keyof typeof role.permissions] || [];
                const hasAnyPermission = modulePermissions.length > 0;

                return (
                  <div
                    key={module.id}
                    className={`p-3 rounded-lg border ${
                      hasAnyPermission ? 'bg-white border-zinc-200' : 'bg-zinc-100/50 border-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <ModuleIcon className={`h-4 w-4 ${hasAnyPermission ? 'text-zinc-700' : 'text-zinc-400'}`} />
                      <span className={`text-sm font-medium ${hasAnyPermission ? 'text-zinc-900' : 'text-zinc-400'}`}>
                        {module.name}
                      </span>
                    </div>
                    {hasAnyPermission ? (
                      <div className="flex flex-wrap gap-1">
                        {modulePermissions.map((perm) => {
                          const permConfig = permissionLabels[perm];
                          return (
                            <span
                              key={perm}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-brand-50 text-brand-700"
                            >
                              {permConfig?.label || perm}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">No access</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateRoleModal({ onClose }: { onClose: () => void }) {
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});

  const togglePermission = (moduleId: string, permission: string) => {
    setPermissions((prev) => {
      const current = prev[moduleId] || [];
      if (current.includes(permission)) {
        return { ...prev, [moduleId]: current.filter((p) => p !== permission) };
      } else {
        return { ...prev, [moduleId]: [...current, permission] };
      }
    });
  };

  const toggleAllModulePermissions = (moduleId: string, allPermissions: string[]) => {
    setPermissions((prev) => {
      const current = prev[moduleId] || [];
      if (current.length === allPermissions.length) {
        return { ...prev, [moduleId]: [] };
      } else {
        return { ...prev, [moduleId]: [...allPermissions] };
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200">
          <h2 className="text-xl font-semibold text-zinc-900">Create New Role</h2>
          <p className="text-sm text-zinc-500 mt-1">Define a custom role with specific permissions</p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Basic Info */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role Name</label>
              <Input
                type="text"
                placeholder="e.g., Sales Manager"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Description</label>
              <Input
                type="text"
                placeholder="Brief description of this role's purpose"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Permissions */}
          <div>
            <h3 className="text-sm font-medium text-zinc-900 mb-4">Permissions</h3>
            <div className="space-y-4">
              {modules.map((module) => {
                const ModuleIcon = module.icon;
                const modulePermissions = permissions[module.id] || [];
                const allSelected = modulePermissions.length === module.permissions.length;

                return (
                  <div key={module.id} className="border border-zinc-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ModuleIcon className="h-4 w-4 text-zinc-600" />
                        <span className="font-medium text-zinc-900">{module.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleAllModulePermissions(module.id, module.permissions)}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {module.permissions.map((perm) => {
                        const isSelected = modulePermissions.includes(perm);
                        const permConfig = permissionLabels[perm];
                        const PermIcon = permConfig?.icon || Eye;

                        return (
                          <button
                            key={perm}
                            type="button"
                            onClick={() => togglePermission(module.id, perm)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                              isSelected
                                ? 'bg-brand-50 border-brand-200 text-brand-700'
                                : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                            }`}
                          >
                            <PermIcon className="h-3.5 w-3.5" />
                            {permConfig?.label || perm}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-200 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!roleName.trim()}>
            Create Role
          </Button>
        </div>
      </div>
    </div>
  );
}
