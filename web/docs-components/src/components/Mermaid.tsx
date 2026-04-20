'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import mermaid from 'mermaid'

interface MermaidProps {
  chart: string
  className?: string
}

export function Mermaid({ chart, className = '' }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const renderChart = useCallback(async () => {
    if (!mounted) return

    const isDark = resolvedTheme === 'dark'

    // Add theme config to chart
    const themeConfig = `%%{init: {
      'theme': 'base',
      'themeVariables': {
        'primaryColor': '${isDark ? '#475569' : '#e2e8f0'}',
        'primaryTextColor': '${isDark ? '#f1f5f9' : '#1e293b'}',
        'primaryBorderColor': '${isDark ? '#64748b' : '#94a3b8'}',
        'lineColor': '${isDark ? '#64748b' : '#94a3b8'}',
        'secondaryColor': '${isDark ? '#334155' : '#f1f5f9'}',
        'tertiaryColor': '${isDark ? '#1e293b' : '#f8fafc'}',
        'background': 'transparent',
        'mainBkg': '${isDark ? '#334155' : '#f8fafc'}',
        'nodeBorder': '${isDark ? '#64748b' : '#94a3b8'}',
        'clusterBkg': '${isDark ? '#1e293b' : '#f1f5f9'}',
        'clusterBorder': '${isDark ? '#475569' : '#cbd5e1'}',
        'titleColor': '${isDark ? '#94a3b8' : '#64748b'}',
        'edgeLabelBackground': '${isDark ? '#1e293b' : '#ffffff'}',
        'fontSize': '16px',
        'fontFamily': 'ui-sans-serif, system-ui, sans-serif'
      },
      'flowchart': {
        'curve': 'basis',
        'padding': 20,
        'nodeSpacing': 60,
        'rankSpacing': 80,
        'htmlLabels': true,
        'useMaxWidth': false
      }
    }}%%\n`

    // Only add theme config if chart doesn't already have init
    const finalChart = chart.includes('%%{init') ? chart : themeConfig + chart

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
    })

    try {
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
      const { svg: renderedSvg } = await mermaid.render(id, finalChart)
      setSvg(renderedSvg)
      setError(null)
    } catch (err) {
      console.error('Mermaid rendering error:', err)
      setError(err instanceof Error ? err.message : 'Failed to render diagram')
    }
  }, [chart, resolvedTheme, mounted])

  useEffect(() => {
    renderChart()
  }, [renderChart])

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false)
    }
    if (isExpanded) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isExpanded])

  if (!mounted) {
    return (
      <div className={`my-8 flex items-center justify-center rounded-2xl border border-zinc-200/50 bg-zinc-50/50 p-12 dark:border-zinc-700/30 dark:bg-zinc-800/30 ${className}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="my-8 rounded-2xl border border-red-200/50 bg-red-50/30 p-6 text-sm text-red-600 dark:border-red-800/30 dark:bg-red-900/10 dark:text-red-400">
        <p className="font-semibold">Diagram Error</p>
        <pre className="mt-2 overflow-auto text-xs opacity-75">{error}</pre>
      </div>
    )
  }

  return (
    <>
      {/* Normal view */}
      <div className={`group relative my-8 rounded-2xl border border-emerald-500/20 bg-emerald-50/30 dark:border-emerald-500/10 dark:bg-emerald-900/10 ${className}`}>
        <button
          onClick={() => setIsExpanded(true)}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-all hover:bg-white hover:shadow dark:bg-zinc-800/90 dark:text-zinc-300 dark:hover:bg-zinc-700"
          title="Ampliar diagrama"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          Ampliar
        </button>
        
        <div
          ref={containerRef}
          className="flex justify-center overflow-x-auto p-6 [&_svg]:max-w-none [&_.node_rect]:!rx-[12px] [&_.node_rect]:!ry-[12px] [&_.cluster_rect]:!rx-[16px] [&_.cluster_rect]:!ry-[16px]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Modal expanded view */}
      {isExpanded && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsExpanded(false)}
        >
          <div 
            className="relative max-h-[90vh] max-w-[95vw] overflow-auto rounded-2xl bg-white p-8 shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              title="Cerrar (Esc)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            
            <div
              className="flex justify-center [&_svg]:scale-150 [&_svg]:origin-center"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default Mermaid
