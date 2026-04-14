export function resolveProviderChain(
  chainFromEnv?: string,
  preferredProvider?: string,
  defaultChain: string[] = [],
): string[] {
  const chain = (chainFromEnv || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const ordered = [...(preferredProvider ? [preferredProvider] : []), ...chain, ...defaultChain];

  return [...new Set(ordered)];
}
