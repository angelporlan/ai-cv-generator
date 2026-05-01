import { describe, expect, it } from 'vitest';
import { defaultDesignSettings, normalizeDesignSettings } from './design';

describe('design domain', () => {
  it('keeps valid design settings', () => {
    expect(normalizeDesignSettings({
      template: 'swiss',
      accentColor: '#0f766e',
      fontFamily: 'times',
      pageMargin: 48,
      showIcons: false
    })).toEqual({
      template: 'swiss',
      accentColor: '#0f766e',
      fontFamily: 'times',
      pageMargin: 48,
      showIcons: false
    });
  });

  it('falls back when persisted values are invalid', () => {
    expect(normalizeDesignSettings({
      template: 'bad-template' as never,
      accentColor: 'blue',
      fontFamily: 'comic' as never,
      pageMargin: 999
    })).toEqual(defaultDesignSettings);
  });
});
