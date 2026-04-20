'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewTemplatePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to contracts hub with create modal open
    router.replace('/contracts?tab=templates');
  }, [router]);

  return null;
}
