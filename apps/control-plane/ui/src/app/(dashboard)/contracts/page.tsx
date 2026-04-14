'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSignature,
  Download,
  Eye,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { StatCard } from '@/components/ui/stat-card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

// Types - will be replaced with API types when backend is ready
type ContractStatus =
  | 'draft'
  | 'pending_signature'
  | 'signed'
  | 'executed'
  | 'expired'
  | 'cancelled';

type Contract = {
  id: string;
  contractNumber: string;
  type: string;
  clientName: string;
  clientId: string;
  status: ContractStatus;
  version: string;
  createdAt: string;
  expiresAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
};

const statusConfig: Record<
  ContractStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive' | 'info';
  }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending_signature: { label: 'Pending Signature', variant: 'warning' },
  signed: { label: 'Signed', variant: 'info' },
  executed: { label: 'Executed', variant: 'success' },
  expired: { label: 'Expired', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const contractTypes = [
  { value: 'all', label: 'All Types' },
  { value: 'msa', label: 'Master Service Agreement' },
  { value: 'tos', label: 'Terms of Service' },
  { value: 'dpa', label: 'Data Processing Agreement' },
  { value: 'sla', label: 'Service Level Agreement' },
  { value: 'baa', label: 'Business Associate Agreement' },
  { value: 'nda', label: 'Non-Disclosure Agreement' },
];

export default function ContractsPage() {
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadContracts = useCallback(async () => {
    try {
      setLoading(true);
      // TODO: Replace with contractsApi.list() when backend is ready
      setContracts([]);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to load contracts',
        description: error instanceof Error ? error.message : 'Unexpected error.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const filtered = contracts.filter((c) => {
    if (
      search &&
      !c.clientName.toLowerCase().includes(search.toLowerCase()) &&
      !c.contractNumber.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    return true;
  });

  const stats = {
    total: contracts.length,
    pendingSignature: contracts.filter((c) => c.status === 'pending_signature').length,
    executed: contracts.filter((c) => c.status === 'executed').length,
    expiringSoon: contracts.filter((c) => {
      if (!c.expiresAt) return false;
      const daysLeft = (new Date(c.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysLeft > 0 && daysLeft <= 30;
    }).length,
  };

  if (loading) {
    return <LoadingSpinner label="Loading contracts..." />;
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      <PageHeader
        icon={FileText}
        title="Contracts"
        description="Manage client agreements, signatures, and compliance documents"
        action={
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Contract
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 mb-6">
        <StatCard label="Total Contracts" value={stats.total} icon={FileText} />
        <StatCard label="Pending Signature" value={stats.pendingSignature} icon={Clock} />
        <StatCard label="Executed" value={stats.executed} icon={CheckCircle2} />
        <StatCard
          label="Expiring Soon"
          value={stats.expiringSoon}
          icon={AlertCircle}
          className={stats.expiringSoon > 0 ? 'border-amber-200 bg-amber-50/30' : undefined}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <SearchInput
          placeholder="Search by client or contract number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="flex-1"
        />
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-3.5 h-3.5 mr-2 text-zinc-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_signature">Pending Signature</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="executed">Executed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {contractTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No contracts found"
          description={
            contracts.length === 0
              ? 'Create your first contract to get started with client agreements.'
              : 'No contracts match your current filters. Try adjusting your search.'
          }
          action={
            contracts.length === 0 ? (
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Contract
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {filtered.map((contract) => {
              const status = statusConfig[contract.status];
              return (
                <div
                  key={contract.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-zinc-900">
                        {contract.contractNumber}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>{contract.clientName}</span>
                      <span className="text-zinc-300">|</span>
                      <span>
                        {contractTypes.find((t) => t.value === contract.type)?.label ||
                          contract.type}
                      </span>
                      <span className="text-zinc-300">|</span>
                      <span>v{contract.version}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
