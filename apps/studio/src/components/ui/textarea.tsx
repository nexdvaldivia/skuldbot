import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, onKeyDown, ...props }, ref) => {
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return

    const textarea = e.currentTarget
    const value = textarea.value ?? ""
    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start

    const apply = (nextValue: string, nextStart: number, nextEnd: number = nextStart) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      nativeSetter?.call(textarea, nextValue)
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      requestAnimationFrame(() => textarea.setSelectionRange(nextStart, nextEnd))
    }

    if (e.key === "Tab") {
      e.preventDefault()

      if (start === end) {
        if (e.shiftKey) {
          const before = value.slice(0, start)
          if (before.endsWith("  ")) {
            apply(value.slice(0, start - 2) + value.slice(end), start - 2)
          } else if (before.endsWith("\t")) {
            apply(value.slice(0, start - 1) + value.slice(end), start - 1)
          }
          return
        }
        apply(value.slice(0, start) + "  " + value.slice(end), start + 2)
        return
      }

      const blockStart = value.lastIndexOf("\n", start - 1) + 1
      const blockEndIdx = value.indexOf("\n", end)
      const blockEnd = blockEndIdx === -1 ? value.length : blockEndIdx
      const block = value.slice(blockStart, blockEnd)
      const lines = block.split("\n")
      const updatedLines = e.shiftKey
        ? lines.map((line) => {
            if (line.startsWith("  ")) return line.slice(2)
            if (line.startsWith("\t")) return line.slice(1)
            return line
          })
        : lines.map((line) => `  ${line}`)

      const updatedBlock = updatedLines.join("\n")
      const nextValue = value.slice(0, blockStart) + updatedBlock + value.slice(blockEnd)
      const startDelta = e.shiftKey
        ? lines[0].startsWith("  ")
          ? -2
          : lines[0].startsWith("\t")
            ? -1
            : 0
        : 2
      const endDelta = updatedBlock.length - block.length
      const nextStart = Math.max(blockStart, start + startDelta)
      const nextEnd = Math.max(nextStart, end + endDelta)
      apply(nextValue, nextStart, nextEnd)
      return
    }

    if (e.key === "Enter") {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1
      const lineUntilCursor = value.slice(lineStart, start)

      const unordered = lineUntilCursor.match(/^(\s*[-*+]\s+)(.*)$/)
      const ordered = lineUntilCursor.match(/^(\s*)(\d+)\.\s+(.*)$/)

      if (unordered) {
        e.preventDefault()
        const [, prefix, content] = unordered
        const nextPrefix = content.trim().length > 0 ? prefix : ""
        const insertion = `\n${nextPrefix}`
        apply(value.slice(0, start) + insertion + value.slice(end), start + insertion.length)
        return
      }

      if (ordered) {
        e.preventDefault()
        const [, indent, number, content] = ordered
        const nextPrefix = content.trim().length > 0 ? `${indent}${Number(number) + 1}. ` : ""
        const insertion = `\n${nextPrefix}`
        apply(value.slice(0, start) + insertion + value.slice(end), start + insertion.length)
      }
    }
  }, [onKeyDown])

  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base leading-5 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm whitespace-pre-wrap",
        className
      )}
      ref={ref}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
