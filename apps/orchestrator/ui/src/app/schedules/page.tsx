'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  useSchedules,
  useCreateSchedule,
  useTriggerSchedule,
  useDeleteSchedule,
  useActivateSchedule,
  useDisableSchedule,
  useBots,
  useRunners,
} from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime } from '@/lib/utils';
import { Calendar, Plus, MoreVertical, Play, Pause, Trash2, Clock } from 'lucide-react';
import Link from 'next/link';

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules();
  const { data: bots } = useBots();
  const { data: runners } = useRunners();

  const createMutation = useCreateSchedule();
  const triggerMutation = useTriggerSchedule();
  const deleteMutation = useDeleteSchedule();
  const activateMutation = useActivateSchedule();
  const disableMutation = useDisableSchedule();

  const { toast } = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [botId, setBotId] = useState('');
  const [triggerType, setTriggerType] = useState<'cron' | 'interval'>('cron');
  const [cronExpression, setCronExpression] = useState('0 * * * *');
  const [intervalMinutes, setIntervalMinutes] = useState('60');
  const [targetType, setTargetType] = useState<'any' | 'pinned'>('any');
  const [targetRunnerId, setTargetRunnerId] = useState('');

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const resetForm = () => {
    setName('');
    setDescription('');
    setBotId('');
    setTriggerType('cron');
    setCronExpression('0 * * * *');
    setIntervalMinutes('60');
    setTargetType('any');
    setTargetRunnerId('');
  };

  const handleCreateSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) {
      toast({
        variant: 'warning',
        title: 'Missing name',
        description: 'Schedule name is required.',
      });
      return;
    }

    if (!botId) {
      toast({
        variant: 'warning',
        title: 'Missing bot',
        description: 'Select a bot before creating the schedule.',
      });
      return;
    }

    if (triggerType === 'cron' && !cronExpression.trim()) {
      toast({
        variant: 'warning',
        title: 'Missing cron expression',
        description: 'Provide a valid cron expression.',
      });
      return;
    }

    const interval = Number(intervalMinutes);
    if (triggerType === 'interval' && (!Number.isFinite(interval) || interval < 1)) {
      toast({
        variant: 'warning',
        title: 'Invalid interval',
        description: 'Interval must be a number greater than 0.',
      });
      return;
    }

    if (targetType === 'pinned' && !targetRunnerId) {
      toast({
        variant: 'warning',
        title: 'Missing runner',
        description: 'Select a runner for pinned targeting.',
      });
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: normalizedName,
        description: normalizedDescription || undefined,
        botId,
        triggerType,
        cronExpression: triggerType === 'cron' ? cronExpression.trim() : undefined,
        intervalMinutes: triggerType === 'interval' ? interval : undefined,
        timezone,
        useLatestVersion: true,
        targetType,
        targetRunnerId: targetType === 'pinned' ? targetRunnerId : undefined,
      });

      toast({
        variant: 'success',
        title: 'Schedule created',
        description: `${normalizedName} has been created successfully.`,
      });

      setOpenCreate(false);
      resetForm();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create schedule',
        description:
          error instanceof Error ? error.message : 'Please verify your data and try again.',
      });
    }
  };

  const handleTrigger = async (id: string, scheduleName: string) => {
    try {
      await triggerMutation.mutateAsync(id);
      toast({
        variant: 'success',
        title: 'Schedule triggered',
        description: `${scheduleName} has been triggered successfully.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to trigger schedule. Please try again.',
      });
    }
  };

  const handleDelete = async (id: string, scheduleName: string) => {
    if (confirm('Are you sure you want to delete this schedule?')) {
      try {
        await deleteMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Schedule deleted',
          description: `${scheduleName} has been deleted successfully.`,
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to delete schedule. Please try again.',
        });
      }
    }
  };

  const handleToggleSchedule = async (id: string, scheduleName: string, status: string) => {
    try {
      if (status === 'active') {
        await disableMutation.mutateAsync({ id });
      } else {
        await activateMutation.mutateAsync({
          id,
          status: status as
            | 'paused'
            | 'draft'
            | 'disabled'
            | 'active'
            | 'expired'
            | 'error'
            | 'quota_exceeded',
        });
      }

      toast({
        variant: 'success',
        title: status === 'active' ? 'Schedule disabled' : 'Schedule activated',
        description: `${scheduleName} updated successfully.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to update schedule',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Schedules</h1>
            <p className="text-muted-foreground mt-1">Automate bot executions</p>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Schedule
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : schedules?.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground">No schedules yet</h3>
                <p className="text-muted-foreground mt-1">
                  Create a schedule to run bots automatically.
                </p>
                <Button className="mt-4" onClick={() => setOpenCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Schedule
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Bot</th>
                      <th>Trigger</th>
                      <th>Target</th>
                      <th>Status</th>
                      <th>Next Run</th>
                      <th>Last Run</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules?.map((schedule) => (
                      <ScheduleRow
                        key={schedule.id}
                        schedule={schedule}
                        onTrigger={() => handleTrigger(schedule.id, schedule.name)}
                        onToggle={() =>
                          handleToggleSchedule(schedule.id, schedule.name, schedule.status)
                        }
                        onDelete={() => handleDelete(schedule.id, schedule.name)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Schedule</DialogTitle>
            <DialogDescription>
              Configure trigger and runner targeting for automatic execution.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateSchedule}>
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Schedule Name</Label>
              <Input
                id="schedule-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Daily Claims Intake"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-description">Description</Label>
              <textarea
                id="schedule-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Optional notes for operators"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-bot">Bot</Label>
              <select
                id="schedule-bot"
                value={botId}
                onChange={(event) => setBotId(event.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select bot</option>
                {bots?.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="schedule-trigger">Trigger Type</Label>
                <select
                  id="schedule-trigger"
                  value={triggerType}
                  onChange={(event) => setTriggerType(event.target.value as 'cron' | 'interval')}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="cron">Cron</option>
                  <option value="interval">Interval</option>
                </select>
              </div>

              {triggerType === 'cron' ? (
                <div className="space-y-2">
                  <Label htmlFor="schedule-cron">Cron Expression</Label>
                  <Input
                    id="schedule-cron"
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    placeholder="0 * * * *"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="schedule-interval">Interval (minutes)</Label>
                  <Input
                    id="schedule-interval"
                    type="number"
                    min={1}
                    value={intervalMinutes}
                    onChange={(event) => setIntervalMinutes(event.target.value)}
                    placeholder="60"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-target">Target</Label>
              <select
                id="schedule-target"
                value={targetType}
                onChange={(event) => setTargetType(event.target.value as 'any' | 'pinned')}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="any">Any runner</option>
                <option value="pinned">Pinned runner</option>
              </select>
            </div>

            {targetType === 'pinned' && (
              <div className="space-y-2">
                <Label htmlFor="schedule-runner">Pinned Runner</Label>
                <select
                  id="schedule-runner"
                  value={targetRunnerId}
                  onChange={(event) => setTargetRunnerId(event.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select runner</option>
                  {runners?.map((runner) => (
                    <option key={runner.id} value={runner.id}>
                      {runner.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!bots?.length && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                You need at least one bot before creating schedules.
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpenCreate(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending} disabled={!bots?.length}>
                Create Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScheduleRow({
  schedule,
  onTrigger,
  onToggle,
  onDelete,
}: {
  schedule: {
    id: string;
    name: string;
    botId: string;
    cron: string;
    timezone: string;
    enabled: boolean;
    status: string;
    triggerType: string;
    targetType: string;
    pinnedRunnerId?: string;
    lastRunAt?: string;
    nextRunAt?: string;
  };
  onTrigger: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const targetLabel =
    {
      any: 'Any Runner',
      pool: 'Runner Pool',
      pinned: 'Pinned Runner',
      capability: 'By Capability',
      affinity: 'Affinity',
      round_robin: 'Round Robin',
      least_loaded: 'Least Loaded',
    }[schedule.targetType] || schedule.targetType;

  return (
    <tr>
      <td>
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{schedule.name}</span>
        </div>
      </td>
      <td>
        <Link
          href={`/bots/${schedule.botId}`}
          className="text-primary hover:text-primary/80 transition-colors"
        >
          {schedule.botId.slice(0, 8)}...
        </Link>
      </td>
      <td>
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <code className="text-sm bg-muted px-2 py-0.5 rounded">{schedule.cron}</code>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">{schedule.timezone}</span>
          <Badge variant="secondary">{schedule.triggerType}</Badge>
        </div>
      </td>
      <td className="text-sm text-muted-foreground">{targetLabel}</td>
      <td>
        <StatusBadge status={schedule.status} />
      </td>
      <td className="text-sm text-muted-foreground">
        {schedule.nextRunAt ? formatRelativeTime(schedule.nextRunAt) : '-'}
      </td>
      <td className="text-sm text-muted-foreground">
        {schedule.lastRunAt ? formatRelativeTime(schedule.lastRunAt) : 'Never'}
      </td>
      <td>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onTrigger}
            title="Run now"
            className="hover:bg-success/10"
          >
            <Play className="h-4 w-4 text-success" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onToggle}>
                {schedule.status === 'active' ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Disable
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Activate
                  </>
                )}
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
        </div>
      </td>
    </tr>
  );
}
