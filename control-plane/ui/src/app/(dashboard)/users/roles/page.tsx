'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { clientsApi, type Client } from '@/lib/api';
import { rbacApi, type RbacPermission, type RbacRole } from '@/services/rbac-api';
import { Key, Loader2, Plus, Search, Shield, Trash2, Users } from 'lucide-react';

const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export default function RolesPage() {
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<RbacPermission[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeType, setScopeType] = useState<'platform' | 'client'>('platform');
  const [clientId, setClientId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rolesData, permissionsData, clientsData] = await Promise.all([
        rbacApi.listRoles({ includePermissions: true, includeUserCount: true }),
        rbacApi.listPermissions(),
        clientsApi.list(),
      ]);
      setRoles(rolesData);
      setPermissions(permissionsData);
      setClients(clientsData);
    } catch (error) {
      setRoles([]);
      setPermissions([]);
      setClients([]);
      toast({
        variant: 'error',
        title: 'Failed to load roles',
        description: error instanceof Error ? error.message : 'Could not fetch RBAC data.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRoles = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return roles;
    }

    return roles.filter((role) => {
      return (
        role.name.toLowerCase().includes(normalized) ||
        role.displayName.toLowerCase().includes(normalized) ||
        role.description?.toLowerCase().includes(normalized)
      );
    });
  }, [roles, searchQuery]);

  const permissionGroups = useMemo(() => {
    const grouped = new Map<string, RbacPermission[]>();
    for (const permission of permissions) {
      const bucket = grouped.get(permission.category) ?? [];
      bucket.push(permission);
      grouped.set(permission.category, bucket);
    }

    return Array.from(grouped.entries()).map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }, [permissions]);

  const totalRoles = roles.length;
  const systemRoles = roles.filter((role) => role.isSystem).length;
  const customRoles = roles.filter((role) => !role.isSystem).length;
  const totalAssignedUsers = roles.reduce((sum, role) => sum + (role.userCount ?? 0), 0);

  const resetCreateForm = () => {
    setName('');
    setDisplayName('');
    setDescription('');
    setScopeType('platform');
    setClientId('');
    setIsDefault(false);
    setSelectedPermissionIds([]);
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId],
    );
  };

  const handleCreateRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim().toLowerCase();
    const normalizedDisplayName = displayName.trim();

    if (!normalizedName || !normalizedDisplayName) {
      toast({
        variant: 'warning',
        title: 'Missing required fields',
        description: 'Role name and display name are required.',
      });
      return;
    }

    if (!ROLE_NAME_PATTERN.test(normalizedName)) {
      toast({
        variant: 'warning',
        title: 'Invalid role name',
        description: 'Use lowercase letters, numbers and underscore, starting with a letter.',
      });
      return;
    }

    if (scopeType === 'client' && !clientId) {
      toast({
        variant: 'warning',
        title: 'Client scope requires client',
        description: 'Select a client for client-scoped roles.',
      });
      return;
    }

    if (selectedPermissionIds.length === 0) {
      toast({
        variant: 'warning',
        title: 'Permissions required',
        description: 'Select at least one permission.',
      });
      return;
    }

    try {
      setCreatePending(true);
      await rbacApi.createRole({
        name: normalizedName,
        displayName: normalizedDisplayName,
        description: description.trim() || undefined,
        scopeType,
        clientId: scopeType === 'client' ? clientId : undefined,
        permissionIds: selectedPermissionIds,
        isDefault,
      });

      toast({
        variant: 'success',
        title: 'Role created',
        description: `${normalizedDisplayName} was created successfully.`,
      });

      setCreateOpen(false);
      resetCreateForm();
      await loadData();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to create role',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setCreatePending(false);
    }
  };

  const handleDeleteRole = async (role: RbacRole) => {
    if (role.isSystem) {
      return;
    }

    if (!confirm(`Delete role ${role.displayName}?`)) {
      return;
    }

    try {
      setDeletePendingId(role.id);
      await rbacApi.deleteRole(role.id);
      toast({
        variant: 'success',
        title: 'Role deleted',
        description: `${role.displayName} was removed.`,
      });
      await loadData();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to delete role',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setDeletePendingId(null);
    }
  };

  return (
    <>
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Roles & Permissions</h1>
            <p className="text-zinc-500 mt-1">Enterprise RBAC catalog for Control Plane.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/users">
              <Button variant="outline">Manage Team Members</Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Roles" value={totalRoles} icon={Shield} color="brand" />
          <StatCard label="System Roles" value={systemRoles} icon={Shield} color="indigo" />
          <StatCard label="Custom Roles" value={customRoles} icon={Key} color="info" />
          <StatCard label="Assigned Users" value={totalAssignedUsers} icon={Users} color="zinc" />
        </div>

        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search roles..."
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-8 w-8 text-zinc-400 mx-auto mb-3 animate-spin" />
              <p className="text-sm text-zinc-500">Loading roles...</p>
            </CardContent>
          </Card>
        ) : filteredRoles.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-900">No roles found</p>
              <p className="text-sm text-zinc-500 mt-1">Try adjusting your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRoles.map((role) => (
              <Card key={role.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-zinc-900">{role.displayName}</h3>
                        <Badge variant={role.isSystem ? 'secondary' : 'default'}>
                          {role.isSystem ? 'System' : 'Custom'}
                        </Badge>
                        <Badge variant="outline">
                          {role.scopeType === 'client' ? `Client Scope` : 'Platform Scope'}
                        </Badge>
                        {role.isDefault && <Badge variant="outline">Default</Badge>}
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">{role.description || 'No description'}</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        {role.name}
                        {role.clientName ? ` • ${role.clientName}` : ''}
                        {typeof role.userCount === 'number' ? ` • ${role.userCount} users` : ''}
                      </p>
                    </div>

                    {!role.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-error-500 hover:text-error-600 hover:bg-error-50"
                        disabled={deletePendingId === role.id}
                        onClick={() => void handleDeleteRole(role)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(role.permissions ?? []).slice(0, 8).map((permission) => (
                      <Badge key={permission.id} variant="outline">
                        {permission.code}
                      </Badge>
                    ))}
                    {(role.permissions?.length ?? 0) > 8 && (
                      <Badge variant="outline">+{(role.permissions?.length ?? 0) - 8} more</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>
              Create a custom role with explicit permissions and scope.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateRole}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700" htmlFor="rbac-role-name">
                  Role Name
                </label>
                <Input
                  id="rbac-role-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="compliance_operator"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700" htmlFor="rbac-role-display-name">
                  Display Name
                </label>
                <Input
                  id="rbac-role-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Compliance Operator"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700" htmlFor="rbac-role-description">
                Description
              </label>
              <textarea
                id="rbac-role-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Describe what this role can do."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Scope Type</label>
                <Select
                  value={scopeType}
                  onValueChange={(value: 'platform' | 'client') => {
                    setScopeType(value);
                    if (value === 'platform') {
                      setClientId('');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select scope type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">Platform</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700">Client (for client scope)</label>
                <Select
                  value={clientId || undefined}
                  onValueChange={(value) => setClientId(value)}
                  disabled={scopeType !== 'client'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Set as default role
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700">Permissions</p>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 p-3 space-y-4">
                {permissionGroups.map((group) => (
                  <div key={group.category} className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">
                      {group.category}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.items.map((permission) => (
                        <label
                          key={permission.id}
                          className="flex items-start gap-2 rounded-md border border-zinc-200 p-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissionIds.includes(permission.id)}
                            onChange={() => togglePermission(permission.id)}
                            className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                          />
                          <span>
                            <span className="font-medium text-zinc-900 block">{permission.code}</span>
                            <span className="text-xs text-zinc-500">
                              {permission.description || permission.label}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={createPending}
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createPending}>
                {createPending ? 'Creating...' : 'Create Role'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: 'brand' | 'indigo' | 'info' | 'zinc';
}) {
  const colorClasses = {
    brand: 'bg-brand-50 text-brand-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    info: 'bg-info-50 text-info-600',
    zinc: 'bg-zinc-100 text-zinc-600',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`h-8 w-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-semibold text-zinc-900">{value}</p>
        <p className="text-sm text-zinc-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
