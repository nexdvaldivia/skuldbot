'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  CreditCard,
  Mail,
  HardDrive,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  Settings2,
} from 'lucide-react';
import type {
  ProviderStatus,
  StripeConfig,
  SendGridConfig,
  MicrosoftGraphConfig,
  LocalStorageConfig,
  S3StorageConfig,
  AzureBlobConfig,
} from '@/types/providers';

// Mock initial data
const initialPaymentConfig: StripeConfig & { environment: 'test' | 'production' } = {
  provider: 'stripe',
  environment: 'test',
  publishableKey: '',
  secretKey: '',
  webhookSecret: '',
  connectEnabled: false,
};

const initialSendGridConfig: SendGridConfig = {
  provider: 'sendgrid',
  apiKey: '',
  fromEmail: '',
  fromName: 'Skuld',
  sandboxMode: true,
};

const initialMsGraphConfig: MicrosoftGraphConfig = {
  provider: 'microsoft_graph',
  tenantId: '',
  clientId: '',
  clientSecret: '',
  fromEmail: '',
  fromName: 'Skuld',
};

const initialLocalStorageConfig: LocalStorageConfig = {
  provider: 'local',
  basePath: '/var/skuldbot/storage',
  maxFileSizeMb: 100,
};

const initialS3Config: S3StorageConfig = {
  provider: 's3',
  accessKeyId: '',
  secretAccessKey: '',
  region: 'us-east-1',
  bucket: '',
  endpoint: '',
  forcePathStyle: false,
};

const initialAzureBlobConfig: AzureBlobConfig = {
  provider: 'azure_blob',
  connectionString: '',
  containerName: '',
  accountName: '',
  accountKey: '',
  sasToken: '',
};

