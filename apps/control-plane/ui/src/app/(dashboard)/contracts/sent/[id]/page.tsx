'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function EnvelopeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const envelopeId = params.id as string;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Envelope detail loading will be implemented with full signing API
    setLoading(false);
  }, [envelopeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/contracts?tab=sent')} className="text-zinc-600">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sent
        </Button>
        <div className="h-6 w-px bg-zinc-200" />
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Envelope Details</h1>
          <p className="text-sm text-zinc-500">ID: {envelopeId}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Signing Envelope
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-zinc-500">
            <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-900 mb-2">Envelope Detail View</h3>
            <p className="text-zinc-500">
              The full envelope detail with recipient status, delivery history, and document management will be available in the next update.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
