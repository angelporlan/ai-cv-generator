import type { Usage } from '../api/client';

export type AccessState = 'guest' | 'free_available' | 'free_exhausted' | 'pro';

export function resolveAccessState(authenticated: boolean, usage?: Usage | null): AccessState {
  if (!authenticated || !usage) return 'guest';
  if (usage.billing?.isActive) return 'pro';
  if (!usage.canUseAi) return 'free_exhausted';
  return 'free_available';
}

export function canUseAi(authenticated: boolean, usage?: Usage | null): boolean {
  const state = resolveAccessState(authenticated, usage);
  return state === 'free_available' || state === 'pro';
}

export function shouldPromptUpgrade(authenticated: boolean, usage?: Usage | null): boolean {
  return resolveAccessState(authenticated, usage) === 'free_exhausted';
}