type ProviderTab = 'payment' | 'email' | 'storage';

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<ProviderTab>('payment');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setTestResult({ success: true, message: 'Connection successful!' });
    setTesting(false);
  };

  const tabs = [
    { id: 'payment' as const, label: 'Payments', icon: CreditCard },
    { id: 'email' as const, label: 'Email', icon: Mail },
    { id: 'storage' as const, label: 'Storage', icon: HardDrive },
  ];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
      {/* Back Link */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Integrations</h1>
        <p className="text-zinc-500 mt-1">Configure external service providers for payments, email, and storage</p>
      </div>

      {/* Success Message */}
      {saved && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">Configuration saved successfully</span>
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className={`mb-6 flex items-center gap-2 px-4 py-3 rounded-lg border ${
          testResult.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span className="text-sm font-medium">{testResult.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-lg mb-8 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setTestResult(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === 'payment' && (
        <PaymentProviderConfig onSave={handleSave} onTest={handleTest} testing={testing} />
      )}
      {activeTab === 'email' && (
        <EmailProviderConfig onSave={handleSave} onTest={handleTest} testing={testing} />
      )}
      {activeTab === 'storage' && (
        <StorageProviderConfig onSave={handleSave} onTest={handleTest} testing={testing} />
      )}
    </div>
  );
}

// ============================================
// PAYMENT PROVIDER CONFIG (STRIPE)
// ============================================

interface ConfigProps {
  onSave: () => void;
  onTest: () => void;
  testing: boolean;
}

function PaymentProviderConfig({ onSave, onTest, testing }: ConfigProps) {
  const [config, setConfig] = useState(initialPaymentConfig);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [status, setStatus] = useState<ProviderStatus>('not_configured');

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-6">
      {/* Stripe Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-[#635BFF]/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#635BFF]" fill="currentColor">
                  <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">Stripe</h3>
                <p className="text-sm text-zinc-500">Process payments and manage subscriptions</p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>

          {/* Environment Toggle */}
          <div className="mb-6 p-4 rounded-lg bg-zinc-50 border border-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">Environment</p>
                <p className="text-xs text-zinc-500">Switch between test and production mode</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${config.environment === 'test' ? 'text-amber-600 font-medium' : 'text-zinc-400'}`}>
                  Test
                </span>
                <Switch
                  checked={config.environment === 'production'}
                  onCheckedChange={(checked) =>
                    updateConfig({ environment: checked ? 'production' : 'test' })
                  }
                />
                <span className={`text-sm ${config.environment === 'production' ? 'text-emerald-600 font-medium' : 'text-zinc-400'}`}>
                  Production
                </span>
              </div>
            </div>
            {config.environment === 'production' && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  Production mode will process real payments. Make sure your keys are correct.
                </p>
              </div>
            )}
          </div>

          {/* API Keys */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Publishable Key
                <span className="text-zinc-400 font-normal ml-1">
                  ({config.environment === 'test' ? 'pk_test_...' : 'pk_live_...'})
                </span>
              </label>
              <Input
                type="text"
                value={config.publishableKey}
                onChange={(e) => updateConfig({ publishableKey: e.target.value })}
                placeholder={config.environment === 'test' ? 'pk_test_...' : 'pk_live_...'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Secret Key
                <span className="text-zinc-400 font-normal ml-1">
                  ({config.environment === 'test' ? 'sk_test_...' : 'sk_live_...'})
                </span>
              </label>
              <div className="relative">
                <Input
                  type={showSecretKey ? 'text' : 'password'}
                  value={config.secretKey}
                  onChange={(e) => updateConfig({ secretKey: e.target.value })}
                  placeholder={config.environment === 'test' ? 'sk_test_...' : 'sk_live_...'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Webhook Secret
                <span className="text-zinc-400 font-normal ml-1">(whsec_...)</span>
              </label>
              <div className="relative">
                <Input
                  type={showWebhookSecret ? 'text' : 'password'}
                  value={config.webhookSecret}
                  onChange={(e) => updateConfig({ webhookSecret: e.target.value })}
                  placeholder="whsec_..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Webhook endpoint: <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600">
                  https://api.skuld.io/webhooks/stripe
                </code>
              </p>
            </div>

            {/* Stripe Connect */}
            <div className="pt-4 border-t border-zinc-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900">Stripe Connect</p>
                  <p className="text-xs text-zinc-500">Enable partner payouts for marketplace revenue share</p>
                </div>
                <Switch
                  checked={config.connectEnabled}
                  onCheckedChange={(checked) => updateConfig({ connectEnabled: checked })}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between">
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Stripe Dashboard
            </a>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onTest} disabled={testing}>
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Test Connection
              </Button>
              <Button onClick={onSave}>
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// EMAIL PROVIDER CONFIG
// ============================================

function EmailProviderConfig({ onSave, onTest, testing }: ConfigProps) {
  const [activeProvider, setActiveProvider] = useState<'sendgrid' | 'microsoft_graph'>('sendgrid');
  const [sendGridConfig, setSendGridConfig] = useState(initialSendGridConfig);
  const [msGraphConfig, setMsGraphConfig] = useState(initialMsGraphConfig);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [status, setStatus] = useState<ProviderStatus>('not_configured');

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-zinc-900 mb-1">Email Provider</h3>
          <p className="text-sm text-zinc-500 mb-4">Select and configure your email service provider</p>

          <Select value={activeProvider} onValueChange={(value: 'sendgrid' | 'microsoft_graph') => setActiveProvider(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sendgrid">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-[#1A82E2] flex items-center justify-center">
                    <Mail className="h-3 w-3 text-white" />
                  </div>
                  SendGrid
                </div>
              </SelectItem>
              <SelectItem value="microsoft_graph">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-[#0078D4] flex items-center justify-center">
                    <Mail className="h-3 w-3 text-white" />
                  </div>
                  Microsoft Graph
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* SendGrid Config */}
      {activeProvider === 'sendgrid' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-[#1A82E2]/10 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-[#1A82E2]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">SendGrid</h3>
                  <p className="text-sm text-zinc-500">Transactional and marketing email delivery</p>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">API Key</label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={sendGridConfig.apiKey}
                    onChange={(e) => setSendGridConfig({ ...sendGridConfig, apiKey: e.target.value })}
                    placeholder="SG.xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">From Email</label>
                  <Input
                    type="email"
                    value={sendGridConfig.fromEmail}
                    onChange={(e) => setSendGridConfig({ ...sendGridConfig, fromEmail: e.target.value })}
                    placeholder="noreply@skuld.io"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">From Name</label>
                  <Input
                    type="text"
                    value={sendGridConfig.fromName}
                    onChange={(e) => setSendGridConfig({ ...sendGridConfig, fromName: e.target.value })}
                    placeholder="Skuld"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200">
                <div>
                  <p className="text-sm font-medium text-zinc-900">Sandbox Mode</p>
                  <p className="text-xs text-zinc-500">Test emails without actually sending them</p>
                </div>
                <Switch
                  checked={sendGridConfig.sandboxMode}
                  onCheckedChange={(checked) => setSendGridConfig({ ...sendGridConfig, sandboxMode: checked })}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between">
              <a
                href="https://app.sendgrid.com/settings/api_keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open SendGrid Dashboard
              </a>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={onTest} disabled={testing}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Send Test Email
                </Button>
                <Button onClick={onSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Microsoft Graph Config */}
      {activeProvider === 'microsoft_graph' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-[#0078D4]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#0078D4]" fill="currentColor">
                    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Microsoft Graph</h3>
                  <p className="text-sm text-zinc-500">Send emails via Microsoft 365 / Exchange Online</p>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Tenant ID</label>
                <Input
                  type="text"
                  value={msGraphConfig.tenantId}
                  onChange={(e) => setMsGraphConfig({ ...msGraphConfig, tenantId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Client ID (Application ID)</label>
                <Input
                  type="text"
                  value={msGraphConfig.clientId}
                  onChange={(e) => setMsGraphConfig({ ...msGraphConfig, clientId: e.target.value })}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Client Secret</label>
                <div className="relative">
                  <Input
                    type={showClientSecret ? 'text' : 'password'}
                    value={msGraphConfig.clientSecret}
                    onChange={(e) => setMsGraphConfig({ ...msGraphConfig, clientSecret: e.target.value })}
                    placeholder="Client secret value"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientSecret(!showClientSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">From Email</label>
                  <Input
                    type="email"
                    value={msGraphConfig.fromEmail}
                    onChange={(e) => setMsGraphConfig({ ...msGraphConfig, fromEmail: e.target.value })}
                    placeholder="noreply@yourcompany.com"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Must be a valid mailbox in your tenant</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">From Name</label>
                  <Input
                    type="text"
                    value={msGraphConfig.fromName}
                    onChange={(e) => setMsGraphConfig({ ...msGraphConfig, fromName: e.target.value })}
                    placeholder="Skuld"
                  />
                </div>
              </div>

              {/* Required Permissions */}
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm font-medium text-blue-900 mb-2">Required API Permissions</p>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• <code className="bg-blue-100 px-1 rounded">Mail.Send</code> - Application permission</li>
                  <li>• Grant admin consent in Azure Portal</li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between">
              <a
                href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Azure Portal
              </a>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={onTest} disabled={testing}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Send Test Email
                </Button>
                <Button onClick={onSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// STORAGE PROVIDER CONFIG
// ============================================

function StorageProviderConfig({ onSave, onTest, testing }: ConfigProps) {
  const [activeProvider, setActiveProvider] = useState<'local' | 's3' | 'azure_blob'>('local');
  const [localConfig, setLocalConfig] = useState(initialLocalStorageConfig);
  const [s3Config, setS3Config] = useState(initialS3Config);
  const [azureConfig, setAzureConfig] = useState(initialAzureBlobConfig);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [status, setStatus] = useState<ProviderStatus>('not_configured');

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-zinc-900 mb-1">Storage Provider</h3>
          <p className="text-sm text-zinc-500 mb-4">Select and configure your storage service for artifacts and evidence packs</p>

          <Select value={activeProvider} onValueChange={(value: 'local' | 's3' | 'azure_blob') => setActiveProvider(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-zinc-500 flex items-center justify-center">
                    <HardDrive className="h-3 w-3 text-white" />
                  </div>
                  Local Filesystem
                </div>
              </SelectItem>
              <SelectItem value="s3">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-[#FF9900] flex items-center justify-center">
                    <HardDrive className="h-3 w-3 text-white" />
                  </div>
                  Amazon S3 / S3-Compatible
                </div>
              </SelectItem>
              <SelectItem value="azure_blob">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded bg-[#0078D4] flex items-center justify-center">
                    <HardDrive className="h-3 w-3 text-white" />
                  </div>
                  Azure Blob Storage
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Local Storage Config */}
      {activeProvider === 'local' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-zinc-100 flex items-center justify-center">
                  <HardDrive className="h-6 w-6 text-zinc-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Local Filesystem</h3>
                  <p className="text-sm text-zinc-500">Store files on the local server filesystem</p>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Base Path</label>
                <Input
                  type="text"
                  value={localConfig.basePath}
                  onChange={(e) => setLocalConfig({ ...localConfig, basePath: e.target.value })}
                  placeholder="/var/skuldbot/storage"
                />
                <p className="text-xs text-zinc-500 mt-1">Absolute path where files will be stored</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Max File Size (MB)</label>
                <Input
                  type="number"
                  value={localConfig.maxFileSizeMb}
                  onChange={(e) => setLocalConfig({ ...localConfig, maxFileSizeMb: parseInt(e.target.value) || 0 })}
                  placeholder="100"
                />
              </div>

              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Not recommended for production</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Local storage is suitable for development. For production, use S3 or Azure Blob Storage for durability and scalability.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={onTest} disabled={testing}>
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Test Connection
              </Button>
              <Button onClick={onSave}>
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* S3 Config */}
      {activeProvider === 's3' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-[#FF9900]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#FF9900]" fill="currentColor">
                    <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 01-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 01-.287-.375 6.18 6.18 0 01-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.296.072-.583.16-.862.272a2.287 2.287 0 01-.28.104.488.488 0 01-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 01.224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 011.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 00-.735-.136 6.02 6.02 0 00-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 01-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 01.32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 01.311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 01-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 01-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 01-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 00.415-.758.777.777 0 00-.215-.559c-.144-.151-.416-.287-.807-.414l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 01-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 01.24.2.43.43 0 01.071.263v.375c0 .168-.064.256-.184.256a.83.83 0 01-.303-.096 3.652 3.652 0 00-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Amazon S3 / S3-Compatible</h3>
                  <p className="text-sm text-zinc-500">Works with AWS S3, MinIO, DigitalOcean Spaces, etc.</p>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Access Key ID</label>
                  <Input
                    type="text"
                    value={s3Config.accessKeyId}
                    onChange={(e) => setS3Config({ ...s3Config, accessKeyId: e.target.value })}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Secret Access Key</label>
                  <div className="relative">
                    <Input
                      type={showSecretKey ? 'text' : 'password'}
                      value={s3Config.secretAccessKey}
                      onChange={(e) => setS3Config({ ...s3Config, secretAccessKey: e.target.value })}
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Region</label>
                  <Select value={s3Config.region} onValueChange={(value) => setS3Config({ ...s3Config, region: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                      <SelectItem value="us-east-2">US East (Ohio)</SelectItem>
                      <SelectItem value="us-west-1">US West (N. California)</SelectItem>
                      <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                      <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                      <SelectItem value="eu-central-1">EU (Frankfurt)</SelectItem>
                      <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                      <SelectItem value="ap-northeast-1">Asia Pacific (Tokyo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Bucket Name</label>
                  <Input
                    type="text"
                    value={s3Config.bucket}
                    onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })}
                    placeholder="my-skuld-bucket"
                  />
                </div>
              </div>

              {/* S3-Compatible Options */}
              <div className="pt-4 border-t border-zinc-200">
                <p className="text-sm font-medium text-zinc-900 mb-3">S3-Compatible Service Options</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                      Custom Endpoint
                      <span className="text-zinc-400 font-normal ml-1">(optional)</span>
                    </label>
                    <Input
                      type="text"
                      value={s3Config.endpoint || ''}
                      onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })}
                      placeholder="https://minio.example.com"
                    />
                    <p className="text-xs text-zinc-500 mt-1">Leave empty for AWS S3. Set for MinIO, DigitalOcean Spaces, etc.</p>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Force Path Style</p>
                      <p className="text-xs text-zinc-500">Use path-style URLs instead of virtual-hosted style</p>
                    </div>
                    <Switch
                      checked={s3Config.forcePathStyle || false}
                      onCheckedChange={(checked) => setS3Config({ ...s3Config, forcePathStyle: checked })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between">
              <a
                href="https://console.aws.amazon.com/s3"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open AWS Console
              </a>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={onTest} disabled={testing}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
                <Button onClick={onSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Azure Blob Storage Config */}
      {activeProvider === 'azure_blob' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-[#0078D4]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#0078D4]" fill="currentColor">
                    <path d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.836 6.938L5.483 21.3zM13.049 2.7L6.89 15.697l-5.638 2.98L13.049 2.7z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Azure Blob Storage</h3>
                  <p className="text-sm text-zinc-500">Microsoft Azure cloud storage service</p>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Connection String</label>
                <div className="relative">
                  <Input
                    type={showConnectionString ? 'text' : 'password'}
                    value={azureConfig.connectionString}
                    onChange={(e) => setAzureConfig({ ...azureConfig, connectionString: e.target.value })}
                    placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConnectionString(!showConnectionString)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showConnectionString ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Find this in Azure Portal → Storage Account → Access Keys
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Account Name</label>
                  <Input
                    type="text"
                    value={azureConfig.accountName}
                    onChange={(e) => setAzureConfig({ ...azureConfig, accountName: e.target.value })}
                    placeholder="mystorageaccount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Container Name</label>
                  <Input
                    type="text"
                    value={azureConfig.containerName}
                    onChange={(e) => setAzureConfig({ ...azureConfig, containerName: e.target.value })}
                    placeholder="skuld-artifacts"
                  />
                </div>
              </div>

              {/* Alternative Auth */}
              <div className="pt-4 border-t border-zinc-200">
                <p className="text-sm font-medium text-zinc-900 mb-3">
                  Alternative Authentication
                  <span className="text-zinc-400 font-normal ml-1">(optional, if not using connection string)</span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Account Key</label>
                    <Input
                      type="password"
                      value={azureConfig.accountKey || ''}
                      onChange={(e) => setAzureConfig({ ...azureConfig, accountKey: e.target.value })}
                      placeholder="Account access key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">SAS Token</label>
                    <Input
                      type="password"
                      value={azureConfig.sasToken || ''}
                      onChange={(e) => setAzureConfig({ ...azureConfig, sasToken: e.target.value })}
                      placeholder="?sv=2020-08-04&ss=..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between">
              <a
                href="https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.Storage%2FStorageAccounts"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Azure Portal
              </a>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={onTest} disabled={testing}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
                <Button onClick={onSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function StatusBadge({ status }: { status: ProviderStatus }) {
  const config = {
    active: { label: 'Active', variant: 'success' as const, icon: CheckCircle2 },
    inactive: { label: 'Inactive', variant: 'secondary' as const, icon: AlertCircle },
    error: { label: 'Error', variant: 'destructive' as const, icon: XCircle },
    not_configured: { label: 'Not Configured', variant: 'outline' as const, icon: Settings2 },
  };

  const { label, variant, icon: Icon } = config[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
