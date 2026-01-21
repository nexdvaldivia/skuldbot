'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSchedules, useTriggerSchedule, useDeleteSchedule } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime } from '@/lib/utils';
import {
  Calendar,
  Plus,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Edit,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules();
  const triggerMutation = useTriggerSchedule();
  const deleteMutation = useDeleteSchedule();
  const { toast } = useToast();

  const handleTrigger = async (id: string, name: string) => {
    try {
      await triggerMutation.mutateAsync(id);
      toast({
        variant: 'success',
        title: 'Schedule triggered',
        description: `${name} has been triggered successfully.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to trigger schedule. Please try again.',
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm('Are you sure you want to delete this schedule?')) {
      try {
        await deleteMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Schedule deleted',
          description: `${name} has been deleted successfully.`,
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Schedules</h1>
          <p className="text-muted-foreground mt-1">Automate bot executions</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Schedule
        </Button>
      </div>

      {/* Schedules list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : schedules?.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">
                No schedules yet
              </h3>
              <p className="text-muted-foreground mt-1">
                Create a schedule to run bots automatically.
              </p>
              <Button className="mt-4">
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
                    <th>Schedule</th>
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
  );
}

function ScheduleRow({
  schedule,
  onTrigger,
  onDelete,
}: {
  schedule: {
    id: string;
    name: string;
    botId: string;
    cron: string;
    timezone: string;
    enabled: boolean;
    targetType: string;
    pinnedRunnerId?: string;
    lastRunAt?: string;
    nextRunAt?: string;
  };
  onTrigger: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();

  const targetLabel = {
    any: 'Any Runner',
    group: 'Runner Group',
    pinned: 'Pinned Runner',
  }[schedule.targetType] || schedule.targetType;

  const handleToggleEnabled = () => {
    toast({
      title: schedule.enabled ? 'Schedule disabled' : 'Schedule enabled',
      description: `${schedule.name} has been ${schedule.enabled ? 'disabled' : 'enabled'}.`,
    });
  };

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
          {schedule.botId}
        </Link>
      </td>
      <td>
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <code className="text-sm bg-muted px-2 py-0.5 rounded">
            {schedule.cron}
          </code>
        </div>
        <span className="text-xs text-muted-foreground">{schedule.timezone}</span>
      </td>
      <td className="text-sm text-muted-foreground">{targetLabel}</td>
      <td>
        <Badge variant={schedule.enabled ? 'success' : 'default'}>
          {schedule.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
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
              <DropdownMenuItem>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleEnabled}>
                {schedule.enabled ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Disable
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Enable
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
