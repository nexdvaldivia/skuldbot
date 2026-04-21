'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import {
  FileText,
  Plus,
  Eye,
  Clock,
  CheckCircle2,
  FileCheck,
  PenTool,
  Layers,
  Edit2,
  Settings,
  Scale,
  Shield,
  Building2,
  Loader2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { contractsApi, ContractAcceptance, ContractGroupSummary } from '@/lib/api';

type ContractsTab =
  | 'templates'
  | 'sent'
  | 'acceptances'
  | 'signatories'
  | 'legal_info'
  | 'policies'
  | 'lookups';

const VALID_TABS: ContractsTab[] = [
  'templates',
  'sent',
  'acceptances',
  'signatories',
  'legal_info',
  'policies',
  'lookups',
];

function ContractsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contracts, setContracts] = useState<ContractGroupSummary[]>([]);
  const [acceptances, setAcceptances] = useState<ContractAcceptance[]>([]);
  const [loading, setLoading] = useState(true);

  const tabFromUrl = searchParams.get('tab') as ContractsTab | null;
  const [activeTab, setActiveTab] = useState<ContractsTab>(
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'templates',
  );

  const [includeArchived, setIncludeArchived] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [contractsRes, acceptancesArr] = await Promise.all([
        contractsApi.listContractsGrouped({ includeArchived }),
        contractsApi.listAcceptances(),
      ]);
      setContracts(contractsRes.templates ?? []);
      setAcceptances(acceptancesArr ?? []);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load contracts data. Please try again.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewContract = (contract: ContractGroupSummary) => {
    router.push(`/contracts/${encodeURIComponent(contract.templateKey)}`);
  };

  const handleEditDraft = (contract: ContractGroupSummary) => {
    if (contract.draftVersion) {
      router.push(`/contracts/templates/${contract.draftVersion.id}`);
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
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8 space-y-8">
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
        {[
          {
            key: 'templates' as ContractsTab,
            icon: FileText,
            label: `Contracts (${contracts.length})`,
          },
          { key: 'sent' as ContractsTab, icon: PenTool, label: 'Sent for Signing' },
          {
            key: 'acceptances' as ContractsTab,
            icon: FileCheck,
            label: `Acceptances (${acceptances.length})`,
          },
          { key: 'signatories' as ContractsTab, icon: PenTool, label: 'Skuld Signatures' },
          { key: 'legal_info' as ContractsTab, icon: Building2, label: 'Skuld Legal Information' },
          { key: 'policies' as ContractsTab, icon: Shield, label: 'Policies' },
          { key: 'lookups' as ContractsTab, icon: Settings, label: 'Lookups' },
        ].map(({ key, icon: Icon, label }) => (
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
                key={contract.id}
                className="relative transition-all duration-200 hover:shadow-lg cursor-pointer group"
                onClick={() => handleViewContract(contract)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    {contract.activeVersion ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Active v{contract.activeVersion.versionNumber}
                        </span>
                      </Badge>
                    ) : contract.draftVersion ? (
                      <Badge className="bg-zinc-100 text-zinc-700">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Draft v{contract.draftVersion.versionNumber}
                        </span>
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700">No Active Version</Badge>
                    )}
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Layers className="w-3 h-3" />
                      {contract.totalVersions} version{contract.totalVersions !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <CardTitle className="text-lg mt-2 group-hover:text-blue-600 transition-colors">
                    {contract.title}
                  </CardTitle>
                  <p className="text-xs text-zinc-400 font-mono">{contract.templateKey}</p>
                </CardHeader>

                <CardContent className="space-y-4">
                  {contract.description && (
                    <p className="text-sm text-zinc-600 line-clamp-2">{contract.description}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewContract(contract);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                        View Versions
                      </Button>
                      {contract.draftVersion && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditDraft(contract);
                          }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(
                          `/contracts/${encodeURIComponent(contract.templateKey)}?settings=true`,
                        );
                      }}
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
        <div className="text-center py-12 text-zinc-500">Sent envelopes coming soon.</div>
      )}

      {/* Acceptances Tab */}
      {activeTab === 'acceptances' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">
                      Contract
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">
                      Accepted By
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">
                      Method
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {acceptances.map((acceptance) => (
                    <tr key={acceptance.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">
                          {acceptance.template?.displayName || 'Unknown'}
                        </div>
                        <div className="text-xs text-zinc-500">v{acceptance.template?.version}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-zinc-900">{acceptance.acceptedByName}</div>
                        <div className="text-xs text-zinc-500">{acceptance.acceptedByEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-zinc-100 text-zinc-700">
                          {acceptance.acceptanceMethod}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {new Date(acceptance.acceptedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {!acceptance.revokedAt ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700">Revoked</Badge>
                          )}
                          {acceptance.countersignedAt && (
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
                  <h3 className="text-lg font-medium text-zinc-900 mb-2">
                    No contract acceptances
                  </h3>
                  <p className="text-zinc-500">
                    Contract acceptances will appear here when clients accept contracts.
                  </p>
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
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      }
    >
      <ContractsPageContent />
    </Suspense>
  );
}
