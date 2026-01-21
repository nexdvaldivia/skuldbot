import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Home,
  Settings,
  Key,
  FileText,
  Play,
  Square,
  RefreshCw,
  Wifi,
  WifiOff,
  Monitor,
  Cpu,
  HardDrive,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Activity,
  Server,
  Zap,
  Tag,
  Plus,
  X,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { Label } from './components/ui/label';
import { Separator } from './components/ui/separator';
import { cn } from './lib/utils';

// Types
interface RunnerStatus {
  running: boolean;
  pid: number | null;
  runner_id: string | null;
  orchestrator_connected: boolean;
  current_job: string | null;
  jobs_completed: number;
  jobs_failed: number;
  uptime_seconds: number;
}

interface RunnerConfig {
  orchestrator_url: string | null;
  api_key: string | null;
  runner_id: string | null;
  runner_name: string;
  labels: Record<string, string>;
  capabilities: string[];
  poll_interval: number;
  heartbeat_interval: number;
  job_timeout: number;
  work_dir: string;
  auto_start_service: boolean;
  start_minimized: boolean;
}

interface SystemInfo {
  os: string;
  platform: string;
  hostname: string;
  cpu_count: number;
  memory_total_gb: number;
}

type Page = 'dashboard' | 'config' | 'secrets' | 'logs';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [config, setConfig] = useState<RunnerConfig | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    await Promise.all([loadStatus(), loadConfig(), loadSystemInfo()]);
  }

  async function loadStatus() {
    try {
      const s = await invoke<RunnerStatus>('get_status');
      setStatus(s);
    } catch (e) {
      console.error('Failed to get status:', e);
    }
  }

  async function loadConfig() {
    try {
      const c = await invoke<RunnerConfig>('get_config');
      setConfig(c);
    } catch (e) {
      console.error('Failed to get config:', e);
    }
  }

  async function loadSystemInfo() {
    try {
      const info = await invoke<SystemInfo>('get_system_info');
      setSystemInfo(info);
    } catch (e) {
      console.error('Failed to get system info:', e);
    }
  }

  useEffect(() => {
    (window as unknown as { __startRunner: () => void }).__startRunner = () => handleStart();
    (window as unknown as { __stopRunner: () => void }).__stopRunner = () => handleStop();
    (window as unknown as { __restartRunner: () => void }).__restartRunner = () => handleRestart();
  }, []);

  async function handleStart() {
    try {
      await invoke('start_runner');
      await loadStatus();
    } catch (e) {
      alert('Failed to start: ' + e);
    }
  }

  async function handleStop() {
    try {
      await invoke('stop_runner');
      await loadStatus();
    } catch (e) {
      alert('Failed to stop: ' + e);
    }
  }

  async function handleRestart() {
    try {
      await invoke('restart_runner');
      await loadStatus();
    } catch (e) {
      alert('Failed to restart: ' + e);
    }
  }

  const navItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: Home },
    { id: 'config' as Page, label: 'Configuration', icon: Settings },
    { id: 'secrets' as Page, label: 'Secrets', icon: Key },
    { id: 'logs' as Page, label: 'Logs', icon: FileText },
  ];

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 border-r border-border/50 bg-card flex flex-col">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">SkuldBot Runner</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn(
                  "status-dot",
                  status?.running ? "status-online" : "status-offline"
                )} />
                <span className={cn(
                  "text-xs",
                  status?.running ? "text-[hsl(var(--success))]" : "text-muted-foreground"
                )}>
                  {status?.running ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <nav className="flex-1 p-3">
          <div className="space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  currentPage === item.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-border/50">
          <div className="flex gap-2">
            <Button
              onClick={handleStart}
              disabled={status?.running}
              variant="success"
              size="sm"
              className="flex-1"
            >
              <Play className="w-3.5 h-3.5" />
              Start
            </Button>
            <Button
              onClick={handleStop}
              disabled={!status?.running}
              variant="destructive"
              size="sm"
              className="flex-1"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </Button>
            <Button
              onClick={handleRestart}
              disabled={!status?.running}
              variant="outline"
              size="icon"
              className="h-8 w-8"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-5xl mx-auto">
          {currentPage === 'dashboard' && (
            <DashboardPage status={status} config={config} systemInfo={systemInfo} onRefresh={loadData} />
          )}
          {currentPage === 'config' && (
            <ConfigPage config={config} onSave={loadConfig} />
          )}
          {currentPage === 'secrets' && (
            <SecretsPage />
          )}
          {currentPage === 'logs' && (
            <LogsPage />
          )}
        </div>
      </main>
    </div>
  );
}

