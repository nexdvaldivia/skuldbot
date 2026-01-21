'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users,
  Plus,
  Search,
  Mail,
  Shield,
  MoreHorizontal,
  UserCheck,
  UserX,
  Clock,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'suspended' | 'pending_verification' | 'locked';
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

const statusConfig = {
  active: { label: 'Active', variant: 'success' as const, icon: UserCheck },
  suspended: { label: 'Suspended', variant: 'destructive' as const, icon: UserX },
  pending_verification: { label: 'Pending', variant: 'warning' as const, icon: Clock },
  locked: { label: 'Locked', variant: 'secondary' as const, icon: UserX },
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // TODO: Fetch users from API
    // For now, show empty state
    setLoading(false);
  }, []);

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage users and their permissions</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Users List */}
      {loading ? (
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
              <Button>
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
            <CardDescription>{filteredUsers.length} users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {filteredUsers.map((user) => {
                const status = statusConfig[user.status];
                const StatusIcon = status.icon;
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between py-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {user.firstName[0]}{user.lastName[0]}
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
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{user.roles.join(', ')}</span>
                      </div>
                      <Badge variant={status.variant}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Edit User</DropdownMenuItem>
                          <DropdownMenuItem>Reset Password</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            Suspend User
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
  );
}
