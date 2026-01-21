'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Settings,
  Building2,
  Shield,
  Bell,
  Key,
  Database,
  Globe,
  Palette,
  Save,
} from 'lucide-react';

interface SettingsSection {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const settingsSections: SettingsSection[] = [
  {
    id: 'organization',
    title: 'Organization',
    description: 'Manage your organization details and branding',
    icon: Building2,
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Configure authentication and access controls',
    icon: Shield,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Set up alerts and notification preferences',
    icon: Bell,
  },
  {
    id: 'api-keys',
    title: 'API Keys',
    description: 'Manage API keys for external integrations',
    icon: Key,
  },
  {
    id: 'storage',
    title: 'Storage',
    description: 'Configure artifact storage and retention',
    icon: Database,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Connect external services and tools',
    icon: Globe,
  },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('organization');
  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // TODO: Save settings to API
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your organization settings and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <Card className="w-64 h-fit">
          <CardContent className="p-2">
            <nav className="space-y-1">
              {settingsSections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === section.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.title}
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>

        {/* Settings Content */}
        <div className="flex-1">
          {activeSection === 'organization' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organization Settings
                </CardTitle>
                <CardDescription>
                  Configure your organization&apos;s basic information and branding
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    placeholder="Enter organization name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="org-slug">Organization Slug</Label>
                  <Input
                    id="org-slug"
                    placeholder="my-organization"
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in URLs and API endpoints. Contact support to change.
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center">
                      <Palette className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <Button variant="outline" size="sm">
                      Upload Logo
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Configure authentication and security policies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-muted-foreground">
                        Require 2FA for all users in your organization
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Configure
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Single Sign-On (SSO)</p>
                      <p className="text-sm text-muted-foreground">
                        Configure SAML or OIDC authentication
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Setup SSO
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Session Timeout</p>
                      <p className="text-sm text-muted-foreground">
                        Set maximum session duration
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Configure
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">IP Allowlist</p>
                      <p className="text-sm text-muted-foreground">
                        Restrict access to specific IP addresses
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Manage IPs
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Settings
                </CardTitle>
                <CardDescription>
                  Configure how and when you receive alerts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Bot Execution Failures</p>
                      <p className="text-sm text-muted-foreground">
                        Get notified when bot runs fail
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Configure
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Runner Status Changes</p>
                      <p className="text-sm text-muted-foreground">
                        Alerts when runners go offline or come online
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Configure
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Webhook Integrations</p>
                      <p className="text-sm text-muted-foreground">
                        Send notifications to external services
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Add Webhook
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'api-keys' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Keys
                </CardTitle>
                <CardDescription>
                  Manage API keys for programmatic access
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Key className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No API keys</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm">
                    Create API keys to authenticate external applications and scripts.
                  </p>
                  <Button>
                    Create API Key
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'storage' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Storage Settings
                </CardTitle>
                <CardDescription>
                  Configure artifact storage and data retention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Storage Provider</p>
                      <p className="text-sm text-muted-foreground">
                        AWS S3, Azure Blob, or local storage
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Configure
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">Retention Policy</p>
                      <p className="text-sm text-muted-foreground">
                        How long to keep execution artifacts and logs
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Set Policy
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'integrations' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Integrations
                </CardTitle>
                <CardDescription>
                  Connect external services and tools
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No integrations configured</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm">
                    Connect Slack, Teams, or other tools to receive notifications and trigger bots.
                  </p>
                  <Button>
                    Browse Integrations
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
