'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { clientsApi, usersApi, type Client, type User } from '@/lib/api';
import { rbacApi, type RbacRole } from '@/services/rbac-api';
import {
  Users,
  Search,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  UserCog,
  KeyRound,
  Briefcase,
  Shield,
  Building2,
  Loader2,
  Trash2,
  UserPlus,
} from 'lucide-react';

const roleConfig: Record<
  string,
  { variant: 'default' | 'secondary'; label: string; icon: React.ElementType }
> = {
  skuld_admin: { variant: 'default', label: 'Skuld Admin', icon: ShieldCheck },
  skuld_support: { variant: 'secondary', label: 'Skuld Support', icon: UserCog },
  client_admin: { variant: 'secondary', label: 'Client Admin', icon: Building2 },
  client_user: { variant: 'secondary', label: 'Client User', icon: Users },
};

const statusConfig: Record<
  string,
  {
    variant: 'success' | 'warning' | 'destructive' | 'secondary';
    icon: React.ElementType;
    label: string;
  }
> = {
  active: { variant: 'success', icon: CheckCircle2, label: 'Active' },
  pending: { variant: 'warning', icon: Clock, label: 'Pending' },
  suspended: { variant: 'destructive', icon: XCircle, label: 'Suspended' },
  deactivated: { variant: 'secondary', icon: XCircle, label: 'Deactivated' },
};

type CreateUserForm = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: User['role'];
  clientId: string;
};

const initialCreateForm: CreateUserForm = {
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  role: 'client_user',
  clientId: '',
};

