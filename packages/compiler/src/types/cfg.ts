import { DSLNode } from './dsl';

/**
 * Port types for edges
 */
export type Port = string; // "success" | "error" | "done" | "then" | "else" | "try" | "catch" | "body" | "case_*" | "branch_*"

/**
 * Edge in the control flow graph
 */
export interface Edge {
  from: string;
  fromPort: Port;
  to: string;
}

/**
 * Control Flow Graph
 */
export interface CFG {
  nodeIds: Set<string>;
  edges: Edge[];
  succ: Map<string, Set<string>>;
  pred: Map<string, Set<string>>;
  nodesById: Map<string, DSLNode>;
  scopeOf: Map<string, string>; // nodeId -> scopeId
}

/**
 * Pseudo-node ID generators
 */
export const ENTRY = (scopeId: string): string => `__ENTRY__:${scopeId}`;
export const END = (scopeId: string): string => `__END__:${scopeId}`;
export const DONE = (scopeId: string): string => `__DONE__:${scopeId}`;
export const NEXT_ITER = (scopeId: string): string => `__NEXT_ITER__:${scopeId}`;

/**
 * Check if an ID is a pseudo-node
 */
export function isPseudo(id: string): boolean {
  return (
    id.startsWith('__ENTRY__:') ||
    id.startsWith('__END__:') ||
    id.startsWith('__DONE__:') ||
    id.startsWith('__NEXT_ITER__:')
  );
}

/**
 * Root scope ID
 */
export const ROOT_SCOPE = 'ROOT';
