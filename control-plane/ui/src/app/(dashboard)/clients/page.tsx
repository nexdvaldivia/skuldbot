'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Clock, Loader2, Plus, Search, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { clientsApi, type Client } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

type CreateClientForm = {
  name: string;
  slug: string;
  billingEmail: string;
  plan: 'starter' | 'professional' | 'enterprise';
};

const planLabels: Record<Client['plan'], string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

const statusStyles: Record<Client['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  suspended: 'bg-red-50 text-red-700',
  canceled: 'bg-zinc-100 text-zinc-600',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateClientForm>({
    name: '',
    slug: '',
    billingEmail: '',
    plan: 'starter',
  });

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await clientsApi.list();
      setClients(data);
    } catch (error) {
      setClients([]);
      toast({
        variant: 'error',
        title: 'Failed to load clients',
        description: error instanceof Error ? error.message : 'Could not fetch clients from API.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClients();
  }, []);

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesSearch =
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.billingEmail.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [clients, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const active = clients.filter((client) => client.status === 'active').length;
    const pending = clients.filter((client) => client.status === 'pending').length;
    const suspended = clients.filter((client) => client.status === 'suspended').length;
    const orchestrators = clients.reduce((sum, client) => sum + client.tenantsCount, 0);
    return { active, pending, suspended, orchestrators };
  }, [clients]);

  const resetForm = () => {
    setForm({
      name: '',
      slug: '',
      billingEmail: '',
      plan: 'starter',
    });
  };

  const handleCreateClient = async () => {
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      billingEmail: form.billingEmail.trim(),
      plan: form.plan,
    };

    if (!payload.name || !payload.slug || !payload.billingEmail) {
      toast({
        variant: 'warning',
        title: 'Missing required fields',
        description: 'Name, slug and billing email are required.',
      });
      return;
    }

    try {
      setSubmitting(true);
      await clientsApi.create(payload);
      toast({
        variant: 'success',
        title: 'Client created',
        description: `${payload.name} was created successfully.`,
      });
      setCreateOpen(false);
      resetForm();
      await loadClients();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to create client',
        description: error instanceof Error ? error.message : 'Create request failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Clients</h1>
          <p className="mt-1 text-zinc-500">Live clients from Control Plane API</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Client
        </Button>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active Clients" value={stats.active} icon={Building2} color="emerald" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="amber" />
        <StatCard label="Suspended" value={stats.suspended} icon={Clock} color="amber" />
        <StatCard label="Orchestrators" value={stats.orchestrators} icon={Server} color="blue" />
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-5 py-12 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-500">Loading clients...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Building2 className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-900">No clients found</p>
              <p className="mt-1 text-sm text-zinc-500">Try adjusting filters or create a new client.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{client.name}</p>
                    <p className="truncate text-sm text-zinc-500">{client.slug}</p>
                    <p className="truncate text-sm text-zinc-500">{client.billingEmail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusStyles[client.status]}>{client.status}</Badge>
                    <Badge variant="secondary">{planLabels[client.plan]}</Badge>
                    <Badge variant="outline">{client.tenantsCount} orch</Badge>
                    <Link href={`/tenants?clientId=${client.id}`} className="text-sm font-medium text-indigo-600">
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Client</DialogTitle>
            <DialogDescription>
              Add a new enterprise client in Control Plane.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Name</label>
              <Input
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name,
                    slug: prev.slug ? prev.slug : slugify(name),
                  }));
                }}
                placeholder="Acme Corporation"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Slug</label>
              <Input
                value={form.slug}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))
                }
                placeholder="acme-corporation"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Billing Email</label>
              <Input
                type="email"
                value={form.billingEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, billingEmail: event.target.value }))}
                placeholder="billing@acme.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Plan</label>
              <Select
                value={form.plan}
                onValueChange={(value: 'starter' | 'professional' | 'enterprise') =>
                  setForm((prev) => ({ ...prev, plan: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateClient()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: 'emerald' | 'blue' | 'amber';
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors[color]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-semibold text-zinc-900">{value}</p>
        <p className="mt-0.5 text-sm text-zinc-500">{label}</p>
      </CardContent>
    </Card>
  );
}
