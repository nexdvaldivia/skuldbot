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
  User,
  Building2,
  Bell,
  Shield,
  Key,
  Mail,
  Globe,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Plug,
  CreditCard,
  HardDrive,
  ChevronRight,
} from 'lucide-react';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'api', label: 'API Keys', icon: Key },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-zinc-500 mt-1">Manage your account and preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Tabs */}
        <div className="lg:w-56 shrink-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-[#35d399] text-white'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Success Message */}
          {saved && (
            <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Settings saved successfully</span>
            </div>
          )}

          {activeTab === 'profile' && <ProfileSettings onSave={handleSave} />}
          {activeTab === 'organization' && <OrganizationSettings onSave={handleSave} />}
          {activeTab === 'integrations' && <IntegrationsOverview />}
          {activeTab === 'notifications' && <NotificationSettings onSave={handleSave} />}
          {activeTab === 'security' && <SecuritySettings onSave={handleSave} />}
          {activeTab === 'api' && <ApiSettings />}
        </div>
      </div>
    </div>
  );
}

function ProfileSettings({ onSave }: { onSave: () => void }) {
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Profile Information</h2>
        <p className="text-sm text-zinc-500 mb-6">Update your personal details</p>

        <div className="space-y-6">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 rounded-full bg-linear-to-br from-[#35d399] to-[#059669] flex items-center justify-center text-white font-semibold text-2xl">
              AU
            </div>
            <div>
              <Button variant="outline">
                Change Avatar
              </Button>
              <p className="text-xs text-zinc-500 mt-2">JPG, PNG or GIF. Max 2MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">First Name</label>
              <Input type="text" defaultValue="Admin" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Last Name</label>
              <Input type="text" defaultValue="User" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input type="email" defaultValue="admin@skuld.com" className="pl-10" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Timezone</label>
            <Select defaultValue="America/New_York">
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex justify-end">
            <Button onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationSettings({ onSave }: { onSave: () => void }) {
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Organization Settings</h2>
        <p className="text-sm text-zinc-500 mb-6">Manage your Skuld organization settings</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Organization Name</label>
            <Input type="text" defaultValue="Skuld, LLC" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Support Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input type="email" defaultValue="support@skuld.com" className="pl-10" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Website</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input type="url" defaultValue="https://skuldbot.com" className="pl-10" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Default Timezone</label>
            <Select defaultValue="America/New_York">
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex justify-end">
            <Button onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationSettings({ onSave }: { onSave: () => void }) {
  const [emailNotifications, setEmailNotifications] = useState({
    newClient: true,
    licenseExpiring: true,
    billingAlerts: true,
    systemUpdates: false,
    marketplaceSubmissions: true,
  });

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Notification Preferences</h2>
        <p className="text-sm text-zinc-500 mb-6">Choose what notifications you want to receive</p>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-900">Email Notifications</h3>

          {[
            { key: 'newClient', label: 'New Client Signups', description: 'Get notified when a new client registers' },
            { key: 'licenseExpiring', label: 'License Expiration Alerts', description: 'Receive alerts before licenses expire' },
            { key: 'billingAlerts', label: 'Billing Alerts', description: 'Get notified about billing issues and payments' },
            { key: 'systemUpdates', label: 'System Updates', description: 'Receive updates about platform changes' },
            { key: 'marketplaceSubmissions', label: 'Marketplace Submissions', description: 'Get notified when partners submit new bots' },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                <p className="text-sm text-zinc-500">{item.description}</p>
              </div>
              <Switch
                checked={emailNotifications[item.key as keyof typeof emailNotifications]}
                onCheckedChange={(checked) =>
                  setEmailNotifications((prev) => ({ ...prev, [item.key]: checked }))
                }
              />
            </div>
          ))}

          <div className="pt-4 border-t border-zinc-100 flex justify-end">
            <Button onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Preferences
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SecuritySettings({ onSave }: { onSave: () => void }) {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  return (
    <div className="space-y-6">
      {/* Password Change */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">Change Password</h2>
          <p className="text-sm text-zinc-500 mb-6">Update your password to keep your account secure</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Current Password</label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? 'text' : 'password'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">New Password</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Confirm New Password</label>
              <Input type="password" />
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={onSave}>
                Update Password
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MFA */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 mb-1">Two-Factor Authentication</h2>
              <p className="text-sm text-zinc-500">Add an extra layer of security to your account</p>
            </div>
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Enabled
            </Badge>
          </div>

          <div className="mt-4 p-4 rounded-lg bg-zinc-50 border border-zinc-100">
            <p className="text-sm text-zinc-600">
              Two-factor authentication is currently enabled using an authenticator app.
            </p>
            <Button variant="link" className="mt-2 p-0 h-auto text-red-600 hover:text-red-700">
              Disable 2FA
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">Active Sessions</h2>
          <p className="text-sm text-zinc-500 mb-4">Manage your active sessions across devices</p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Globe className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">Chrome on macOS</p>
                  <p className="text-xs text-zinc-500">Current session • San Francisco, US</p>
                </div>
              </div>
              <span className="text-xs text-emerald-600 font-medium">Active now</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                  <Globe className="h-5 w-5 text-zinc-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">Safari on iPhone</p>
                  <p className="text-xs text-zinc-500">Last active 2 hours ago • New York, US</p>
                </div>
              </div>
              <Button variant="link" className="p-0 h-auto text-red-600 hover:text-red-700">
                Revoke
              </Button>
            </div>
          </div>

          <Button variant="link" className="mt-4 p-0 h-auto text-red-600 hover:text-red-700">
            Sign out of all other sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ApiSettings() {
  const [showKey, setShowKey] = useState(false);
  const apiKey = 'sk_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456';

  return (
    <div className="space-y-6">
      {/* Current API Key */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">API Keys</h2>
          <p className="text-sm text-zinc-500 mb-6">Manage your API keys for programmatic access</p>

          <div className="p-4 rounded-lg border border-zinc-200 bg-zinc-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-900">Production Key</span>
              <span className="text-xs text-zinc-500">Created Jan 15, 2024</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-white px-3 py-2 rounded-lg border border-zinc-200 font-mono text-zinc-700 truncate">
                {showKey ? apiKey : '••••••••••••••••••••••••••••••••'}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200">
            <AlertCircle className="h-4 w-4 text-warning-600 mt-0.5 shrink-0" />
            <p className="text-sm text-warning-800">
              Keep your API keys secret. Do not share them in public repositories or client-side code.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button>
              <Key className="h-4 w-4 mr-2" />
              Generate New Key
            </Button>
            <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
              Revoke Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">Webhooks</h2>
          <p className="text-sm text-zinc-500 mb-6">Configure webhook endpoints for real-time events</p>

          <div className="text-center py-8">
            <Globe className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-900">No webhooks configured</p>
            <p className="text-sm text-zinc-500 mt-1">Add a webhook endpoint to receive event notifications</p>
            <Button variant="outline" className="mt-4">
              Add Webhook
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsOverview() {
  const integrations = [
    {
      id: 'payment',
      name: 'Payments',
      description: 'Configure payment processing with Stripe',
      icon: CreditCard,
      providers: ['Stripe'],
      status: 'not_configured' as const,
      color: 'bg-violet-50 text-violet-600',
    },
    {
      id: 'email',
      name: 'Email',
      description: 'Set up email delivery via SendGrid or Microsoft Graph',
      icon: Mail,
      providers: ['SendGrid', 'Microsoft Graph'],
      status: 'not_configured' as const,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      id: 'storage',
      name: 'Storage',
      description: 'Configure file storage for artifacts and evidence packs',
      icon: HardDrive,
      providers: ['Local', 'Amazon S3', 'Azure Blob'],
      status: 'not_configured' as const,
      color: 'bg-amber-50 text-amber-600',
    },
  ];

  const getStatusBadge = (status: 'active' | 'not_configured' | 'error') => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Active
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
            <AlertCircle className="h-3 w-3" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
            Not Configured
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">Service Integrations</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Configure external service providers for payments, email delivery, and file storage
          </p>

          <div className="space-y-4">
            {integrations.map((integration) => {
              const Icon = integration.icon;
              return (
                <Link
                  key={integration.id}
                  href="/settings/integrations"
                  className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-lg ${integration.color} flex items-center justify-center`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-zinc-900">{integration.name}</h3>
                        {getStatusBadge(integration.status)}
                      </div>
                      <p className="text-sm text-zinc-500 mt-0.5">{integration.description}</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        Providers: {integration.providers.join(', ')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-900">Need help setting up integrations?</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Check our documentation for step-by-step guides on configuring each provider.
              </p>
              <a
                href="https://docs.skuld.io/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium mt-2"
              >
                View Documentation
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