function isClientRole(role: string) {
  return role === 'client_admin' || role === 'client_user';
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [assignPending, setAssignPending] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [availableRoles, setAvailableRoles] = useState<RbacRole[]>([]);
  const [assignUser, setAssignUser] = useState<User | null>(null);
  const [assignRoleIds, setAssignRoleIds] = useState<string[]>([]);
  const [form, setForm] = useState<CreateUserForm>(initialCreateForm);
  const [rbacRoleId, setRbacRoleId] = useState('');

  const loadUsersAndClients = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, clientsData, rolesData] = await Promise.all([
        usersApi.list(),
        clientsApi.list(),
        rbacApi.listRoles({ includePermissions: false }),
      ]);
      setUsers(usersData);
      setClients(clientsData);
      setAvailableRoles(rolesData);
    } catch (error) {
      setUsers([]);
      setClients([]);
      setAvailableRoles([]);
      toast({
        variant: 'error',
        title: 'Failed to load data',
        description:
          error instanceof Error ? error.message : 'Could not fetch users, clients and roles.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsersAndClients();
  }, [loadUsersAndClients]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const scopeName = user.clientName || 'Skuld';
      const matchesSearch =
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        scopeName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [roleFilter, searchQuery, statusFilter, users]);

  const formatLastLogin = (date: string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 24) {
      return diffHours === 0 ? 'Just now' : `${diffHours}h ago`;
    }
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const resetCreateForm = () => {
    setForm(initialCreateForm);
    setRbacRoleId('');
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedFirst = form.firstName.trim();
    const normalizedLast = form.lastName.trim();
    const normalizedPassword = form.password.trim();

    if (!normalizedEmail || !normalizedFirst || !normalizedLast || !form.role) {
      toast({
        variant: 'warning',
        title: 'Missing required fields',
        description: 'Email, first name, last name and role are required.',
      });
      return;
    }

    if (isClientRole(form.role) && !form.clientId) {
      toast({
        variant: 'warning',
        title: 'Client scope required',
        description: 'Select a client for client-scoped roles.',
      });
      return;
    }

    try {
      setCreatePending(true);
      await usersApi.create({
        email: normalizedEmail,
        firstName: normalizedFirst,
        lastName: normalizedLast,
        role: form.role,
        password: normalizedPassword || undefined,
        clientId: isClientRole(form.role) ? form.clientId : undefined,
        roleIds: rbacRoleId ? [rbacRoleId] : undefined,
      });

      toast({
        variant: 'success',
        title: 'User created',
        description: `${normalizedEmail} was created successfully.`,
      });

      setCreateOpen(false);
      resetCreateForm();
      await loadUsersAndClients();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to create user',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setCreatePending(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      setActionPendingId(user.id);
      if (user.status === 'active') {
        await usersApi.suspend(user.id);
      } else {
        await usersApi.activate(user.id);
      }

      toast({
        variant: 'success',
        title: 'User updated',
        description:
          user.status === 'active'
            ? `${user.email} is now suspended.`
            : `${user.email} is now active.`,
      });
      await loadUsersAndClients();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to update user',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setActionPendingId(null);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Delete user ${user.email}?`)) {
      return;
    }

    try {
      setActionPendingId(user.id);
      await usersApi.delete(user.id);
      toast({
        variant: 'success',
        title: 'User deleted',
        description: `${user.email} was removed.`,
      });
      await loadUsersAndClients();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to delete user',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setActionPendingId(null);
    }
  };

  const handleOpenAssignRoles = (user: User) => {
    setAssignUser(user);
    setAssignRoleIds((user.roles ?? []).map((role) => role.id));
    setAssignOpen(true);
  };

  const toggleAssignRole = (roleId: string) => {
    setAssignRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const handleAssignRoles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignUser) {
      return;
    }

    try {
      setAssignPending(true);
      await rbacApi.assignUserRoles(assignUser.id, assignRoleIds);
      toast({
        variant: 'success',
        title: 'Roles updated',
        description: `RBAC roles updated for ${assignUser.email}.`,
      });
      setAssignOpen(false);
      setAssignUser(null);
      setAssignRoleIds([]);
      await loadUsersAndClients();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to update roles',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setAssignPending(false);
    }
  };

  const activeCount = users.filter((u) => u.status === 'active').length;
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const adminCount = users.filter((u) => u.role === 'skuld_admin').length;
  const supportCount = users.filter((u) => u.role === 'skuld_support').length;

  return (
    <>
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Team Members</h1>
            <p className="text-zinc-500 mt-1">Manage users from the Control Plane identity store</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/users/roles">
              <Button variant="outline">
                <Shield className="h-4 w-4 mr-2" />
                Roles & Permissions
              </Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Create Team Member
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active Users" value={activeCount} icon={Users} color="brand" />
          <StatCard
            label="Pending Invites"
            value={pendingCount}
            icon={Mail}
            color="warning"
            highlight={pendingCount > 0}
          />
          <StatCard label="Skuld Admins" value={adminCount} icon={ShieldCheck} color="brand" />
          <StatCard label="Skuld Support" value={supportCount} icon={UserCog} color="info" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="skuld_admin">Skuld Admin</SelectItem>
              <SelectItem value="skuld_support">Skuld Support</SelectItem>
              <SelectItem value="client_admin">Client Admin</SelectItem>
              <SelectItem value="client_user">Client User</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 text-xs font-medium text-zinc-500 uppercase tracking-wide">
              <div className="col-span-4">User</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-2">Scope</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Last Login</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {loading ? (
              <div className="px-5 py-12 text-center">
                <Loader2 className="h-8 w-8 text-zinc-400 mx-auto mb-3 animate-spin" />
                <p className="text-sm text-zinc-500">Loading users...</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {filteredUsers.map((user) => {
                  const status = statusConfig[user.status] || statusConfig.deactivated;
                  const StatusIcon = status.icon;
                  const role = roleConfig[user.role] || roleConfig.client_user;
                  const RoleIcon = role.icon;
                  const scopeName = user.clientName || 'Skuld';
                  const pendingAction = actionPendingId === user.id;

                  return (
                    <div key={user.id} className="hover:bg-zinc-50 transition-colors">
                      <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-4 items-center">
                        <div className="col-span-4 flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-linear-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-medium text-sm shrink-0">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-900">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-sm text-zinc-500 truncate flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <Badge variant={role.variant} className="gap-1">
                            <RoleIcon className="h-3 w-3" />
                            {role.label}
                          </Badge>
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-zinc-400" />
                            <span className="text-sm text-zinc-600">{scopeName}</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={status.variant} className="gap-1">
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </Badge>
                            {user.mfaEnabled && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-brand-200 bg-brand-50 text-brand-700"
                              >
                                <KeyRound className="h-3 w-3" />
                                MFA
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="col-span-1">
                          <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                            <Clock className="h-3.5 w-3.5 text-zinc-400" />
                            {formatLastLogin(user.lastLoginAt)}
                          </div>
                        </div>
                        <div className="col-span-1">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingAction}
                              onClick={() => void handleToggleStatus(user)}
                            >
                              {user.status === 'active' ? 'Suspend' : 'Activate'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingAction}
                              onClick={() => handleOpenAssignRoles(user)}
                            >
                              Roles
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-error-500 hover:text-error-600 hover:bg-error-50"
                              disabled={pendingAction}
                              onClick={() => void handleDeleteUser(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="lg:hidden p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-linear-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-medium text-sm">
                              {user.firstName[0]}
                              {user.lastName[0]}
                            </div>
                            <div>
                              <p className="font-medium text-zinc-900">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-sm text-zinc-500">{user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingAction}
                              onClick={() => void handleToggleStatus(user)}
                            >
                              {user.status === 'active' ? 'Suspend' : 'Activate'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingAction}
                              onClick={() => handleOpenAssignRoles(user)}
                            >
                              Roles
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-error-500 hover:text-error-600 hover:bg-error-50"
                              disabled={pendingAction}
                              onClick={() => void handleDeleteUser(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={role.variant} className="gap-1">
                              <RoleIcon className="h-3 w-3" />
                              {role.label}
                            </Badge>
                            <Badge variant={status.variant} className="gap-1">
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </Badge>
                            {user.mfaEnabled && <KeyRound className="h-3.5 w-3.5 text-brand-600" />}
                          </div>
                          <span className="text-xs text-zinc-500">
                            {formatLastLogin(user.lastLoginAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 text-sm text-zinc-500">
                          <Briefcase className="h-3.5 w-3.5" />
                          {scopeName}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && filteredUsers.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-900">No users found</p>
                <p className="text-sm text-zinc-500 mt-1">Try adjusting your filters.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team Member</DialogTitle>
            <DialogDescription>
              Create a user directly in the Control Plane identity store.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateUser}>
            <div className="space-y-1.5">
              <label htmlFor="cp-user-email" className="text-sm font-medium text-zinc-700">
                Email
              </label>
              <Input
                id="cp-user-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="user@company.com"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="cp-user-first-name" className="text-sm font-medium text-zinc-700">
                  First Name
                </label>
                <Input
                  id="cp-user-first-name"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cp-user-last-name" className="text-sm font-medium text-zinc-700">
                  Last Name
                </label>
                <Input
                  id="cp-user-last-name"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cp-user-role" className="text-sm font-medium text-zinc-700">
                Role
              </label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    role: value as User['role'],
                    clientId: isClientRole(value) ? prev.clientId : '',
                  }))
                }
              >
                <SelectTrigger id="cp-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skuld_admin">Skuld Admin</SelectItem>
                  <SelectItem value="skuld_support">Skuld Support</SelectItem>
                  <SelectItem value="client_admin">Client Admin</SelectItem>
                  <SelectItem value="client_user">Client User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cp-user-rbac-role" className="text-sm font-medium text-zinc-700">
                RBAC Role (optional)
              </label>
              <Select value={rbacRoleId || undefined} onValueChange={setRbacRoleId}>
                <SelectTrigger id="cp-user-rbac-role">
                  <SelectValue placeholder="Select RBAC role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isClientRole(form.role) && (
              <div className="space-y-1.5">
                <label htmlFor="cp-user-client" className="text-sm font-medium text-zinc-700">
                  Client
                </label>
                <Select
                  value={form.clientId || undefined}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, clientId: value }))}
                >
                  <SelectTrigger id="cp-user-client">
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
            )}

            <div className="space-y-1.5">
              <label htmlFor="cp-user-password" className="text-sm font-medium text-zinc-700">
                Password (optional)
              </label>
              <Input
                id="cp-user-password"
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Leave empty to keep user pending"
              />
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
                {createPending ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign RBAC Roles</DialogTitle>
            <DialogDescription>
              Update role assignments for {assignUser?.email ?? 'user'}.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleAssignRoles}>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 p-3 space-y-2">
              {availableRoles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-start gap-2 rounded-md border border-zinc-200 p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={assignRoleIds.includes(role.id)}
                    onChange={() => toggleAssignRole(role.id)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                  />
                  <span>
                    <span className="font-medium text-zinc-900 block">{role.displayName}</span>
                    <span className="text-xs text-zinc-500">
                      {role.name}{' '}
                      {role.scopeType === 'client' ? '• client scope' : '• platform scope'}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={assignPending}
                onClick={() => {
                  setAssignOpen(false);
                  setAssignUser(null);
                  setAssignRoleIds([]);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={assignPending}>
                {assignPending ? 'Saving...' : 'Save Roles'}
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
  highlight = false,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: 'brand' | 'info' | 'warning';
  highlight?: boolean;
}) {
  const colorClasses = {
    brand: 'bg-brand-50 text-brand-600',
    info: 'bg-info-50 text-info-600',
    warning: 'bg-warning-50 text-warning-600',
  };

  return (
    <Card className={highlight ? 'border-warning-200 bg-warning-50/30' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`h-8 w-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className={`text-2xl font-semibold ${highlight ? 'text-warning-700' : 'text-zinc-900'}`}>
          {value}
        </p>
        <p className="text-sm text-zinc-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
