'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Save,
  Shield,
  TestTube2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ssoApi, tenantsApi, type SsoProvider, type Tenant, type TenantSsoConfig } from '@/lib/api';

type SsoFormState = {
  enabled: boolean;
  enforced: boolean;
  autoProvision: boolean;
  jitProvisioning: boolean;
  provider: SsoProvider;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  jwksUrl: string;
  scopesText: string;
  allowedDomainsText: string;
  claimEmail: string;
  claimFirstName: string;
  claimLastName: string;
  claimDisplayName: string;
  claimGroups: string;
  claimPicture: string;
  pkce: boolean;
};

const DEFAULT_FORM: SsoFormState = {
  enabled: false,
  enforced: false,
  autoProvision: true,
  jitProvisioning: true,
  provider: 'azure-entra-id',
  clientId: '',
  clientSecret: '',
  discoveryUrl: '',
  authorizationUrl: '',
  tokenUrl: '',
  userInfoUrl: '',
  jwksUrl: '',
  scopesText: 'openid,profile,email',
  allowedDomainsText: '',
  claimEmail: 'email',
  claimFirstName: 'given_name',
  claimLastName: 'family_name',
  claimDisplayName: 'name',
  claimGroups: 'groups',
  claimPicture: 'picture',
  pkce: true,
};

const PROVIDER_LABELS: Record<SsoProvider, string> = {
  'azure-entra-id': 'Azure Entra ID',
  google: 'Google Workspace',
  'aws-cognito': 'AWS Cognito',
  'okta-oidc': 'Okta OIDC',
  auth0: 'Auth0',
  keycloak: 'Keycloak',
  oidc: 'OIDC Generic',
};

