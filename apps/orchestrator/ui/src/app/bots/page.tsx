'use client';

import { FormEvent, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/badge';
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
import { useBots, useCreateBot, useDeleteBot } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeTime } from '@/lib/utils';
import { Bot, Plus, MoreVertical, Play, Trash2, Edit } from 'lucide-react';
import Link from 'next/link';

export default function BotsPage() {
  const { data: bots, isLoading } = useBots();
  const createMutation = useCreateBot();
  const deleteMutation = useDeleteBot();
  const { toast } = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const resetForm = () => {
    setName('');
    setDescription('');
  };

  const handleCreateBot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedDescription = description.trim();

    if (!normalizedName) {
      toast({
        variant: 'warning',
        title: 'Missing name',
        description: 'Bot name is required.',
      });
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: normalizedName,
        description: normalizedDescription || undefined,
      });

      toast({
        variant: 'success',
        title: 'Bot created',
        description: `${normalizedName} is now available.`,
      });

      setOpenCreate(false);
      resetForm();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create bot',
        description:
          error instanceof Error ? error.message : 'Please verify your data and try again.',
      });
    }
  };

  const handleDelete = async (id: string, botName: string) => {
    if (confirm('Are you sure you want to delete this bot?')) {
      try {
        await deleteMutation.mutateAsync(id);
        toast({
          variant: 'success',
          title: 'Bot deleted',
          description: `${botName} has been deleted successfully.`,
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
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bots</h1>
            <p className="text-muted-foreground mt-1">Manage your RPA bots</p>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Bot
          </Button>
        </div>

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
              <Button className="mt-4" onClick={() => setOpenCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Upload Bot
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bots?.map((bot) => (
              <BotCard key={bot.id} bot={bot} onDelete={() => handleDelete(bot.id, bot.name)} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Bot</DialogTitle>
            <DialogDescription>
              Register a new bot shell and continue versioning from Studio.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreateBot}>
            <div className="space-y-2">
              <Label htmlFor="bot-name">Bot Name</Label>
              <Input
                id="bot-name"
                placeholder="Claims Intake Automation"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bot-description">Description</Label>
              <textarea
                id="bot-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={4}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Optional summary for operators and support teams"
              />
            </div>

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
              <Button type="submit" loading={createMutation.isPending}>
                Create Bot
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
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
              <p className="text-xs text-muted-foreground">v{bot.latestVersion.version}</p>
            )}
          </div>
        </div>

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
