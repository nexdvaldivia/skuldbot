'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  FileSignature,
  Download,
  Eye,
  Filter,
  Send,
  XCircle,
  FilePen,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  contractsApi,
  clientsApi,
  type Contract,
  type ContractStatus,
  type CreateContractInput,
  type Client,
} from '@/lib/api';

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
  declined: { label: 'Declined', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  expired: { label: 'Expired', variant: 'secondary' },
};

const contractTypes = [
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
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientId: '',
    title: '',
    templateKey: 'msa',
  });
  const [createSigners, setCreateSigners] = useState<
    { email: string; fullName: string; roleLabel: string }[]
  >([{ email: '', fullName: '', roleLabel: 'Authorized Signer' }]);

  // Submit dialog
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitContractId, setSubmitContractId] = useState('');
  const [submitProvider, setSubmitProvider] = useState('internal');

  // Cancel dialog
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelContractId, setCancelContractId] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // PDF generation
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [contractsResult, clientsResult] = await Promise.allSettled([
        contractsApi.list(),
        clientsApi.list(),
      ]);

      if (contractsResult.status === 'fulfilled') {
        setContracts(contractsResult.value);
      } else {
        toast({
          variant: 'error',
          title: 'Failed to load contracts',
          description: String(contractsResult.reason),
        });
      }

      if (clientsResult.status === 'fulfilled') {
        setClients(clientsResult.value);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of clients) {
      map.set(client.id, client.name);
    }
    return map;
  }, [clients]);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const clientName = clientNameMap.get(c.clientId) || '';
        if (
          !c.title.toLowerCase().includes(q) &&
          !clientName.toLowerCase().includes(q) &&
          !c.templateKey.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (typeFilter !== 'all' && c.templateKey !== typeFilter) return false;
      return true;
    });
  }, [contracts, search, statusFilter, typeFilter, clientNameMap]);

  const stats = useMemo(
    () => ({
      total: contracts.length,
      pendingSignature: contracts.filter((c) => c.status === 'pending_signature').length,
      signed: contracts.filter((c) => c.status === 'signed').length,
      draft: contracts.filter((c) => c.status === 'draft').length,
    }),
    [contracts],
  );

  const handleCreate = async () => {
    if (!createForm.clientId || !createForm.title) {
      toast({
        variant: 'error',
        title: 'Missing fields',
        description: 'Select a client and enter a title.',
      });
      return;
    }
    const validSigners = createSigners.filter((s) => s.email.trim() && s.fullName.trim());
    if (validSigners.length === 0) {
      toast({
        variant: 'error',
        title: 'Missing signers',
        description: 'Add at least one signer.',
      });
      return;
    }

    try {
      setCreating(true);
      const input: CreateContractInput = {
        clientId: createForm.clientId,
        title: createForm.title,
        templateKey: createForm.templateKey,
        signers: validSigners.map((s) => ({
          email: s.email.trim().toLowerCase(),
          fullName: s.fullName.trim(),
          roleLabel: s.roleLabel.trim() || 'Authorized Signer',
        })),
      };
      await contractsApi.create(input);
      toast({ variant: 'success', title: 'Contract created' });
      setCreateOpen(false);
      setCreateForm({ clientId: '', title: '', templateKey: 'msa' });
      setCreateSigners([{ email: '', fullName: '', roleLabel: 'Authorized Signer' }]);
      await loadData();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to create contract',
        description: error instanceof Error ? error.message : 'Unexpected error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await contractsApi.submit(submitContractId, submitProvider);
      toast({ variant: 'success', title: 'Contract submitted for signature' });
      setSubmitOpen(false);
      await loadData();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to submit',
        description: error instanceof Error ? error.message : 'Unexpected error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast({ variant: 'error', title: 'Reason required' });
      return;
    }
    try {
      setCancelling(true);
      await contractsApi.cancel(cancelContractId, cancelReason);
      toast({ variant: 'success', title: 'Contract cancelled' });
      setCancelOpen(false);
      setCancelReason('');
      await loadData();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to cancel',
        description: error instanceof Error ? error.message : 'Unexpected error',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleGeneratePdf = async (contractId: string) => {
    try {
      setGeneratingPdf(contractId);
      await contractsApi.generatePdf(contractId);
      toast({ variant: 'success', title: 'PDF generated' });
      await loadData();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to generate PDF',
        description: error instanceof Error ? error.message : 'Unexpected error',
      });
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handleDownloadPdf = async (contractId: string, title: string) => {
    try {
      const blob = await contractsApi.downloadPdf(contractId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to download PDF',
        description: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Contracts</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Manage client agreements, signatures, and compliance documents
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Contract
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total, icon: FileText },
          { label: 'Drafts', value: stats.draft, icon: FilePen },
          { label: 'Pending Signature', value: stats.pendingSignature, icon: Clock },
          { label: 'Signed', value: stats.signed, icon: CheckCircle2 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-zinc-500">{stat.label}</span>
              <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center">
                <stat.icon className="w-4 h-4 text-zinc-400" />
              </div>
            </div>
            <span className="text-2xl font-semibold text-zinc-900 tracking-tight">
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <input
            type="search"
            placeholder="Search by title, client, or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
          />
          <FileSignature className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        </div>
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
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {contractTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Contract List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
            <FileSignature className="w-6 h-6 text-zinc-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-1">
            {contracts.length === 0 ? 'No contracts yet' : 'No contracts match filters'}
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm mb-4">
            {contracts.length === 0
              ? 'Create your first contract to get started with client agreements.'
              : 'Try adjusting your search or filters.'}
          </p>
          {contracts.length === 0 && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Contract
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {filtered.map((contract) => {
              const status = statusConfig[contract.status];
              const clientName = clientNameMap.get(contract.clientId) || 'Unknown Client';
              const typeLabel =
                contractTypes.find((t) => t.value === contract.templateKey)?.label ||
                contract.templateKey;
              const signerCount = contract.signers?.length || 0;
              const signedCount = contract.signers?.filter((s) => s.signedAt).length || 0;

              return (
                <Link
                  key={contract.id}
                  href={`/contracts/${contract.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-zinc-900 truncate">
                        {contract.title}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>{clientName}</span>
                      <span className="text-zinc-300">|</span>
                      <span>{typeLabel}</span>
                      <span className="text-zinc-300">|</span>
                      <span>v{contract.version}</span>
                      {signerCount > 0 && (
                        <>
                          <span className="text-zinc-300">|</span>
                          <span>
                            {signedCount}/{signerCount} signed
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {contract.status === 'draft' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSubmitContractId(contract.id);
                          setSubmitOpen(true);
                        }}
                        title="Submit for signature"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    )}
                    {contract.pdfPath ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadPdf(contract.id, contract.title)}
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGeneratePdf(contract.id)}
                        disabled={generatingPdf === contract.id}
                        title="Generate PDF"
                      >
                        {generatingPdf === contract.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {!['signed', 'expired'].includes(contract.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCancelContractId(contract.id);
                          setCancelOpen(true);
                        }}
                        title="Cancel contract"
                      >
                        <XCircle className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Contract Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Contract</DialogTitle>
            <DialogDescription>
              Create a contract for a client. Add at least one signer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-zinc-700 mb-1 block">Client</label>
              <Select
                value={createForm.clientId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, clientId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 mb-1 block">Contract Type</label>
              <Select
                value={createForm.templateKey}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, templateKey: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
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
            <div>
              <label className="text-sm font-medium text-zinc-700 mb-1 block">Title</label>
              <Input
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g., MSA - Acme Corp"
              />
            </div>
            <div className="border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-zinc-700">Signers</label>
                <button
                  type="button"
                  onClick={() =>
                    setCreateSigners((s) => [
                      ...s,
                      { email: '', fullName: '', roleLabel: 'Authorized Signer' },
                    ])
                  }
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  + Add signer
                </button>
              </div>
              <div className="space-y-3">
                {createSigners.map((signer, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={signer.fullName}
                          onChange={(e) => {
                            const updated = [...createSigners];
                            updated[index] = { ...updated[index], fullName: e.target.value };
                            setCreateSigners(updated);
                          }}
                          placeholder="Full name"
                        />
                        <Input
                          value={signer.email}
                          onChange={(e) => {
                            const updated = [...createSigners];
                            updated[index] = { ...updated[index], email: e.target.value };
                            setCreateSigners(updated);
                          }}
                          placeholder="Email"
                        />
                      </div>
                      <Input
                        value={signer.roleLabel}
                        onChange={(e) => {
                          const updated = [...createSigners];
                          updated[index] = { ...updated[index], roleLabel: e.target.value };
                          setCreateSigners(updated);
                        }}
                        placeholder="Role (e.g., CEO, Legal)"
                      />
                    </div>
                    {createSigners.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCreateSigners((s) => s.filter((_, i) => i !== index))}
                        className="mt-2 text-zinc-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit for Signature Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit for Signature</DialogTitle>
            <DialogDescription>
              Send this contract to signers for review and signature.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-zinc-700 mb-1 block">Signing Provider</label>
            <Select value={submitProvider} onValueChange={setSubmitProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal (SkuldBot)</SelectItem>
                <SelectItem value="docusign">DocuSign</SelectItem>
                <SelectItem value="hellosign">HelloSign</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Contract Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Contract</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-zinc-700 mb-1 block">Reason</label>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep Contract
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cancel Contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
