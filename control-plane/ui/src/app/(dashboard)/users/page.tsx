'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Plus,
  Search,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  ShieldCheck,
  UserCog,
  KeyRound,
  Briefcase,
  Shield,
} from 'lucide-react';

// Mock data - Control Plane users are all internal Skuld team members
const mockUsers = [
  {
    id: '1',
    email: 'admin@skuld.com',
    firstName: 'Carlos',
    lastName: 'Mendez',
    role: 'skuld_admin',
    status: 'active',
    department: 'Engineering',
    lastLoginAt: '2024-03-15T10:30:00Z',
    mfaEnabled: true,
    createdAt: '2023-06-01',
  },
  {
    id: '2',
    email: 'maria@skuld.com',
    firstName: 'Maria',
    lastName: 'Rodriguez',
    role: 'skuld_admin',
    status: 'active',
    department: 'Operations',
    lastLoginAt: '2024-03-15T09:15:00Z',
    mfaEnabled: true,
    createdAt: '2023-07-15',
  },
  {
    id: '3',
    email: 'support@skuld.com',
    firstName: 'Ana',
    lastName: 'Garcia',
    role: 'skuld_support',
    status: 'active',
    department: 'Customer Success',
    lastLoginAt: '2024-03-14T15:45:00Z',
    mfaEnabled: true,
    createdAt: '2023-08-15',
  },
  {
    id: '4',
    email: 'jose@skuld.com',
    firstName: 'Jose',
    lastName: 'Martinez',
    role: 'skuld_support',
    status: 'active',
    department: 'Customer Success',
    lastLoginAt: '2024-03-14T11:20:00Z',
    mfaEnabled: true,
    createdAt: '2023-09-01',
  },
  {
    id: '5',
    email: 'laura@skuld.com',
    firstName: 'Laura',
    lastName: 'Sanchez',
    role: 'skuld_support',
    status: 'pending',
    department: 'Customer Success',
    lastLoginAt: null,
    mfaEnabled: false,
    createdAt: '2024-03-10',
  },
  {
    id: '6',
    email: 'diego@skuld.com',
    firstName: 'Diego',
    lastName: 'Lopez',
    role: 'skuld_admin',
    status: 'active',
    department: 'Engineering',
    lastLoginAt: '2024-03-13T16:30:00Z',
    mfaEnabled: true,
    createdAt: '2023-11-10',
  },
];

const roleConfig: Record<string, { variant: 'default' | 'secondary'; label: string; icon: React.ElementType }> = {
  skuld_admin: { variant: 'default', label: 'Admin', icon: ShieldCheck },
  skuld_support: { variant: 'secondary', label: 'Support', icon: UserCog },
};

const statusConfig: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'secondary'; icon: React.ElementType; label: string }> = {
  active: { variant: 'success', icon: CheckCircle2, label: 'Active' },
  pending: { variant: 'warning', icon: Clock, label: 'Pending' },
  suspended: { variant: 'destructive', icon: XCircle, label: 'Suspended' },
  deactivated: { variant: 'secondary', icon: XCircle, label: 'Deactivated' },
};

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const filteredUsers = mockUsers.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const formatLastLogin = (date: string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 24) {
      return diffHours === 0 ? 'Just now' : `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const activeCount = mockUsers.filter((u) => u.status === 'active').length;
  const pendingCount = mockUsers.filter((u) => u.status === 'pending').length;
  const adminCount = mockUsers.filter((u) => u.role === 'skuld_admin').length;
  const supportCount = mockUsers.filter((u) => u.role === 'skuld_support').length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Team Members</h1>
          <p className="text-zinc-500 mt-1">Manage Skuld internal users</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/users/roles">
            <Button variant="outline">
              <Shield className="h-4 w-4 mr-2" />
              Roles & Permissions
            </Button>
          </Link>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Invite Team Member
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Users" value={activeCount} icon={Users} color="brand" />
        <StatCard label="Pending Invites" value={pendingCount} icon={Mail} color="warning" highlight={pendingCount > 0} />
        <StatCard label="Admins" value={adminCount} icon={ShieldCheck} color="brand" />
        <StatCard label="Support" value={supportCount} icon={UserCog} color="info" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search team members..."
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
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="skuld_admin">Admin</SelectItem>
            <SelectItem value="skuld_support">Support</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {/* Desktop Header */}
          <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 text-xs font-medium text-zinc-500 uppercase tracking-wide">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Department</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1">Last Login</div>
            <div className="col-span-1"></div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-zinc-100">
            {filteredUsers.map((user) => {
              const status = statusConfig[user.status];
              const StatusIcon = status.icon;
              const role = roleConfig[user.role];
              const RoleIcon = role.icon;

              return (
                <div key={user.id} className="hover:bg-zinc-50 transition-colors">
                  {/* Desktop Row */}
                  <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-4 items-center">
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-linear-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-medium text-sm shrink-0">
                        {user.firstName[0]}{user.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900">{user.firstName} {user.lastName}</p>
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
                        <span className="text-sm text-zinc-600">{user.department}</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                        {user.mfaEnabled && (
                          <Badge variant="outline" className="gap-1 border-brand-200 bg-brand-50 text-brand-700">
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
                    <div className="col-span-1 flex items-center justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Mobile Card */}
                  <div className="lg:hidden p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-linear-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-medium text-sm">
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">{user.firstName} {user.lastName}</p>
                          <p className="text-sm text-zinc-500">{user.email}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
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
                        {user.mfaEnabled && (
                          <KeyRound className="h-3.5 w-3.5 text-brand-600" />
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">{formatLastLogin(user.lastLoginAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-sm text-zinc-500">
                      <Briefcase className="h-3.5 w-3.5" />
                      {user.department}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredUsers.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-900">No team members found</p>
              <p className="text-sm text-zinc-500 mt-1">Try adjusting your filters or invite a new team member.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
          <div className={`h-8 w-8 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className={`text-2xl font-semibold ${highlight ? 'text-warning-700' : 'text-zinc-900'}`}>{value}</p>
        <p className="text-sm text-zinc-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
