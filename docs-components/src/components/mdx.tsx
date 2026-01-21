import clsx from 'clsx'
import Link from 'next/link'

import { Feedback } from '@/components/Feedback'
import { Heading } from '@/components/Heading'
import { Prose } from '@/components/Prose'

export const a = Link
export { Button } from '@/components/Button'
export { Code as code, CodeGroup, Pre as pre } from '@/components/Code'

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <Prose className="flex-auto">{children}</Prose>
      <footer className="mx-auto mt-16 w-full max-w-2xl lg:max-w-5xl">
        <Feedback />
      </footer>
    </article>
  )
}

export const h2 = function H2(
  props: Omit<React.ComponentPropsWithoutRef<typeof Heading>, 'level'>,
) {
  return <Heading level={2} {...props} />
}

function InfoIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="8" strokeWidth="0" />
      <path
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M6.75 7.75h1.5v3.5"
      />
      <circle cx="8" cy="4" r=".5" fill="none" />
    </svg>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-4 text-sm/6 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-200 dark:[--tw-prose-links-hover:var(--color-emerald-300)] dark:[--tw-prose-links:var(--color-white)]">
      <InfoIcon className="mt-1 h-4 w-4 flex-none fill-emerald-500 stroke-white dark:fill-emerald-200/20 dark:stroke-emerald-200" />
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-16 gap-y-10 xl:max-w-none xl:grid-cols-2">
      {children}
    </div>
  )
}

export function Col({
  children,
  sticky = false,
}: {
  children: React.ReactNode
  sticky?: boolean
}) {
  return (
    <div
      className={clsx(
        '[&>:first-child]:mt-0 [&>:last-child]:mb-0',
        sticky && 'xl:sticky xl:top-24',
      )}
    >
      {children}
    </div>
  )
}

export function Properties({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6">
      <ul
        role="list"
        className="m-0 list-none divide-y divide-zinc-900/5 p-0 dark:divide-white/5"
      >
        {children}
      </ul>
    </div>
  )
}

export function Property({
  name,
  children,
  type,
}: {
  name: string
  children: React.ReactNode
  type?: string
}) {
  return (
    <li className="m-0 px-0 py-4 first:pt-0 last:pb-0">
      <dl className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
        <dt className="sr-only">Name</dt>
        <dd>
          <code>{name}</code>
        </dd>
        {type && (
          <>
            <dt className="sr-only">Type</dt>
            <dd className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {type}
            </dd>
          </>
        )}
        <dt className="sr-only">Description</dt>
        <dd className="w-full flex-none [&>:first-child]:mt-0 [&>:last-child]:mb-0">
          {children}
        </dd>
      </dl>
    </li>
  )
}

// Warning callout for important notices
function WarningIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M8 1l7 14H1L8 1z" strokeWidth="0" />
      <path fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 6v3" />
      <circle cx="8" cy="11.5" r=".5" fill="none" />
    </svg>
  )
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-50/50 p-4 text-sm/6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-200">
      <WarningIcon className="mt-1 h-4 w-4 flex-none fill-amber-500 stroke-white dark:fill-amber-200/20 dark:stroke-amber-200" />
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  )
}

// Collapsible section for deep-dive content
export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="my-6 rounded-2xl border border-zinc-200 dark:border-zinc-800" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-2xl">
        <svg className="h-4 w-4 transition-transform [[open]>&]:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {title}
      </summary>
      <div className="px-4 pb-4 pt-2 text-sm text-zinc-600 dark:text-zinc-400 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </details>
  )
}

// Prerequisites section
export function Prerequisites({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-2xl border border-blue-500/20 bg-blue-50/50 p-4 dark:border-blue-500/30 dark:bg-blue-500/5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Prerequisites
      </h4>
      <div className="text-sm text-blue-800 dark:text-blue-300 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&>ul]:m-0 [&>ul]:list-disc [&>ul]:pl-4">
        {children}
      </div>
    </div>
  )
}

// Step by step guide
export function Steps({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 space-y-4">
      {children}
    </div>
  )
}

export function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="relative pl-10">
      <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">{title}</h4>
        <div className="text-sm text-zinc-600 dark:text-zinc-400 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}

// Tabs component for multiple configurations
export function Tabs({
  labels,
  children,
}: {
  labels: string[]
  children: React.ReactNode
}) {
  return (
    <div className="my-6">
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        {labels.map((label, i) => (
          <button
            key={label}
            className={clsx(
              'px-4 py-2 text-sm font-medium transition-colors',
              i === 0
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {children}
      </div>
    </div>
  )
}

// Tip callout
export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex gap-2.5 rounded-2xl border border-cyan-500/20 bg-cyan-50/50 p-4 text-sm/6 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/5 dark:text-cyan-200">
      <svg className="mt-1 h-4 w-4 flex-none text-cyan-500 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  )
}

// Node header with icon - for component documentation
export function NodeHeader({
  icon,
  label,
  description,
  bgColor,
  textColor,
}: {
  icon: string
  label: string
  description: string
  bgColor?: string
  textColor?: string
}) {
  // Convert JSX-style SVG attributes to HTML-style (camelCase to kebab-case)
  const normalizedIcon = icon
    .replace(/strokeWidth=/g, 'stroke-width=')
    .replace(/strokeLinecap=/g, 'stroke-linecap=')
    .replace(/strokeLinejoin=/g, 'stroke-linejoin=')
    .replace(/fillRule=/g, 'fill-rule=')
    .replace(/clipRule=/g, 'clip-rule=')
    .replace(/viewBox=/g, 'viewBox=') // Keep viewBox as is

  return (
    <div className="not-prose flex items-start gap-4 mb-6">
      <div
        className="flex h-12 w-12 flex-none items-center justify-center rounded-xl [&_svg]:h-6 [&_svg]:w-6"
        style={{
          backgroundColor: bgColor || '#d1fae5',
          color: textColor || '#047857'
        }}
      >
        <span dangerouslySetInnerHTML={{ __html: normalizedIcon }} />
      </div>
      <div className="pt-1">
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-white m-0">{label}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 m-0 mt-1">{description}</p>
      </div>
    </div>
  )
}
