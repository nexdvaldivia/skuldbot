'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, Globe, Loader2, Plus, Search, Server } from 'lucide-react';
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
import { clientsApi, tenantsApi, type Client, type Tenant } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

type CreateTenantForm = {
  clientId: string;
  name: string;
  slug: string;
  environment: Tenant['environment'];
  deploymentType: Tenant['deploymentType'];
  region: string;
};

const statusStyles: Record<Tenant['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  provisioning: 'bg-amber-50 text-amber-700',
  suspended: 'bg-red-50 text-red-700',
  deactivated: 'bg-zinc-100 text-zinc-600',
  error: 'bg-red-50 text-red-700',
};

const envLabels: Record<Tenant['environment'], string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  qa: 'QA',
};

const deploymentLabels: Record<Tenant['deploymentType'], string> = {
  saas: 'SaaS',
  on_premise: 'On-Prem',
  hybrid: 'Hybrid',
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

function TenantsPageContent() {
  const searchParams = useSearchParams();
  const initialClientId = searchParams.get('clientId') ?? 'all';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>(initialClientId);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateTenantForm>({
    clientId: '',
    name: '',
    slug: '',
    environment: 'production',
    deploymentType: 'saas',
    region: '',
  });

  const clientsById = useMemo(() => {
    return new Map(clients.map((client) => [client.id, client]));
  }, [clients]);

  const loadTenants = async (clientId?: string) => {
    try {
      setLoading(true);
      const data = await tenantsApi.list(clientId && clientId !== 'all' ? clientId : undefined);
      setTenants(data);
    } catch (error) {
      setTenants([]);
      toast({
        variant: 'error',
        title: 'Failed to load orchestrators',
        description:
          error instanceof Error ? error.message : 'Could not fetch orchestrators from API.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const clientData = await clientsApi.list();
        setClients(clientData);
        if (!form.clientId && clientData.length > 0) {
          setForm((prev) => ({ ...prev, clientId: clientData[0].id }));
        }
      } catch (error) {
        setClients([]);
        toast({
          variant: 'error',
          title: 'Failed to load clients',
          description:
            error instanceof Error
              ? error.message
              : 'Could not fetch clients for orchestrator creation.',
        });
      }
      await loadTenants(initialClientId);
    };

    void loadInitialData();
  }, []);

  useEffect(() => {
    if (clientFilter !== initialClientId) {
      void loadTenants(clientFilter);
    }
  }, [clientFilter]);

  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      const clientName = clientsById.get(tenant.clientId)?.name ?? 'Unknown client';
      const matchesSearch =
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        clientName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
      const matchesEnv = envFilter === 'all' || tenant.environment === envFilter;
      return matchesSearch && matchesStatus && matchesEnv;
    });
  }, [clientsById, envFilter, searchQuery, statusFilter, tenants]);

  const stats = useMemo(() => {
    const active = tenants.filter((tenant) => tenant.status === 'active').length;
    const provisioning = tenants.filter((tenant) => tenant.status === 'provisioning').length;
    const suspended = tenants.filter((tenant) => tenant.status === 'suspended').length;
    const withLicense = tenants.filter((tenant) => !!tenant.activeLicenseId).length;
    return { active, provisioning, suspended, withLicense };
  }, [tenants]);

  const resetForm = () => {
    setForm((prev) => ({
      clientId: prev.clientId || clients[0]?.id || '',
      name: '',
      slug: '',
      environment: 'production',
      deploymentType: 'saas',
      region: '',
    }));
  };

  const handleCreateTenant = async () => {
    const payload = {
      clientId: form.clientId.trim(),
      name: form.name.trim(),
      slug: form.slug.trim(),
      environment: form.environment,
      deploymentType: form.deploymentType,
      region: form.region.trim() || undefined,
    };

    if (!payload.clientId || !payload.name || !payload.slug) {
      toast({
        variant: 'warning',
        title: 'Missing required fields',
        description: 'Client, name and slug are required.',
      });
      return;
    }

    try {
      setSubmitting(true);
      await tenantsApi.create(payload);
      toast({
        variant: 'success',
        title: 'Orchestrator created',
        description: `${payload.name} was created successfully.`,
      });
      setCreateOpen(false);
      resetForm();
      await loadTenants(clientFilter);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to create orchestrator',
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
          <h1 className="text-2xl font-semibold text-zinc-900">Orchestrators</h1>
          <p className="mt-1 text-zinc-500">Live orchestrator instances from Control Plane API</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Orchestrator
        </Button>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active" value={stats.active} icon={Server} color="emerald" />
        <StatCard label="Provisioning" value={stats.provisioning} icon={Server} color="amber" />
        <StatCard label="Suspended" value={stats.suspended} icon={Server} color="amber" />
        <StatCard label="With License" value={stats.withLicense} icon={Server} color="blue" />
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="text"
            placeholder="Search orchestrators..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="provisioning">Provisioning</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={envFilter} onValueChange={setEnvFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All Environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Environments</SelectItem>
            <SelectItem value="production">Production</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="development">Development</SelectItem>
            <SelectItem value="qa">QA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-5 py-12 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-500">Loading orchestrators...</p>
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Server className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-900">No orchestrators found</p>
              <p className="mt-1 text-sm text-zinc-500">
                Try adjusting filters or create a new orchestrator.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredTenants.map((tenant) => {
                const clientName = clientsById.get(tenant.clientId)?.name ?? 'Unknown client';
                return (
                  <div
                    key={tenant.id}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900">{tenant.name}</p>
                      <p className="truncate text-sm text-zinc-500">{tenant.slug}</p>
                      <p className="truncate text-sm text-zinc-500">{clientName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusStyles[tenant.status]}>{tenant.status}</Badge>
                      <Badge variant="secondary">{envLabels[tenant.environment]}</Badge>
                      <Badge variant="outline">{deploymentLabels[tenant.deploymentType]}</Badge>
                      {tenant.region && (
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                          <Globe className="h-3 w-3" />
                          {tenant.region}
                        </span>
                      )}
                      {tenant.activeLicenseId && <Badge variant="success">Licensed</Badge>}
                      {tenant.apiUrl && (
                        <a
                          href={tenant.apiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600"
                        >
                          API
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
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
            <DialogTitle>Create Orchestrator</DialogTitle>
            <DialogDescription>
              Register a new orchestrator instance for a client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Client</label>
              <Select
                value={form.clientId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, clientId: value }))}
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
                placeholder="Production"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Slug</label>
              <Input
                value={form.slug}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, slug: slugify(event.target.value) }))
                }
                placeholder="acme-prod"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Environment</label>
                <Select
                  value={form.environment}
                  onValueChange={(value: Tenant['environment']) =>
                    setForm((prev) => ({ ...prev, environment: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="qa">QA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Deployment</label>
                <Select
                  value={form.deploymentType}
                  onValueChange={(value: Tenant['deploymentType']) =>
                    setForm((prev) => ({ ...prev, deploymentType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saas">SaaS</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="on_premise">On-Premise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Region (optional)</label>
              <Input
                value={form.region}
                onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
                placeholder="us-east-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateTenant()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Orchestrator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TenantsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Loading orchestrators...</div>}>
      <TenantsPageContent />
    </Suspense>
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
