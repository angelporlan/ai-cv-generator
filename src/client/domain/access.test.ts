import { describe, expect, it } from 'vitest';
import { canUseAi, resolveAccessState, shouldPromptUpgrade } from './access';
import type { Usage } from '../api/client';

function usage(overrides: Partial<Usage> = {}): Usage {
  return {
    used: 0,
    limit: 3,
    remaining: 3,
    canUseAi: true,
    subscriptionStatus: 'none',
    billing: {
      isActive: false,
      plan: 'free',
      subscriptionStatus: 'none',
      currentPeriodEnd: null
    },
    ...overrides
  };
}

describe('access domain', () => {
  it('treats unauthenticated users as guests', () => {
    expect(resolveAccessState(false, null)).toBe('guest');
    expect(canUseAi(false, null)).toBe(false);
  });

  it('allows free users while they have usage', () => {
    const current = usage();
    expect(resolveAccessState(true, current)).toBe('free_available');
    expect(canUseAi(true, current)).toBe(true);
  });

  it('prompts upgrade when free usage is exhausted', () => {
    const current = usage({ canUseAi: false, remaining: 0, used: 3 });
    expect(resolveAccessState(true, current)).toBe('free_exhausted');
    expect(shouldPromptUpgrade(true, current)).toBe(true);
  });

  it('allows pro users regardless of remaining free usage', () => {
    const current = usage({
      canUseAi: true,
      remaining: null,
      billing: {
        isActive: true,
        plan: 'pro',
        subscriptionStatus: 'active',
        currentPeriodEnd: null
      }
    });
    expect(resolveAccessState(true, current)).toBe('pro');
    expect(canUseAi(true, current)).toBe(true);
  });
});
