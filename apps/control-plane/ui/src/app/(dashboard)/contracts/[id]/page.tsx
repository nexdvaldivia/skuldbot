'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Send,
  Download,
  XCircle,
  UserCheck,
  Eye,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Mail,
  FilePen,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import {
  contractsApi,
  clientsApi,
  type Contract,
  type ContractStatus,
  type ContractSignerStatus,
  type UpdateContractInput,
  type Client,
} from '@/lib/api';

const statusConfig: Record<
  ContractStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive' | 'info';
    color: string;
  }
> = {
  draft: { label: 'Draft', variant: 'secondary', color: 'text-zinc-600' },
  pending_signature: { label: 'Pending Signature', variant: 'warning', color: 'text-amber-600' },
  signed: { label: 'Signed', variant: 'info', color: 'text-blue-600' },
  declined: { label: 'Declined', variant: 'destructive', color: 'text-red-600' },
  cancelled: { label: 'Cancelled', variant: 'destructive', color: 'text-red-600' },
  expired: { label: 'Expired', variant: 'secondary', color: 'text-zinc-500' },
};

const signerStatusConfig: Record<
  ContractSignerStatus,
  { label: string; icon: typeof Clock; color: string }
> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-zinc-400' },
  sent: { label: 'Sent', icon: Mail, color: 'text-blue-500' },
  viewed: { label: 'Viewed', icon: Eye, color: 'text-amber-500' },
  signed: { label: 'Signed', icon: CheckCircle2, color: 'text-emerald-500' },
  declined: { label: 'Declined', icon: AlertTriangle, color: 'text-red-500' },
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

