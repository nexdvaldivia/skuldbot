'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowLeft, FileText, Send, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { contractsApi } from '@/lib/api';

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = (await contractsApi.getTemplate(templateId)) as Record<string, unknown>;
        setTemplate(data);
      } catch {
        toast({ title: 'Error', description: 'Failed to load template.', variant: 'error' });
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-zinc-600">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-zinc-200" />
          <div>
            <h1 className="text-xl font-bold text-zinc-900">
              {(template?.displayName as string) || 'Template Editor'}
            </h1>
            <p className="text-sm text-zinc-500">
              v{(template?.version as string) || '?'} — {(template?.status as string) || 'unknown'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(template?.status as string) === 'active' && (
            <Button onClick={() => router.push(`/contracts/templates/${templateId}/send`)}>
              <Send className="w-4 h-4 mr-2" />
              Send for Signing
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Template Content
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-zinc-500">
            <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-900 mb-2">PDF Contract Editor</h3>
            <p className="text-zinc-500">
              The full PDF editor with signature field positioning, variable binding, and preview
              will be available in the next update.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