function DashboardPage({
  status,
  config,
  systemInfo,
  onRefresh
}: {
  status: RunnerStatus | null;
  config: RunnerConfig | null;
  systemInfo: SystemInfo | null;
  onRefresh: () => void;
}) {
  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
  }

  function formatMemory(gb: number | undefined): string {
    if (!gb) return '-';
    return gb.toFixed(1) + ' GB';
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor your runner status and activity
          </p>
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {!config?.orchestrator_url && (
        <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">Configuration Required</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please configure the Orchestrator URL and register this runner to start receiving jobs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                status?.running 
                  ? "bg-[hsl(var(--success))]/10" 
                  : "bg-muted"
              )}>
                {status?.running ? (
                  <Wifi className="w-5 h-5 text-[hsl(var(--success))]" />
                ) : (
                  <WifiOff className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</p>
                <p className={cn(
                  "text-lg font-semibold",
                  status?.running ? "text-[hsl(var(--success))]" : "text-muted-foreground"
                )}>
                  {status?.running ? 'Running' : 'Stopped'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Uptime</p>
                <p className="text-lg font-semibold text-foreground">
                  {status?.running ? formatUptime(status.uptime_seconds) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-[hsl(var(--success))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Completed</p>
                <p className="text-lg font-semibold text-foreground">{status?.jobs_completed ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Failed</p>
                <p className="text-lg font-semibold text-foreground">{status?.jobs_failed ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {status?.current_job && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Current Job</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <code className="text-sm font-mono text-muted-foreground">{status.current_job}</code>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Runner Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <InfoRow label="Runner ID" value={config?.runner_id || status?.runner_id || '-'} mono />
              <InfoRow label="Name" value={config?.runner_name || '-'} />
              <InfoRow label="Orchestrator" value={config?.orchestrator_url || 'Not configured'} truncate />
              <InfoRow label="API Key" value={config?.api_key ? '********' : 'Not set'} />
              <InfoRow
                label="Capabilities"
                value={
                  config?.capabilities?.length
                    ? <div className="flex gap-1 flex-wrap justify-end">
                        {config.capabilities.map(cap => (
                          <Badge key={cap} variant="secondary" className="text-xs">{cap}</Badge>
                        ))}
                      </div>
                    : '-'
                }
              />
              <InfoRow
                label={<span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5" />Labels</span>}
                value={
                  config?.labels && Object.keys(config.labels).length > 0
                    ? <div className="flex gap-1 flex-wrap justify-end">
                        {Object.entries(config.labels).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs font-mono">
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    : '-'
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">System Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <InfoRow 
                label={<span className="flex items-center gap-2"><Monitor className="w-3.5 h-3.5" />OS</span>} 
                value={systemInfo?.os ? systemInfo.os.charAt(0).toUpperCase() + systemInfo.os.slice(1) : '-'} 
              />
              <InfoRow 
                label={<span className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5" />CPU Cores</span>} 
                value={systemInfo?.cpu_count || '-'} 
              />
              <InfoRow 
                label={<span className="flex items-center gap-2"><HardDrive className="w-3.5 h-3.5" />Memory</span>} 
                value={formatMemory(systemInfo?.memory_total_gb)} 
              />
              <InfoRow label="Hostname" value={systemInfo?.hostname || '-'} />
              <InfoRow label="Architecture" value={systemInfo?.platform || '-'} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ 
  label, 
  value, 
  mono, 
  truncate 
}: { 
  label: React.ReactNode; 
  value: React.ReactNode; 
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        mono && "font-mono text-xs",
        truncate && "truncate max-w-[180px]",
        "text-foreground"
      )}>
        {value}
      </span>
    </div>
  );
}

function LabelsEditor({
  labels,
  onChange,
}: {
  labels: Record<string, string>;
  onChange: (labels: Record<string, string>) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const entries = Object.entries(labels);

  function handleAdd() {
    if (!newKey.trim()) return;
    onChange({ ...labels, [newKey.trim()]: newValue.trim() });
    setNewKey('');
    setNewValue('');
  }

  function handleRemove(key: string) {
    const newLabels = { ...labels };
    delete newLabels[key];
    onChange(newLabels);
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 group">
              <Badge variant="secondary" className="font-mono text-xs px-2 py-1">
                {key}
              </Badge>
              <span className="text-muted-foreground">=</span>
              <span className="text-sm text-foreground flex-1">{value}</span>
              <button
                onClick={() => handleRemove(key)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
              >
                <X className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Key (e.g., environment)"
          className="flex-1"
        />
        <Input
          type="text"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Value (e.g., production)"
          className="flex-1"
        />
        <Button
          onClick={handleAdd}
          disabled={!newKey.trim()}
          variant="outline"
          size="icon"
          className="shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No labels configured. Add labels to enable targeted bot execution.
        </p>
      )}
    </div>
  );
}

function ConfigPage({ config, onSave }: { config: RunnerConfig | null; onSave: () => void }) {
  const [formData, setFormData] = useState<Partial<RunnerConfig>>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  async function handleTestConnection() {
    if (!formData.orchestrator_url) return;
    setTesting(true);
    try {
      const success = await invoke<boolean>('test_connection', { url: formData.orchestrator_url });
      alert(success ? 'Connection successful!' : 'Connection failed');
    } catch (e) {
      alert('Connection failed: ' + e);
    }
    setTesting(false);
  }

  async function handleSave() {
    try {
      await invoke('save_config', { newConfig: formData });
      alert('Configuration saved. Restart the service to apply changes.');
      onSave();
    } catch (e) {
      alert('Failed to save: ' + e);
    }
  }

  async function handleRegister() {
    if (!formData.orchestrator_url || !formData.runner_name) {
      alert('Please enter Orchestrator URL and Runner Name');
      return;
    }

    setRegistering(true);
    try {
      const result = await invoke<{ api_key?: string; runner_id?: string }>('register_runner', {
        orchestratorUrl: formData.orchestrator_url,
        name: formData.runner_name,
        labels: formData.labels || {},
        capabilities: formData.capabilities || ['web', 'desktop', 'office'],
      });

      if (result.api_key) {
        setFormData(prev => ({
          ...prev,
          api_key: result.api_key,
          runner_id: result.runner_id,
        }));
        alert('Registration successful! API Key has been saved.');
        setShowRegisterModal(false);
      }
    } catch (e) {
      alert('Registration failed: ' + e);
    }
    setRegistering(false);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your runner settings and connection
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Wifi className="w-4 h-4 text-primary" />
            Orchestrator Connection
          </CardTitle>
          <CardDescription>
            Connect this runner to your SkuldBot Orchestrator
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orchestrator_url">Orchestrator URL</Label>
            <div className="flex gap-2">
              <Input
                id="orchestrator_url"
                type="url"
                value={formData.orchestrator_url || ''}
                onChange={e => setFormData(prev => ({ ...prev, orchestrator_url: e.target.value }))}
                placeholder="https://orchestrator.example.com"
                className="flex-1"
              />
              <Button
                onClick={handleTestConnection}
                disabled={testing || !formData.orchestrator_url}
                variant="outline"
              >
                {testing ? 'Testing...' : 'Test'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api_key">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="api_key"
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.api_key || ''}
                  onChange={e => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="skr_..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={() => setShowRegisterModal(true)}>
                Register
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Click Register to get an API Key from the Orchestrator
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Runner Identity
          </CardTitle>
          <CardDescription>
            Configure how this runner identifies itself
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="runner_name">Runner Name</Label>
            <Input
              id="runner_name"
              type="text"
              value={formData.runner_name || ''}
              onChange={e => setFormData(prev => ({ ...prev, runner_name: e.target.value }))}
              placeholder="My Runner"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capabilities">Capabilities</Label>
            <Input
              id="capabilities"
              type="text"
              value={formData.capabilities?.join(', ') || ''}
              onChange={e => setFormData(prev => ({
                ...prev,
                capabilities: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              }))}
              placeholder="web, desktop, office"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of capabilities (web, desktop, office, sap, email, ocr, gpu)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            Labels
          </CardTitle>
          <CardDescription>
            Key-value pairs for targeting specific runners. Bots can specify labels to run only on matching runners.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LabelsEditor
            labels={formData.labels || {}}
            onChange={(labels) => setFormData(prev => ({ ...prev, labels }))}
          />
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Example:</span> Use labels like{' '}
                <code className="bg-muted px-1 rounded">environment: production</code>,{' '}
                <code className="bg-muted px-1 rounded">department: finance</code>, or{' '}
                <code className="bg-muted px-1 rounded">sap: installed</code> to target bots to this specific runner.
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Timing Settings
          </CardTitle>
          <CardDescription>
            Configure polling and timeout intervals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="poll_interval">Poll Interval (s)</Label>
              <Input
                id="poll_interval"
                type="number"
                value={formData.poll_interval || 5}
                onChange={e => setFormData(prev => ({ ...prev, poll_interval: parseInt(e.target.value) }))}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heartbeat_interval">Heartbeat (s)</Label>
              <Input
                id="heartbeat_interval"
                type="number"
                value={formData.heartbeat_interval || 30}
                onChange={e => setFormData(prev => ({ ...prev, heartbeat_interval: parseInt(e.target.value) }))}
                min={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_timeout">Job Timeout (s)</Label>
              <Input
                id="job_timeout"
                type="number"
                value={formData.job_timeout || 3600}
                onChange={e => setFormData(prev => ({ ...prev, job_timeout: parseInt(e.target.value) }))}
                min={60}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg">
          Save Configuration
        </Button>
      </div>

      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <Card className="w-full max-w-md mx-4 animate-scale-in">
            <CardHeader>
              <CardTitle>Register Runner</CardTitle>
              <CardDescription>
                This will register this runner with the Orchestrator and obtain an API key.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Orchestrator:</span>
                  <span className="font-mono text-xs truncate max-w-[200px]">{formData.orchestrator_url}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Runner Name:</span>
                  <span>{formData.runner_name}</span>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button onClick={() => setShowRegisterModal(false)} variant="outline">
                  Cancel
                </Button>
                <Button onClick={handleRegister} disabled={registering}>
                  {registering ? 'Registering...' : 'Register'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

interface SecretMetadata {
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function SecretsPage() {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSecret, setEditingSecret] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState({ key: '', value: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSecrets();
  }, []);

  async function loadSecrets() {
    setLoading(true);
    try {
      const list = await invoke<SecretMetadata[]>('list_secrets');
      setSecrets(list);
    } catch (e) {
      console.error('Failed to load secrets:', e);
    }
    setLoading(false);
  }

  async function handleSaveSecret() {
    if (!newSecret.key.trim()) return;
    setSaving(true);
    try {
      await invoke('set_secret', {
        key: newSecret.key.trim(),
        value: newSecret.value,
        description: newSecret.description.trim() || null,
      });
      setNewSecret({ key: '', value: '', description: '' });
      setShowAddModal(false);
      setEditingSecret(null);
      await loadSecrets();
    } catch (e) {
      alert('Failed to save secret: ' + e);
    }
    setSaving(false);
  }

  async function handleDeleteSecret(key: string) {
    if (!confirm(`Are you sure you want to delete "${key}"?`)) return;
    try {
      await invoke('delete_secret', { key });
      await loadSecrets();
    } catch (e) {
      alert('Failed to delete secret: ' + e);
    }
  }

  function handleEditSecret(secret: SecretMetadata) {
    setEditingSecret(secret.name);
    setNewSecret({
      key: secret.name,
      value: '',
      description: secret.description || '',
    });
    setShowAddModal(true);
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Secrets Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage encrypted secrets for your bots
          </p>
        </div>
        <Button onClick={() => { setEditingSecret(null); setNewSecret({ key: '', value: '', description: '' }); setShowAddModal(true); }}>
          <Plus className="w-4 h-4" />
          Add Secret
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            Stored Secrets
          </CardTitle>
          <CardDescription>
            Values are stored securely in the OS keychain and never displayed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
              <p className="text-sm">Loading secrets...</p>
            </div>
          ) : secrets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No secrets configured yet.</p>
              <p className="text-xs mt-1">Click "Add Secret" to create your first secret.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {secrets.map(secret => (
                <div key={secret.name} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-accent/30 group transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Key className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-mono text-sm font-medium text-foreground">{secret.name}</p>
                      {secret.description && (
                        <p className="text-xs text-muted-foreground">{secret.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDate(secret.updated_at)}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditSecret(secret)}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteSecret(secret.name)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            How to Use Secrets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">In Bot DSL</p>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">
{'${vault.my_secret_key}\n${secret:api_credentials}'}
            </pre>
          </div>
          <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Security Note:</span> Secrets are stored in your operating system's secure keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). They are resolved at runtime and never sent to the Orchestrator.
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <Card className="w-full max-w-md mx-4 animate-scale-in">
            <CardHeader>
              <CardTitle>{editingSecret ? 'Update Secret' : 'Add Secret'}</CardTitle>
              <CardDescription>
                {editingSecret
                  ? 'Enter a new value for this secret. Leave empty to keep the current value.'
                  : 'Create a new secret. Values are stored securely in your OS keychain.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="secret_key">Secret Key</Label>
                <Input
                  id="secret_key"
                  type="text"
                  value={newSecret.key}
                  onChange={e => setNewSecret(prev => ({ ...prev, key: e.target.value }))}
                  placeholder="e.g., API_KEY, DB_PASSWORD"
                  disabled={!!editingSecret}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret_value">Secret Value</Label>
                <Input
                  id="secret_value"
                  type="password"
                  value={newSecret.value}
                  onChange={e => setNewSecret(prev => ({ ...prev, value: e.target.value }))}
                  placeholder={editingSecret ? '(leave empty to keep current)' : 'Enter secret value'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret_description">Description (optional)</Label>
                <Input
                  id="secret_description"
                  type="text"
                  value={newSecret.description}
                  onChange={e => setNewSecret(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., Production API key for SAP"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button onClick={() => setShowAddModal(false)} variant="outline">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveSecret}
                  disabled={saving || (!editingSecret && !newSecret.key.trim())}
                >
                  {saving ? 'Saving...' : editingSecret ? 'Update' : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function LogsPage() {
  const [logs] = useState<{ timestamp: string; level: string; message: string }[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Execution Logs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time execution logs from the runner
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">Auto-scroll</span>
          </label>
          <Button variant="outline" size="sm">Clear</Button>
          <Button variant="outline" size="sm">Export</Button>
        </div>
      </div>

      <Card className="bg-[#0d1117] border-[#30363d]">
        <div className="px-4 py-2 border-b border-[#30363d] flex items-center justify-between">
          <span className="text-xs text-[#3fb950] flex items-center gap-2">
            <span className="w-2 h-2 bg-[#3fb950] rounded-full animate-pulse" />
            Live
          </span>
          <span className="text-xs text-[#8b949e]">{logs.length} entries</span>
        </div>
        <div className="h-[400px] overflow-y-auto p-4 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#8b949e]">
              <FileText className="w-10 h-10 mb-3 opacity-50" />
              <p>Waiting for logs...</p>
              <p className="text-xs mt-1">Start the runner to see execution logs</p>
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="py-1 hover:bg-[#161b22] px-2 rounded">
                <span className="text-[#8b949e]">[{log.timestamp}]</span>
                <span className={cn(
                  "ml-2",
                  log.level === 'error' ? 'text-[#f85149]' :
                  log.level === 'warn' ? 'text-[#d29922]' :
                  'text-[#58a6ff]'
                )}>[{log.level.toUpperCase()}]</span>
                <span className="text-[#c9d1d9] ml-2">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

export default App;