export default function ContractDetailPage() {
  const params = useParams();
  const contractId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<Contract | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // Signers management
  const [addSignerOpen, setAddSignerOpen] = useState(false);
  const [newSignerName, setNewSignerName] = useState('');
  const [newSignerEmail, setNewSignerEmail] = useState('');
  const [newSignerRole, setNewSignerRole] = useState('Authorized Signer');
  const [addingNewSigner, setAddingNewSigner] = useState(false);

  // Signer status update
  const [updatingSignerId, setUpdatingSignerId] = useState<string | null>(null);

  // Submit dialog
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitProvider, setSubmitProvider] = useState('internal');

  // Cancel dialog
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // PDF
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const loadContract = useCallback(async () => {
    try {
      setLoading(true);
      const c = await contractsApi.get(contractId);
      setContract(c);
      setEditTitle(c.title);

      try {
        const cl = await clientsApi.get(c.clientId);
        setClient(cl);
      } catch {
        // Client may not be accessible
      }
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to load contract',
        description: error instanceof Error ? error.message : 'Contract not found',
      });
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void loadContract();
  }, [loadContract]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContract();
    setRefreshing(false);
  };

  const handleSaveTitle = async () => {
    if (!contract || !editTitle.trim()) return;
    try {
      setSaving(true);
      const input: UpdateContractInput = { title: editTitle.trim() };
      await contractsApi.update(contract.id, input);
      toast({ variant: 'success', title: 'Contract updated' });
      setEditing(false);
      await loadContract();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to update',
        description: error instanceof Error ? error.message : 'Error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSigner = async () => {
    if (!contract || !newSignerEmail.trim() || !newSignerName.trim()) return;
    try {
      setAddingNewSigner(true);
      const currentSigners = (contract.signers || []).map((s) => ({
        email: s.email,
        fullName: s.fullName,
        roleLabel: s.roleLabel,
      }));
      currentSigners.push({
        email: newSignerEmail.trim().toLowerCase(),
        fullName: newSignerName.trim(),
        roleLabel: newSignerRole.trim(),
      });
      await contractsApi.update(contract.id, { signers: currentSigners });
      toast({ variant: 'success', title: 'Signer added' });
      setAddSignerOpen(false);
      setNewSignerName('');
      setNewSignerEmail('');
      setNewSignerRole('Authorized Signer');
      await loadContract();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to add signer',
        description: error instanceof Error ? error.message : 'Error',
      });
    } finally {
      setAddingNewSigner(false);
    }
  };

  const handleUpdateSignerStatus = async (signerId: string, status: ContractSignerStatus) => {
    if (!contract) return;
    try {
      setUpdatingSignerId(signerId);
      await contractsApi.updateSignerStatus(contract.id, signerId, status, {
        updatedVia: 'control-plane-ui',
        updatedAt: new Date().toISOString(),
      });
      toast({ variant: 'success', title: `Signer marked as ${status}` });
      await loadContract();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to update signer',
        description: error instanceof Error ? error.message : 'Error',
      });
    } finally {
      setUpdatingSignerId(null);
    }
  };

  const handleSubmit = async () => {
    if (!contract) return;
    try {
      setSubmitting(true);
      await contractsApi.submit(contract.id, submitProvider);
      toast({ variant: 'success', title: 'Contract submitted for signature' });
      setSubmitOpen(false);
      await loadContract();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to submit',
        description: error instanceof Error ? error.message : 'Error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!contract || !cancelReason.trim()) return;
    try {
      setCancelling(true);
      await contractsApi.cancel(contract.id, cancelReason);
      toast({ variant: 'success', title: 'Contract cancelled' });
      setCancelOpen(false);
      setCancelReason('');
      await loadContract();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to cancel',
        description: error instanceof Error ? error.message : 'Error',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!contract) return;
    try {
      setGeneratingPdf(true);
      await contractsApi.generatePdf(contract.id);
      toast({ variant: 'success', title: 'PDF generated' });
      await loadContract();
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to generate PDF',
        description: error instanceof Error ? error.message : 'Error',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!contract) return;
    try {
      const blob = await contractsApi.downloadPdf(contract.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contract.title.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to download PDF',
        description: error instanceof Error ? error.message : 'Error',
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

  if (!contract) {
    return (
      <div className="px-4 lg:px-8 py-6 max-w-5xl mx-auto text-center py-20">
        <AlertTriangle className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
        <h2 className="text-sm font-semibold text-zinc-900 mb-1">Contract not found</h2>
        <p className="text-sm text-zinc-500 mb-4">This contract may have been deleted.</p>
        <Link href="/contracts">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Contracts
          </Button>
        </Link>
      </div>
    );
  }

  const status = statusConfig[contract.status];
  const isDraft = contract.status === 'draft';
  const canSubmit = isDraft || contract.status === 'declined' || contract.status === 'cancelled';
  const canCancel = !['signed', 'expired'].includes(contract.status);
  const signers = contract.signers || [];
  const signedCount = signers.filter((s) => s.signedAt).length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
      {/* Back + Header */}
      <Link
        href="/contracts"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Contracts
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-lg font-semibold w-80"
                />
                <Button size="sm" onClick={handleSaveTitle} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setEditTitle(contract.title);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-zinc-900">{contract.title}</h1>
                {isDraft && (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    <FilePen className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <span>{client?.name || contract.clientId}</span>
            <span className="text-zinc-300">|</span>
            <span>{contract.templateKey.toUpperCase()}</span>
            <span className="text-zinc-300">|</span>
            <span>v{contract.version}</span>
            <span className="text-zinc-300">|</span>
            <span>
              {signedCount}/{signers.length} signed
            </span>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {canSubmit && (
            <Button variant="outline" size="sm" onClick={() => setSubmitOpen(true)}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Submit
            </Button>
          )}
          {contract.pdfPath ? (
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              PDF
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5 mr-1.5" />
              )}
              Generate PDF
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
              <XCircle className="w-3.5 h-3.5 text-red-500" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content — Signers */}
        <div className="lg:col-span-2 space-y-6">
          {/* Signers */}
          <section className="bg-white rounded-xl border border-zinc-200">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-900">Signers ({signers.length})</h2>
              </div>
              {isDraft && (
                <Button variant="ghost" size="sm" onClick={() => setAddSignerOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              )}
            </div>
            {signers.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">
                No signers yet. Add signers before submitting for signature.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {signers
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((signer) => {
                    const signerStatus = signerStatusConfig[signer.status];
                    const SignerIcon = signerStatus.icon;
                    return (
                      <div key={signer.id} className="flex items-center gap-4 px-5 py-4">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            signer.signedAt
                              ? 'bg-emerald-50'
                              : signer.status === 'declined'
                                ? 'bg-red-50'
                                : 'bg-zinc-50'
                          }`}
                        >
                          <SignerIcon className={`w-4 h-4 ${signerStatus.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900">
                              {signer.fullName}
                            </span>
                            <span className="text-xs text-zinc-400">{signer.roleLabel}</span>
                          </div>
                          <span className="text-xs text-zinc-500">{signer.email}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Signer timeline */}
                          <div className="text-right text-[11px] text-zinc-400 space-y-0.5">
                            {signer.sentAt && <div>Sent {formatDateTime(signer.sentAt)}</div>}
                            {signer.viewedAt && <div>Viewed {formatDateTime(signer.viewedAt)}</div>}
                            {signer.signedAt && (
                              <div className="text-emerald-600 font-medium">
                                Signed {formatDateTime(signer.signedAt)}
                              </div>
                            )}
                            {signer.declinedAt && (
                              <div className="text-red-600 font-medium">
                                Declined {formatDateTime(signer.declinedAt)}
                              </div>
                            )}
                          </div>
                          {/* Admin actions — manually update signer status */}
                          {contract.status === 'pending_signature' &&
                            !signer.signedAt &&
                            !signer.declinedAt && (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateSignerStatus(signer.id, 'viewed')}
                                  disabled={updatingSignerId === signer.id || !!signer.viewedAt}
                                  title="Mark as viewed"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateSignerStatus(signer.id, 'signed')}
                                  disabled={updatingSignerId === signer.id}
                                  title="Mark as signed"
                                >
                                  {updatingSignerId === signer.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUpdateSignerStatus(signer.id, 'declined')}
                                  disabled={updatingSignerId === signer.id}
                                  title="Mark as declined"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                </Button>
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* PDF Preview */}
          {contract.renderedHtml && (
            <section className="bg-white rounded-xl border border-zinc-200">
              <div className="px-5 py-4 border-b border-zinc-100">
                <h2 className="text-sm font-semibold text-zinc-900">Document Preview</h2>
              </div>
              <div className="p-5">
                <iframe
                  srcDoc={contract.renderedHtml}
                  className="w-full border border-zinc-200 rounded-lg"
                  style={{ height: '500px' }}
                  sandbox="allow-same-origin"
                  title="Contract preview"
                />
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Details
            </h3>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-zinc-500">Client</span>
                <p className="text-sm font-medium text-zinc-900">
                  {client?.name || contract.clientId}
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Type</span>
                <p className="text-sm font-medium text-zinc-900">
                  {contract.templateKey.toUpperCase()}
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Version</span>
                <p className="text-sm text-zinc-700">{contract.version}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Created</span>
                <p className="text-sm text-zinc-700">{formatDateTime(contract.createdAt)}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Updated</span>
                <p className="text-sm text-zinc-700">{formatDateTime(contract.updatedAt)}</p>
              </div>
              {contract.signedAt && (
                <div>
                  <span className="text-xs text-zinc-500">Signed</span>
                  <p className="text-sm font-medium text-emerald-600">
                    {formatDateTime(contract.signedAt)}
                  </p>
                </div>
              )}
              {contract.envelopeProvider && (
                <div>
                  <span className="text-xs text-zinc-500">Signing Provider</span>
                  <p className="text-sm text-zinc-700">{contract.envelopeProvider}</p>
                </div>
              )}
            </div>
          </div>

          {/* PDF */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Document
            </h3>
            {contract.pdfPath ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-900">PDF Generated</p>
                  <p className="text-xs text-zinc-500">{contract.pdfPath}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleDownloadPdf}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-zinc-500 mb-2">No PDF generated yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                >
                  {generatingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 mr-1" />
                  )}
                  Generate PDF
                </Button>
              </div>
            )}
          </div>

          {/* Variables */}
          {contract.variables && Object.keys(contract.variables).length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Variables
              </h3>
              <div className="space-y-2">
                {Object.entries(contract.variables).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{key}</span>
                    <span className="text-xs font-medium text-zinc-700">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Signer Dialog */}
      <Dialog open={addSignerOpen} onOpenChange={setAddSignerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Signer</DialogTitle>
            <DialogDescription>Add a new signer to this contract.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Input
              value={newSignerName}
              onChange={(e) => setNewSignerName(e.target.value)}
              placeholder="Full name"
            />
            <Input
              value={newSignerEmail}
              onChange={(e) => setNewSignerEmail(e.target.value)}
              placeholder="Email address"
            />
            <Input
              value={newSignerRole}
              onChange={(e) => setNewSignerRole(e.target.value)}
              placeholder="Role (e.g., CEO, Legal)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSignerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSigner} disabled={addingNewSigner}>
              {addingNewSigner && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Signer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit for Signature</DialogTitle>
            <DialogDescription>
              Send to {signers.length} signer(s) for review and signature.
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
              Submit to {signers.length} Signer(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Contract</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep
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
