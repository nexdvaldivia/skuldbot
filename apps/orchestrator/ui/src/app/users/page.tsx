'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/badge';
import {
  Users,
  Plus,
  Search,
  Mail,
  Shield,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useUsers,
  useRoles,
  useInviteUser,
  useUpdateUserStatus,
  useDeleteUser,
  useResendInvite,
  type OrchestratorUser,
} from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openInvite, setOpenInvite] = useState(false);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [message, setMessage] = useState('');

  const { data: usersResponse, isLoading } = useUsers({
    page: 1,
    limit: 100,
    search: searchQuery.trim() || undefined,
  });
  const { data: roles } = useRoles();

  const inviteMutation = useInviteUser();
  const updateStatusMutation = useUpdateUserStatus();
  const deleteMutation = useDeleteUser();
  const resendInviteMutation = useResendInvite();

  const { toast } = useToast();

  const users = usersResponse?.users ?? [];

  const filteredUsers = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return users;
    }

    return users.filter((user) => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      return (
        user.email.toLowerCase().includes(normalized) ||
        fullName.includes(normalized)
      );
    });
  }, [users, searchQuery]);

  const resetInviteForm = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setRoleId('');
    setMessage('');
  };

  const handleInviteUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();

    if (!normalizedEmail || !normalizedFirstName || !normalizedLastName || !roleId) {
      toast({
        variant: 'warning',
        title: 'Missing required fields',
        description: 'Email, name and role are required.',
      });
      return;
    }

    try {
      await inviteMutation.mutateAsync({
        email: normalizedEmail,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        roleIds: [roleId],
        message: message.trim() || undefined,
      });

      toast({
        variant: 'success',
        title: 'Invitation sent',
        description: `Invitation created for ${normalizedEmail}.`,
      });

      setOpenInvite(false);
      resetInviteForm();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to invite user',
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleToggleStatus = async (user: OrchestratorUser) => {
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';

    try {
      await updateStatusMutation.mutateAsync({
        id: user.id,
        status: nextStatus,
      });

      toast({
        variant: 'success',
        title: 'User updated',
        description: `${user.email} is now ${nextStatus}.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to update user',
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleResendInvite = async (user: OrchestratorUser) => {
    try {
      await resendInviteMutation.mutateAsync(user.id);
      toast({
        variant: 'success',
        title: 'Invitation resent',
        description: `Invitation resent to ${user.email}.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to resend invitation',
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleDeleteUser = async (user: OrchestratorUser) => {
    if (!confirm(`Delete user ${user.email}?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(user.id);
      toast({
        variant: 'success',
        title: 'User deleted',
        description: `${user.email} has been deleted.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete user',
        description:
          error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-muted-foreground">Manage users and their permissions</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/users/roles">
              <Button variant="outline">Roles</Button>
            </Link>
            <Button onClick={() => setOpenInvite(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            </CardContent>
          </Card>
        ) : filteredUsers.length === 0 ? (
          <Card>
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No users yet</h3>
                <p className="text-muted-foreground mb-4 max-w-sm">
                  Invite team members to collaborate on your RPA bots and workflows.
                </p>
                <Button onClick={() => setOpenInvite(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Invite User
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>{usersResponse?.total ?? filteredUsers.length} users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {filteredUsers.map((user) => {
                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between py-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">
                            {user.firstName} {user.lastName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 max-w-72">
                          <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">
                            {user.roles.length > 0
                              ? user.roles.map((role) => role.displayName || role.name).join(', ')
                              : 'No roles'}
                          </span>
                        </div>

                        <StatusBadge status={user.status} />

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                              {user.status === 'suspended' ? 'Activate User' : 'Suspend User'}
                            </DropdownMenuItem>
                            {user.status === 'pending_verification' && (
                              <DropdownMenuItem onClick={() => handleResendInvite(user)}>
                                Resend Invitation
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteUser(user)}
                            >
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={openInvite} onOpenChange={setOpenInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an invitation to a new team member.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleInviteUser}>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@company.com"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-first-name">First Name</Label>
                <Input
                  id="invite-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last-name">Last Name</Label>
                <Input
                  id="invite-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select role</option>
                {roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.displayName || role.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-message">Message (optional)</Label>
              <textarea
                id="invite-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                maxLength={500}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Optional invitation message"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenInvite(false);
                  resetInviteForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={inviteMutation.isPending}>
                Send Invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
