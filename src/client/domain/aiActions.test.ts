import { describe, expect, it } from 'vitest';
import { aiActions, getAiAction, getUsageCopy } from './aiActions';

describe('ai actions domain', () => {
  it('keeps all visible actions configured with labels and input rules', () => {
    expect(aiActions.map((action) => action.id)).toEqual([
      'adapt',
      'skill_gap',
      'cover_letter',
      'optimize_star',
      'translate'
    ]);
    expect(aiActions.every((action) => action.label && action.shortLabel && action.placeholder)).toBe(true);
  });

  it('falls back to adapt for unknown actions', () => {
    expect(getAiAction('unknown').id).toBe('adapt');
  });

  it('summarizes usage without leaking billing complexity into UI components', () => {
    expect(getUsageCopy(null)).toBe('Inicia sesion para activar IA');
    expect(getUsageCopy({
      used: 1,
      limit: 3,
      remaining: 2,
      canUseAi: true,
      subscriptionStatus: 'none',
      billing: {
        isActive: false,
        plan: 'free',
        subscriptionStatus: 'none',
        currentPeriodEnd: null
      }
    })).toBe('2 de 3 usos disponibles');
  });
});