export default function SsoSecurityPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [form, setForm] = useState<SsoFormState>(DEFAULT_FORM);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<TenantSsoConfig | null>(null);

  useEffect(() => {
    const loadTenants = async () => {
      try {
        setLoadingTenants(true);
        const data = await tenantsApi.list();
        setTenants(data);
        if (data.length > 0) {
          setSelectedTenantId(data[0].id);
        }
      } catch (error) {
        toast({
          variant: 'error',
          title: 'Failed to load orchestrators',
          description: error instanceof Error ? error.message : 'Could not load tenants.',
        });
      } finally {
        setLoadingTenants(false);
      }
    };
    void loadTenants();
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      if (!selectedTenantId) return;
      try {
        setLoadingConfig(true);
        const config = await ssoApi.getTenantConfig(selectedTenantId);
        setCurrentConfig(config);
        setForm({
          enabled: config.enabled,
          enforced: config.enforced,
          autoProvision: config.autoProvision,
          jitProvisioning: config.jitProvisioning,
          provider: config.provider || 'azure-entra-id',
          clientId: config.oidc?.clientId || '',
          clientSecret: '',
          discoveryUrl: config.oidc?.discoveryUrl || '',
          authorizationUrl: config.oidc?.authorizationUrl || '',
          tokenUrl: config.oidc?.tokenUrl || '',
          userInfoUrl: config.oidc?.userInfoUrl || '',
          jwksUrl: config.oidc?.jwksUrl || '',
          scopesText: (config.oidc?.scopes || ['openid', 'profile', 'email']).join(','),
          allowedDomainsText: (config.allowedDomains || []).join(','),
          claimEmail: config.oidc?.claimMapping?.email || 'email',
          claimFirstName: config.oidc?.claimMapping?.firstName || 'given_name',
          claimLastName: config.oidc?.claimMapping?.lastName || 'family_name',
          claimDisplayName: config.oidc?.claimMapping?.displayName || 'name',
          claimGroups: config.oidc?.claimMapping?.groups || 'groups',
          claimPicture: config.oidc?.claimMapping?.picture || 'picture',
          pkce: config.oidc?.pkce ?? true,
        });
      } catch (error) {
        setCurrentConfig(null);
        toast({
          variant: 'error',
          title: 'Failed to load SSO config',
          description: error instanceof Error ? error.message : 'Could not load SSO configuration.',
        });
      } finally {
        setLoadingConfig(false);
      }
    };

    void loadConfig();
  }, [selectedTenantId]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) || null,
    [tenants, selectedTenantId],
  );

  const updateForm = <K extends keyof SsoFormState>(key: K, value: SsoFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTest = async () => {
    if (!selectedTenantId) return;
    try {
      setTesting(true);
      const result = await ssoApi.testTenantConfig(selectedTenantId, {
        discoveryUrl: form.discoveryUrl || undefined,
        authorizationUrl: form.authorizationUrl || undefined,
        tokenUrl: form.tokenUrl || undefined,
      });
      toast({
        variant: result.success ? 'success' : 'warning',
        title: result.success ? 'Connection successful' : 'Connection test failed',
        description: result.message,
      });
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Connection test failed',
        description: error instanceof Error ? error.message : 'Unable to test configuration.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTenantId) return;
    try {
      setSaving(true);
      await ssoApi.updateTenantConfig(selectedTenantId, {
        enabled: form.enabled,
        enforced: form.enforced,
        autoProvision: form.autoProvision,
        jitProvisioning: form.jitProvisioning,
        provider: form.provider,
        protocol: 'oidc',
        clientId: form.clientId,
        clientSecret: form.clientSecret || undefined,
        discoveryUrl: form.discoveryUrl || undefined,
        authorizationUrl: form.authorizationUrl || undefined,
        tokenUrl: form.tokenUrl || undefined,
        userInfoUrl: form.userInfoUrl || undefined,
        jwksUrl: form.jwksUrl || undefined,
        scopes: form.scopesText.split(',').map((scope) => scope.trim()).filter(Boolean),
        pkce: form.pkce,
        allowedDomains: form.allowedDomainsText
          .split(',')
          .map((domain) => domain.trim())
          .filter(Boolean),
        claimMapping: {
          email: form.claimEmail,
          firstName: form.claimFirstName || undefined,
          lastName: form.claimLastName || undefined,
          displayName: form.claimDisplayName || undefined,
          groups: form.claimGroups || undefined,
          picture: form.claimPicture || undefined,
        },
      });
      toast({
        variant: 'success',
        title: 'SSO configuration updated',
        description: 'Changes were saved and will apply on orchestrator license refresh.',
      });

      const refreshed = await ssoApi.getTenantConfig(selectedTenantId);
      setCurrentConfig(refreshed);
      updateForm('clientSecret', '');
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Failed to save SSO configuration',
        description: error instanceof Error ? error.message : 'Update request failed.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
      <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Tenant SSO Configuration</h1>
        <p className="mt-1 text-zinc-500">Configure OIDC SSO in Control Plane. Orchestrator consumes it through license validation.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          {loadingTenants ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading orchestrators...
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Orchestrator (Tenant)</label>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select orchestrator" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={currentConfig?.enabled ? 'success' : 'secondary'}>
                  {currentConfig?.enabled ? 'SSO Enabled' : 'SSO Disabled'}
                </Badge>
                {currentConfig?.oidc?.hasClientSecret && (
                  <Badge variant="outline">Client secret stored</Badge>
                )}
                {currentConfig?.licenseId ? (
                  <Badge variant="outline">License linked</Badge>
                ) : (
                  <Badge variant="warning">No license</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {loadingConfig ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading SSO configuration...
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200">
                <div>
                  <p className="font-medium text-zinc-900">Enable SSO</p>
                  <p className="text-sm text-zinc-500">Force enterprise authentication through OIDC provider</p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(checked) => updateForm('enabled', checked)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Provider</label>
                  <Select value={form.provider} onValueChange={(value) => updateForm('provider', value as SsoProvider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROVIDER_LABELS).map(([provider, label]) => (
                        <SelectItem key={provider} value={provider}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Client ID</label>
                  <Input value={form.clientId} onChange={(event) => updateForm('clientId', event.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Client Secret</label>
                <Input
                  type="password"
                  value={form.clientSecret}
                  onChange={(event) => updateForm('clientSecret', event.target.value)}
                  placeholder={currentConfig?.oidc?.hasClientSecret ? 'Leave blank to keep existing secret' : 'Enter client secret'}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Discovery URL</label>
                  <Input value={form.discoveryUrl} onChange={(event) => updateForm('discoveryUrl', event.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Scopes (comma-separated)</label>
                  <Input value={form.scopesText} onChange={(event) => updateForm('scopesText', event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Allowed domains (comma-separated)</label>
                  <Input value={form.allowedDomainsText} onChange={(event) => updateForm('allowedDomainsText', event.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Claim mapping: email</label>
                  <Input value={form.claimEmail} onChange={(event) => updateForm('claimEmail', event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200">
                  <span className="text-sm text-zinc-700">Enforced</span>
                  <Switch checked={form.enforced} onCheckedChange={(checked) => updateForm('enforced', checked)} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200">
                  <span className="text-sm text-zinc-700">Auto provision</span>
                  <Switch checked={form.autoProvision} onCheckedChange={(checked) => updateForm('autoProvision', checked)} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200">
                  <span className="text-sm text-zinc-700">PKCE</span>
                  <Switch checked={form.pkce} onCheckedChange={(checked) => updateForm('pkce', checked)} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-4">
                <Button variant="outline" onClick={handleTest} disabled={testing || !selectedTenant}>
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
                  Test
                </Button>
                <Button onClick={handleSave} disabled={saving || !selectedTenant}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
              </div>

              <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 flex gap-3">
                <Shield className="h-4 w-4 text-zinc-500 mt-0.5" />
                <p className="text-xs text-zinc-600">
                  RBAC enforced: only `skuld_admin` and tenant-matching `client_admin` can update SSO. `skuld_support` has read/test access.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
