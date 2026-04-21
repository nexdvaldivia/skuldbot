'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'denied'>('checking');

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

      if (!token || isTokenExpired(token)) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        router.replace('/login');
        return;
      }

      try {
        await authApi.me();
        if (!cancelled) setStatus('authenticated');
      } catch {
        if (cancelled) return;
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        router.replace('/login');
      }
    };

    verify();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
          <p className="text-sm text-zinc-600 mt-4">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
