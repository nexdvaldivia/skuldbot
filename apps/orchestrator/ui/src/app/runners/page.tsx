'use client';

import { FormEvent, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useRunners,
  useDeleteRunner,
  useCreateRunner,
  useRegenerateRunnerKey,
} from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime } from '@/lib/utils';
import { Server, Plus, MoreVertical, Trash2, Key, RefreshCw, Cpu, HardDrive } from 'lucide-react';
import Link from 'next/link';

function parseCapabilities(rawValue: string): string[] | undefined {
  const values = rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function parseLabels(rawValue: string): Record<string, string> | undefined {
  const labels = rawValue
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const [keyPart, ...valueParts] = pair.split('=');
      const key = keyPart?.trim();
      const value = valueParts.join('=').trim();

      if (key && value) {
        acc[key] = value;
      }

      return acc;
    }, {});

  return Object.keys(labels).length > 0 ? labels : undefined;
}

export default function RunnersPage() {
  const { data: runners, isLoading, refetch } = useRunners();
  const createMutation = useCreateRunner();
  const regenerateMutation = useRegenerateRunnerKey();
  const deleteMutation = useDeleteRunner();
  const { toast } = useToast();

  const [openRegister, setOpenRegister] = useState(false);
  const [openApiKey, setOpenApiKey] = useState(false);
  const [runnerName, setRunnerName] = useState('');
  const [capabilitiesInput, setCapabilitiesInput] = useState('');
  const [labelsInput, setLabelsInput] = useState('');
  const [agentVersion, setAgentVersion] = useState('');
  const [hostname, setHostname] = useState('');
  const [osName, setOsName] = useState('');
  const [apiKey, setApiKey] = useState('');

  const resetForm = () => {
    setRunnerName('');
    setCapabilitiesInput('');
    setLabelsInput('');
    setAgentVersion('');
    setHostname('');
    setOsName('');
  };

  const handleRegisterRunner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = runnerName.trim();
    if (!normalizedName) {
      toast({
        variant: 'warning',
        title: 'Missing name',
        description: 'Runner name is required.',
      });
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        name: normalizedName,
        capabilities: parseCapabilities(capabilitiesInput),
        labels: parseLabels(labelsInput),
        agentVersion: agentVersion.trim() || undefined,
        systemInfo:
          hostname.trim() || osName.trim()
            ? {
                hostname: hostname.trim() || undefined,
                os: osName.trim() || undefined,
              }
            : undefined,
      });

      setOpenRegister(false);
      resetForm();

      setApiKey(result.apiKey);
      setOpenApiKey(true);

      toast({
        variant: 'success',
        title: 'Runner registered',
        description: `${normalizedName} has been registered successfully.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to register runner',
        description:
          error instanceof Error ? error.message : 'Please verify your data and try again.',
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm('Are you sure you want to delete this runner?')) {
      try {
        await deleteMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Runner deleted',
          description: `${name} has been deleted successfully.`,
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to delete runner. Please try again.',
        });
      }
    }
  };

  const handleRegenerateKey = async (id: string, name: string) => {
    try {
      const result = await regenerateMutation.mutateAsync(id);
      setApiKey(result.apiKey);
      setOpenApiKey(true);
      toast({
        variant: 'success',
        title: 'Runner key regenerated',
        description: `New API key generated for ${name}.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to regenerate key',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: 'Refreshed',
      description: 'Runner list has been refreshed.',
    });
  };

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      toast({
        variant: 'success',
        title: 'API key copied',
        description: 'The key was copied to clipboard.',
      });
    } catch {
      toast({
        variant: 'warning',
        title: 'Clipboard unavailable',
        description: 'Copy failed. Please copy the key manually.',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Runners</h1>
            <p className="text-muted-foreground mt-1">Manage bot execution agents</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => setOpenRegister(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Runner
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : runners?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Server className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">No runners registered</h3>
              <p className="text-muted-foreground mt-1">
                Install and configure the runner agent on your machines.
              </p>
              <Button className="mt-4" onClick={() => setOpenRegister(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Runner
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {runners?.map((runner) => (
              <RunnerCard
                key={runner.id}
                runner={runner}
                onDelete={() => handleDelete(runner.id, runner.name)}
                onRegenerateKey={() => handleRegenerateKey(runner.id, runner.name)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={openRegister} onOpenChange={setOpenRegister}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Runner</DialogTitle>
            <DialogDescription>
              Create a runner identity and generate its one-time API key.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleRegisterRunner}>
            <div className="space-y-2">
              <Label htmlFor="runner-name">Runner Name</Label>
              <Input
                id="runner-name"
                value={runnerName}
                onChange={(event) => setRunnerName(event.target.value)}
                placeholder="orchestrator-us-east-01"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="runner-capabilities">Capabilities (comma separated)</Label>
              <Input
                id="runner-capabilities"
                value={capabilitiesInput}
                onChange={(event) => setCapabilitiesInput(event.target.value)}
                placeholder="web.browser, desktop.automation, ai.llm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="runner-labels">Labels (key=value, comma separated)</Label>
              <Input
                id="runner-labels"
                value={labelsInput}
                onChange={(event) => setLabelsInput(event.target.value)}
                placeholder="env=prod, region=us-east-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="runner-agent-version">Agent Version</Label>
                <Input
                  id="runner-agent-version"
                  value={agentVersion}
                  onChange={(event) => setAgentVersion(event.target.value)}
                  placeholder="0.1.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="runner-hostname">Hostname</Label>
                <Input
                  id="runner-hostname"
                  value={hostname}
                  onChange={(event) => setHostname(event.target.value)}
                  placeholder="runner-host-01"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="runner-os">Operating System</Label>
              <Input
                id="runner-os"
                value={osName}
                onChange={(event) => setOsName(event.target.value)}
                placeholder="Linux"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenRegister(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Register Runner
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openApiKey} onOpenChange={setOpenApiKey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Runner API Key</DialogTitle>
            <DialogDescription>Store this key securely. It is shown only once.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label htmlFor="runner-api-key">API Key</Label>
            <Input id="runner-api-key" value={apiKey} readOnly />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCopyKey}>
              Copy Key
            </Button>
            <Button type="button" onClick={() => setOpenApiKey(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RunnerCard({
  runner,
  onDelete,
  onRegenerateKey,
}: {
  runner: {
    id: string;
    name: string;
    status: string;
    labels?: Record<string, string>;
    capabilities?: string[];
    currentRunId?: string;
    lastHeartbeat?: string;
    systemInfo?: {
      hostname: string;
      os: string;
      cpuCount: number;
      memoryTotalMb: number;
    };
  };
  onDelete: () => void;
  onRegenerateKey: () => void;
}) {
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-success/10';
      case 'busy':
        return 'bg-warning/10';
      default:
        return 'bg-muted';
    }
  };

  const getIconStyles = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-success';
      case 'busy':
        return 'text-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${getStatusStyles(runner.status)}`}>
            <Server className={`h-5 w-5 ${getIconStyles(runner.status)}`} />
          </div>
          <div>
            <span className="font-semibold text-foreground">{runner.name}</span>
            <p className="text-xs text-muted-foreground">
              {runner.systemInfo?.hostname || runner.id.slice(0, 8)}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRegenerateKey}>
              <Key className="h-4 w-4 mr-2" />
              Regenerate Key
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={runner.status} />
          {runner.lastHeartbeat && (
            <span className="text-xs text-muted-foreground">
              Last seen {formatRelativeTime(runner.lastHeartbeat)}
            </span>
          )}
        </div>

        {runner.systemInfo && (
          <div className="flex items-center space-x-4 text-xs text-muted-foreground mb-4">
            <div className="flex items-center">
              <Cpu className="h-3 w-3 mr-1" />
              {runner.systemInfo.cpuCount || 0} CPU
            </div>
            <div className="flex items-center">
              <HardDrive className="h-3 w-3 mr-1" />
              {Math.round((runner.systemInfo.memoryTotalMb || 0) / 1024)} GB
            </div>
            <div>{runner.systemInfo.os}</div>
          </div>
        )}

        {runner.capabilities && runner.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {runner.capabilities.slice(0, 4).map((cap) => (
              <Badge key={cap} variant="default">
                {cap}
              </Badge>
            ))}
            {runner.capabilities.length > 4 && (
              <Badge variant="default">+{runner.capabilities.length - 4}</Badge>
            )}
          </div>
        )}

        {runner.currentRunId && (
          <div className="mt-4 p-2 bg-primary/5 rounded-lg border border-primary/20 text-xs text-primary">
            Running:{' '}
            <Link href={`/runs/${runner.currentRunId}`} className="font-medium hover:underline">
              {runner.currentRunId.slice(0, 8)}...
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
