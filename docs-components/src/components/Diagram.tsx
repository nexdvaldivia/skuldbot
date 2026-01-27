'use client'

// Types
interface DiagramNode {
  id: string
  label: string
  sublabel?: string
  type?: 'default' | 'primary' | 'success' | 'warning' | 'pill'
}

interface DiagramGroup {
  id: string
  label: string
  nodes: DiagramNode[]
  direction?: 'row' | 'column'
}

interface DiagramProps {
  groups?: DiagramGroup[]
  nodes?: DiagramNode[]
  flow?: 'horizontal' | 'vertical'
  className?: string
}

// Node component
function Node({ node }: { node: DiagramNode }) {
  const baseClasses = "px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200 border-2 text-center min-w-[120px]"
  
  const typeClasses = {
    default: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200",
    primary: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
    success: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
    pill: "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 rounded-full px-6",
  }

  return (
    <div className={`${baseClasses} ${typeClasses[node.type || 'default']}`}>
      <div className="font-semibold">{node.label}</div>
      {node.sublabel && (
        <div className="text-xs opacity-70 mt-1">{node.sublabel}</div>
      )}
    </div>
  )
}

// Group component
function Group({ group }: { group: DiagramGroup }) {
  const directionClass = group.direction === 'column' ? 'flex-col' : 'flex-row'
  
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-5 min-w-[160px]">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-4 text-center uppercase tracking-wide">
        {group.label}
      </div>
      <div className={`flex ${directionClass} gap-3 justify-center items-center`}>
        {group.nodes.map((node) => (
          <Node key={node.id} node={node} />
        ))}
      </div>
    </div>
  )
}

// Arrow component
function Arrow({ direction = 'right' }: { direction?: 'right' | 'down' }) {
  if (direction === 'down') {
    return (
      <div className="flex justify-center py-2">
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" className="text-slate-400 dark:text-slate-500">
          <path d="M12 0V24M12 24L4 16M12 24L20 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    )
  }
  
  return (
    <div className="flex items-center px-2">
      <svg width="40" height="24" viewBox="0 0 40 24" fill="none" className="text-slate-400 dark:text-slate-500">
        <path d="M0 12H32M32 12L24 4M32 12L24 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

// Main Diagram component
export function Diagram({ groups, nodes, flow = 'horizontal', className = '' }: DiagramProps) {
  const flowClass = flow === 'vertical' ? 'flex-col' : 'flex-row'
  const arrowDirection = flow === 'vertical' ? 'down' : 'right'

  const content = (
    <div className={`flex ${flowClass} items-center justify-center gap-6`}>
      {groups ? (
        groups.map((group, index) => (
          <div key={group.id} className={`flex ${flowClass} items-center gap-6 shrink-0`}>
            <Group group={group} />
            {index < groups.length - 1 && <Arrow direction={arrowDirection} />}
          </div>
        ))
      ) : nodes ? (
        nodes.map((node, index) => (
          <div key={node.id} className={`flex ${flowClass} items-center gap-4 shrink-0`}>
            <Node node={node} />
            {index < nodes.length - 1 && <Arrow direction={arrowDirection} />}
          </div>
        ))
      ) : null}
    </div>
  )

  return (
    <div className={`my-8 rounded-2xl border border-emerald-500/20 bg-emerald-50/30 dark:border-emerald-500/10 dark:bg-emerald-900/10 ${className}`}>
      <div className="p-6 sm:p-8 lg:p-10 overflow-x-auto">
        <div className="min-w-max">
          {content}
        </div>
      </div>
    </div>
  )
}

// Convenience component for simple flows
export function FlowDiagram({ 
  items, 
  flow = 'horizontal',
  className = '' 
}: { 
  items: Array<{ label: string; sublabel?: string; type?: DiagramNode['type'] }>
  flow?: 'horizontal' | 'vertical'
  className?: string
}) {
  const nodes = items.map((item, i) => ({
    id: `node-${i}`,
    ...item
  }))
  
  return (
    <div className={`my-8 rounded-2xl border border-emerald-500/20 bg-emerald-50/30 dark:border-emerald-500/10 dark:bg-emerald-900/10 ${className}`}>
      <div className="p-6 sm:p-8 overflow-x-auto">
        <div className="min-w-max flex items-center justify-center gap-4">
          {nodes.map((node, index) => (
            <div key={node.id} className="flex items-center gap-4 shrink-0">
              <Node node={node} />
              {index < nodes.length - 1 && <Arrow direction={flow === 'vertical' ? 'down' : 'right'} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Diagram

