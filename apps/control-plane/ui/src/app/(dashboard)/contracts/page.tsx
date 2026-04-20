'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import {
  FileText,
  Plus,
  Eye,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileCheck,
  PenTool,
  Download,
  Layers,
  Edit2,
  Settings,
  Scale,
  Shield,
  Building2,
  Loader2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  contractsApi,
  ContractAcceptance,
  CONTRACT_TYPE_LABELS,
  ContractGroupSummary,
  ContractMetadataLookupsResponse,
  ContractTypeLookupItem,
} from '@/lib/api';

type ContractsTab = 'templates' | 'sent' | 'acceptances' | 'signatories' | 'legal_info' | 'policies' | 'lookups';

const VALID_TABS: ContractsTab[] = ['templates', 'sent', 'acceptances', 'signatories', 'legal_info', 'policies', 'lookups'];

function ContractsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contracts, setContracts] = useState<ContractGroupSummary[]>([]);
  const [acceptances, setAcceptances] = useState<ContractAcceptance[]>([]);
  const [loading, setLoading] = useState(true);

  const tabFromUrl = searchParams.get('tab') as ContractsTab | null;
  const [activeTab, setActiveTab] = useState<ContractsTab>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'templates'
  );

  const [includeArchived, setIncludeArchived] = useState(false);

  // Lookups for scope badges
  const [lookups, setLookups] = useState<ContractMetadataLookupsResponse | null>(null);
  const [lookupsState, setLookupsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const lookupsRequestIdRef = useRef(0);

  const contractTypeLookupMap = useMemo(() => {
    if (!lookups?.contract_types) return new Map<string, ContractTypeLookupItem>();
    return new Map(lookups.contract_types.map((ct) => [ct.code, ct]));
  }, [lookups]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [contractsRes, acceptancesArr] = await Promise.all([
        contractsApi.listContractsGrouped({ include_archived: includeArchived }),
        contractsApi.listAcceptances({ is_active: true }),
      ]);
      setContracts(contractsRes.contracts);
      setAcceptances(acceptancesArr);

      const requestId = ++lookupsRequestIdRef.current;
      setLookupsState('loading');
      contractsApi.getMetadataLookups(false)
        .then((data) => {
          if (requestId === lookupsRequestIdRef.current) { setLookups(data); setLookupsState('ready'); }
        })
        .catch(() => {
          if (requestId === lookupsRequestIdRef.current) { setLookups(null); setLookupsState('error'); }
        });
    } catch (err) {
      console.error('Failed to fetch contracts data:', err);
      toast({ title: 'Error', description: 'Failed to load contracts data. Please try again.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewContract = (contract: ContractGroupSummary) => {
    router.push(`/contracts/${contract.name}`);
  };

  const handleEditDraft = (contract: ContractGroupSummary) => {
    if (contract.draft_version) {
      router.push(`/contracts/templates/${contract.draft_version.id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }


  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-100">
            <Scale className="h-7 w-7 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Legal Contracts</h1>
            <p className="text-zinc-500 mt-0.5">Manage contract templates and acceptances</p>
          </div>
        </div>
        <Button onClick={() => router.push('/contracts/templates/new')}>
          <Plus className="w-4 h-4" />
          Create Contract
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-lg w-fit">
        {([
          { key: 'templates' as ContractsTab, icon: FileText, label: `Contracts (${contracts.length})` },
          { key: 'sent' as ContractsTab, icon: PenTool, label: 'Sent for Signing' },
          { key: 'acceptances' as ContractsTab, icon: FileCheck, label: `Acceptances (${acceptances.length})` },
          { key: 'signatories' as ContractsTab, icon: PenTool, label: 'Skuld Signatures' },
          { key: 'legal_info' as ContractsTab, icon: Building2, label: 'Skuld Legal Information' },
          { key: 'policies' as ContractsTab, icon: Shield, label: 'Policies' },
          { key: 'lookups' as ContractsTab, icon: Settings, label: 'Lookups' },
        ]).map(({ key, icon: Icon, label }) => (
          <Button
            key={key}
            variant="ghost"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-transparent'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {label}
            </div>
          </Button>
        ))}
      </div>

      {/* Contracts Tab (Grouped View) */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
              <Checkbox
                checked={includeArchived}
                onCheckedChange={(checked) => setIncludeArchived(checked === true)}
              />
              Show archived
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {contracts.map((contract) => (
              <Card
                key={contract.name}
                className="relative transition-all duration-200 hover:shadow-lg cursor-pointer group"
                onClick={() => handleViewContract(contract)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    {contract.active_version ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Active v{contract.active_version.version}
                        </span>
                      </Badge>
                    ) : contract.draft_version ? (
                      <Badge className="bg-zinc-100 text-zinc-700">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Draft v{contract.draft_version.version}
                        </span>
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700">No Active Version</Badge>
                    )}
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Layers className="w-3 h-3" />
                      {contract.total_versions} version{contract.total_versions !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-2 group-hover:text-blue-600 transition-colors">
                    {contract.display_name}
                  </CardTitle>
                  <p className="text-xs text-zinc-500">
                    {CONTRACT_TYPE_LABELS[contract.contract_type] || contract.contract_type}
                  </p>
                  {(() => {
                    if (lookupsState === 'loading') {
                      return <div className="h-5 w-16 bg-zinc-100 rounded animate-pulse mt-1" />;
                    }
                    if (lookupsState === 'error') return null;
                    const lookup = contractTypeLookupMap.get(contract.contract_type);
                    if (!lookup) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <Badge className={lookup.contract_scope === 'product' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}>
                          {lookup.contract_scope === 'product' ? 'Product' : 'Global'}
                        </Badge>
                        {lookup.contract_scope === 'product' && lookup.product_scopes?.map((p) => (
                          <Badge key={p} className="bg-zinc-100 text-zinc-600 text-[10px]">{p}</Badge>
                        ))}
                      </div>
                    );
                  })()}
                </CardHeader>

                <CardContent className="space-y-4">
                  {contract.summary && (
                    <p className="text-sm text-zinc-600 line-clamp-2">{contract.summary}</p>
                  )}

                  <div className="space-y-2">
                    {contract.is_required && (
                      <Badge className="bg-violet-100 text-violet-700">Required for all</Badge>
                    )}
                    {contract.required_for_plans?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {contract.required_for_plans.map((plan) => (
                          <Badge key={plan} className="bg-blue-100 text-blue-700">{plan}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {contract.compliance_frameworks?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {contract.compliance_frameworks.map((framework) => (
                          <Badge key={framework} className="bg-amber-100 text-amber-700">
                            {framework.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {contract.requires_signature && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">Requires Signature</span>
                    )}
                    {contract.requires_countersignature && (
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded">Requires Countersign</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleViewContract(contract); }}
                      >
                        <Eye className="w-4 h-4" />
                        View Versions
                      </Button>
                      {contract.draft_version && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleEditDraft(contract); }}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit Draft
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); router.push(`/contracts/${contract.name}?settings=true`); }}
                      title="Contract Settings"
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {contracts.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-zinc-900 mb-2">No contracts</h3>
              <p className="text-zinc-500 mb-4">Create your first contract to get started.</p>
              <Button onClick={() => router.push('/contracts/templates/new')}>
                <Plus className="w-4 h-4" />
                Create Contract
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Sent for Signing Tab */}
      {activeTab === 'sent' && (
        <div className="text-center py-12 text-zinc-500">
          Sent envelopes coming soon.
        </div>
      )}

      {/* Acceptances Tab */}
      {activeTab === 'acceptances' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Contract</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Accepted By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {acceptances.map((acceptance) => (
                    <tr key={acceptance.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">
                          {acceptance.template?.display_name || 'Unknown'}
                        </div>
                        <div className="text-xs text-zinc-500">v{acceptance.template?.version}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-zinc-900">{acceptance.accepted_by_name}</div>
                        <div className="text-xs text-zinc-500">{acceptance.accepted_by_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-zinc-100 text-zinc-700">{acceptance.acceptance_method}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {new Date(acceptance.accepted_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {acceptance.is_active ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          ) : acceptance.revoked_at ? (
                            <Badge className="bg-red-100 text-red-700">Revoked</Badge>
                          ) : (
                            <Badge className="bg-zinc-100 text-zinc-700">Inactive</Badge>
                          )}
                          {acceptance.countersigned_at && (
                            <Badge className="bg-violet-100 text-violet-700">Countersigned</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {acceptances.length === 0 && (
                <div className="text-center py-12">
                  <FileCheck className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-900 mb-2">No contract acceptances</h3>
                  <p className="text-zinc-500">Contract acceptances will appear here when clients accept contracts.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'signatories' && (
        <div className="text-center py-12 text-zinc-500">Signatories management coming soon.</div>
      )}

      {activeTab === 'legal_info' && (
        <div className="text-center py-12 text-zinc-500">Skuld legal information coming soon.</div>
      )}

      {activeTab === 'policies' && (
        <div className="text-center py-12 text-zinc-500">Signatory policies coming soon.</div>
      )}

      {activeTab === 'lookups' && (
        <div className="text-center py-12 text-zinc-500">Contract lookups coming soon.</div>
      )}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}>
      <ContractsPageContent />
    </Suspense>
  );
}
