import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiArtifact, loadAiArtifacts, saveAiArtifacts } from './aiArtifacts';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value)
  });
});

describe('ai artifacts domain', () => {
  it('creates timestamped artifacts from AI output', () => {
    const artifact = createAiArtifact({
      action: 'cover_letter',
      title: 'Carta',
      content: 'Hola',
      model: 'test-model'
    });

    expect(artifact.id).toContain('cover_letter-');
    expect(artifact.createdAt).toBeTruthy();
    expect(artifact.content).toBe('Hola');
  });

  it('saves and loads recent artifacts', () => {
    const artifact = createAiArtifact({
      action: 'adapt',
      title: 'ATS',
      content: 'CV',
      model: 'test-model'
    });

    saveAiArtifacts([artifact]);
    expect(loadAiArtifacts()).toEqual([artifact]);
  });

  it('caps saved artifacts to 25 items', () => {
    const items = Array.from({ length: 30 }, (_, index) => createAiArtifact({
      action: 'adapt',
      title: `Item ${index}`,
      content: 'CV',
      model: 'test-model'
    }));

    saveAiArtifacts(items);
    expect(loadAiArtifacts()).toHaveLength(25);
  });
});
