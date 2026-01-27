'use client'

import { Button } from '@/components/Button'
import { HeroPattern } from '@/components/HeroPattern'
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  return (
    <>
      <HeroPattern />
      <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          Error
        </p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-8 flex gap-4">
          <Button onClick={() => reset()} variant="primary">
            Try again
          </Button>
          <Button href="/" arrow="right" variant="secondary">
            Back to docs
          </Button>
        </div>
      </div>
    </>
  )
}


