'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBots, useDeleteBot } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime } from '@/lib/utils';
import { Bot, Plus, MoreVertical, Play, Trash2, Edit } from 'lucide-react';
import Link from 'next/link';

export default function BotsPage() {
  const { data: bots, isLoading } = useBots();
  const deleteMutation = useDeleteBot();
  const { toast } = useToast();

  const handleDelete = async (id: string, name: string) => {
    if (confirm('Are you sure you want to delete this bot?')) {
      try {
        await deleteMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Bot deleted',
          description: `${name} has been deleted successfully.`,
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to delete bot. Please try again.',
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bots</h1>
          <p className="text-muted-foreground mt-1">Manage your RPA bots</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Upload Bot
        </Button>
      </div>

      {/* Bots grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : bots?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No bots yet</h3>
            <p className="text-muted-foreground mt-1">
              Upload a bot package from Studio to get started.
            </p>
            <Button className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Upload Bot
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bots?.map((bot) => (
            <BotCard
              key={bot.id}
              bot={bot}
              onDelete={() => handleDelete(bot.id, bot.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BotCard({
  bot,
  onDelete,
}: {
  bot: {
    id: string;
    name: string;
    description?: string;
    latestVersion?: { version: string; status: string };
    createdAt: string;
    updatedAt: string;
  };
  onDelete: () => void;
}) {
  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <Link
              href={`/bots/${bot.id}`}
              className="font-semibold text-foreground hover:text-primary transition-colors"
            >
              {bot.name}
            </Link>
            {bot.latestVersion && (
              <p className="text-xs text-muted-foreground">
                v{bot.latestVersion.version}
              </p>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/bots/${bot.id}`} className="flex items-center">
                <Edit className="h-4 w-4 mr-2" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/runs?botId=${bot.id}`} className="flex items-center">
                <Play className="h-4 w-4 mr-2" />
                View Runs
              </Link>
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
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {bot.description || 'No description'}
        </p>

        <div className="flex items-center justify-between">
          {bot.latestVersion ? (
            <StatusBadge status={bot.latestVersion.status} />
          ) : (
            <StatusBadge status="draft" />
          )}
          <span className="text-xs text-muted-foreground">
            Updated {formatRelativeTime(bot.updatedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
