'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useRoles,
  useRolePermissions,
  useCreateRole,
  useDeleteRole,
  type Role,
} from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { Key, Loader2, Plus, Search, Shield, Trash2, Users } from 'lucide-react';

const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export default function RolesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  const { data: roles = [], isLoading } = useRoles({
    includePermissions: true,
    includeUserCount: true,
  });
  const { data: permissionGroups = [], isLoading: permissionsLoading } = useRolePermissions();
  const createRoleMutation = useCreateRole();
  const deleteRoleMutation = useDeleteRole();
  const { toast } = useToast();

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

  const totalRoles = roles.length;
  const systemRoles = roles.filter((role) => role.type === 'system').length;
  const customRoles = roles.filter((role) => role.type === 'custom').length;
  const totalAssignments = roles.reduce(
    (sum, role) => sum + (typeof role.userCount === 'number' ? role.userCount : 0),
    0,
  );

  const resetCreateForm = () => {
    setName('');
    setDisplayName('');
    setDescription('');
    setSelectedPermissionIds([]);
    setIsDefault(false);
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
        description: 'Use lowercase letters, numbers, and underscores; start with a letter.',
      });
      return;
    }

    if (selectedPermissionIds.length === 0) {
      toast({
        variant: 'warning',
        title: 'Permissions required',
        description: 'Select at least one permission for the role.',
      });
      return;
    }

    try {
      await createRoleMutation.mutateAsync({
        name: normalizedName,
        displayName: normalizedDisplayName,
        description: description.trim() || undefined,
        permissionIds: selectedPermissionIds,
        isDefault,
      });

      toast({
        variant: 'success',
        title: 'Role created',
        description: `Role ${normalizedDisplayName} was created successfully.`,
      });
      setOpenCreate(false);
      resetCreateForm();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create role',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.type === 'system') {
      return;
    }

    if (!confirm(`Delete role ${role.displayName || role.name}?`)) {
      return;
    }

    try {
      await deleteRoleMutation.mutateAsync(role.id);
      toast({
        variant: 'success',
        title: 'Role deleted',
        description: `${role.displayName || role.name} was deleted.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete role',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Roles</h1>
            <p className="text-muted-foreground">Create and manage tenant RBAC roles.</p>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Role
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Roles" value={totalRoles} icon={Shield} />
          <StatCard label="System Roles" value={systemRoles} icon={Shield} />
          <StatCard label="Custom Roles" value={customRoles} icon={Key} />
          <StatCard label="Assignments" value={totalAssignments} icon={Users} />
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search roles..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filteredRoles.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
              <p className="font-medium">No roles found</p>
              <p className="text-sm text-muted-foreground mt-1">Try another search term.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredRoles.map((role) => (
              <Card key={role.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{role.displayName || role.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {role.description || 'No description'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={role.type === 'system' ? 'secondary' : 'default'}>
                        {role.type === 'system' ? 'System' : 'Custom'}
                      </Badge>
                      {role.isDefault && <Badge variant="outline">Default</Badge>}
                      {role.type !== 'system' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => void handleDeleteRole(role)}
                          loading={deleteRoleMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{role.name}</span>
                    <span className="mx-2">•</span>
                    <span>{role.userCount ?? 0} users</span>
                    <span className="mx-2">•</span>
                    <span>{role.permissions?.length ?? 0} permissions</span>
                  </div>
                  {role.permissions && role.permissions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {role.permissions.slice(0, 8).map((permission) => (
                        <Badge key={permission.id} variant="outline">
                          {permission.displayName || permission.name}
                        </Badge>
                      ))}
                      {role.permissions.length > 8 && (
                        <Badge variant="outline">+{role.permissions.length - 8} more</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>
              Define a custom role with explicit permissions.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateRole}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="claims_operator"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase, numbers and underscore only.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-display-name">Display Name</Label>
                <Input
                  id="role-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Claims Operator"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-description">Description</Label>
              <textarea
                id="role-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Role purpose and intended scope."
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Set as default role for new invited users
            </label>

            <div className="space-y-2">
              <Label>Permissions</Label>
              {permissionsLoading ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Loading permissions...
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border p-3 space-y-4">
                  {permissionGroups.map((group) => (
                    <div key={group.category} className="space-y-2">
                      <p className="text-sm font-medium">{group.categoryDisplayName}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {group.permissions.map((permission) => (
                          <label
                            key={permission.id}
                            className="flex items-start gap-2 rounded-md border p-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPermissionIds.includes(permission.id)}
                              onChange={() => togglePermission(permission.id)}
                              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                            />
                            <span>
                              <span className="font-medium block">
                                {permission.displayName || permission.name}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {permission.description || permission.name}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenCreate(false);
                  resetCreateForm();
                }}
                disabled={createRoleMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createRoleMutation.isPending}>
                Create Role
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
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
