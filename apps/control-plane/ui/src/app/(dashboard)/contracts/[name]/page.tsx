'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  Plus,
  ArrowLeft,
  Edit2,
  Eye,
  Send,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Archive,
  XCircle,
  History,
  FileType,
  PenTool,
  Loader2,
  Settings,
  Scale,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  contractsApi,
  ContractStatus,
  CONTRACT_TYPE_LABELS,
} from '@/lib/api';

interface ContractVersionSummary {
  id: string;
  version: string;
  version_notes: string | null;
  status: ContractStatus;
  effective_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  pdf_url: string | null;
  has_pdf: boolean;
  pdf_page_count: number | null;
  supersedes_id: string | null;
}

interface ContractVersionsResponse {
  contract_id: string;
  contract_name: string;
  display_name: string;
  contract_type: string;
  summary: string | null;
  is_required: boolean;
  requires_signature: boolean;
  requires_countersignature: boolean;
  legal_jurisdiction: string | null;
  compliance_frameworks: string[] | null;
  versions: ContractVersionSummary[];
  total_versions: number;
}

const STATUS_CONFIG: Record<ContractStatus, {
  label: string;
  color: string;
  icon: typeof CheckCircle2;
}> = {
  draft: { label: 'Draft', color: 'bg-zinc-100 text-zinc-700', icon: Clock },
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  deprecated: { label: 'Deprecated', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  archived: { label: 'Archived', color: 'bg-zinc-100 text-zinc-700', icon: Archive },
};

function ContractVersionsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const contractName = params.name as string;

  const [contract, setContract] = useState<ContractVersionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [newVersionDialog, setNewVersionDialog] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [sourceVersionId, setSourceVersionId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deprecateConfirm, setDeprecateConfirm] = useState<ContractVersionSummary | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<ContractVersionSummary | null>(null);

  const fetchContract = useCallback(async () => {
    try {
      setLoading(true);
      const data = await contractsApi.listContractVersions(encodeURIComponent(contractName), {
        include_archived: includeArchived,
      }) as ContractVersionsResponse;
      setContract(data);
    } catch (err) {
      console.error('Failed to fetch contract:', err);
      toast({ title: 'Error', description: 'Failed to load contract versions.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [contractName, includeArchived]);

  useEffect(() => { fetchContract(); }, [fetchContract]);

  const handlePublish = async (version: ContractVersionSummary) => {
    try {
      setActionLoading(version.id);
      await contractsApi.publishTemplate(version.id);
      toast({ title: 'Published', description: `Version ${version.version} is now active.`, variant: 'success' });
      fetchContract();
    } catch {
      toast({ title: 'Error', description: 'Failed to publish version.', variant: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeprecate = async () => {
    if (!deprecateConfirm) return;
    try {
      setActionLoading(deprecateConfirm.id);
      await contractsApi.deprecateTemplate(deprecateConfirm.id);
      toast({ title: 'Deprecated', description: `Version ${deprecateConfirm.version} has been deprecated.`, variant: 'success' });
      fetchContract();
    } catch {
      toast({ title: 'Error', description: 'Failed to deprecate version.', variant: 'error' });
    } finally {
      setActionLoading(null);
      setDeprecateConfirm(null);
    }
  };

  const handleArchive = async () => {
    if (!archiveConfirm) return;
    try {
      setActionLoading(archiveConfirm.id);
      await contractsApi.archiveTemplate(archiveConfirm.id);
      toast({ title: 'Archived', description: `Version ${archiveConfirm.version} has been archived.`, variant: 'success' });
      fetchContract();
    } catch {
      toast({ title: 'Error', description: 'Failed to archive version.', variant: 'error' });
    } finally {
      setActionLoading(null);
      setArchiveConfirm(null);
    }
  };

  const handleCreateNewVersion = async () => {
    if (!newVersion.trim() || !sourceVersionId) return;
    try {
      setCreatingVersion(true);
      await contractsApi.createTemplate({ name: contractName, display_name: contract?.display_name || contractName, contract_type: contract?.contract_type || 'custom', version: newVersion.trim() });
      toast({ title: 'Created', description: `Version ${newVersion} has been created.`, variant: 'success' });
      fetchContract();
    } catch {
      toast({ title: 'Error', description: 'Failed to create new version.', variant: 'error' });
    } finally {
      setCreatingVersion(false);
      setNewVersionDialog(false);
      setNewVersion('');
      setVersionNotes('');
      setSourceVersionId(null);
    }
  };

  const openNewVersionDialog = (version: ContractVersionSummary) => {
    setSourceVersionId(version.id);
    const parts = version.version.split('.');
    if (parts.length >= 2) {
      setNewVersion(`${parts[0]}.${parseInt(parts[1] || '0') + 1}`);
    } else {
      setNewVersion(`${version.version}.1`);
    }
    setNewVersionDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12 text-rose-500" />
        <p className="text-zinc-600">Contract not found</p>
        <Button variant="outline" onClick={() => router.push('/contracts')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Contracts
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/contracts')} className="text-zinc-600">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-zinc-200" />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">{contract.display_name}</h1>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <span>{CONTRACT_TYPE_LABELS[contract.contract_type] || contract.contract_type}</span>
                <span>•</span>
                <span>{contract.total_versions} version{contract.total_versions !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => {
            const base = contract.versions.find(v => v.status === 'active') || contract.versions[0];
            if (base) openNewVersionDialog(base);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            New Version
          </Button>
        </div>
      </div>

      {/* Contract Info */}
      {contract.summary && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-zinc-600">{contract.summary}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {contract.is_required && <Badge className="bg-violet-100 text-violet-700">Required for all</Badge>}
              {contract.requires_signature && <Badge className="bg-blue-100 text-blue-700">Requires Signature</Badge>}
              {contract.requires_countersignature && <Badge className="bg-violet-100 text-violet-700">Requires Countersign</Badge>}
              {contract.legal_jurisdiction && <Badge className="bg-zinc-100 text-zinc-700">{contract.legal_jurisdiction}</Badge>}
              {contract.compliance_frameworks?.map((fw) => (
                <Badge key={fw} className="bg-amber-100 text-amber-700">{fw.toUpperCase()}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
          <Checkbox checked={includeArchived} onCheckedChange={(checked) => setIncludeArchived(checked === true)} />
          Show archived
        </label>
      </div>

      {/* Versions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" />
            Version History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="bg-zinc-50 border-y border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Version</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Changes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">PDF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Effective Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {contract.versions.map((version) => {
                const cfg = STATUS_CONFIG[version.status];
                const StatusIcon = cfg.icon;
                const isLoading = actionLoading === version.id;

                return (
                  <tr key={version.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium text-zinc-900">v{version.version}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cfg.color}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-zinc-600 line-clamp-1">{version.version_notes || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {version.has_pdf ? (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <FileType className="w-3 h-3 mr-1" />
                          {version.pdf_page_count || '?'} pages
                        </Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-700">No PDF</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {version.effective_date ? new Date(version.effective_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {version.created_at ? new Date(version.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => router.push(`/contracts/templates/${version.id}`)} title={version.status === 'draft' ? 'Edit' : 'View'}>
                              {version.status === 'draft' ? <Edit2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                            {version.status === 'draft' && (
                              <Button variant="ghost" size="sm" onClick={() => handlePublish(version)} title="Publish" className="text-green-600 hover:text-green-700">
                                <Send className="w-4 h-4" />
                              </Button>
                            )}
                            {version.status === 'active' && (
                              <Button variant="ghost" size="sm" onClick={() => router.push(`/contracts/templates/${version.id}/send`)} title="Send for Signing" className="text-blue-600 hover:text-blue-700">
                                <PenTool className="w-4 h-4" />
                              </Button>
                            )}
                            {(version.status === 'active' || version.status === 'deprecated') && (
                              <Button variant="outline" size="sm" onClick={() => openNewVersionDialog(version)} title="Create New Version" className="h-7 px-2 text-[11px] font-medium">
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                New Version
                              </Button>
                            )}
                            {version.status === 'active' && (
                              <Button variant="ghost" size="sm" onClick={() => setDeprecateConfirm(version)} title="Deprecate" className="text-amber-600 hover:text-amber-700">
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {(version.status === 'draft' || version.status === 'deprecated') && (
                              <Button variant="ghost" size="sm" onClick={() => setArchiveConfirm(version)} title="Archive" className="text-zinc-400 hover:text-zinc-600">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {contract.versions.length === 0 && (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-zinc-900 mb-2">No versions found</h3>
              <p className="text-zinc-500">Create a new version to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Version Dialog */}
      <Dialog open={newVersionDialog} onOpenChange={setNewVersionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Version</DialogTitle>
            <DialogDescription>Create a new draft version based on the selected version.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="version">Version Number</Label>
              <Input id="version" value={newVersion} onChange={(e) => setNewVersion(e.target.value)} placeholder="e.g., 2.0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">What changed? (optional)</Label>
              <Textarea id="notes" value={versionNotes} onChange={(e) => setVersionNotes(e.target.value)} placeholder="Describe the changes..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewVersionDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateNewVersion} disabled={creatingVersion || !newVersion.trim()}>
              {creatingVersion && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deprecate Confirmation */}
      <Dialog open={!!deprecateConfirm} onOpenChange={() => setDeprecateConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deprecate Version</DialogTitle>
            <DialogDescription>Are you sure you want to deprecate version {deprecateConfirm?.version}? It will no longer accept new signatures.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeprecateConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeprecate}>Deprecate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation */}
      <Dialog open={!!archiveConfirm} onOpenChange={() => setArchiveConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Version</DialogTitle>
            <DialogDescription>Are you sure you want to archive version {archiveConfirm?.version}? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleArchive}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ContractVersionsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}>
      <ContractVersionsContent />
    </Suspense>
  );
}
