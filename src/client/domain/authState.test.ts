import { describe, expect, it } from 'vitest';
import { defaultDesignSettings } from './design';
import { defaultMarkdown } from './editor';
import { buildWorkspaceAuthState, fingerprintWorkspaceAuthState, hasMeaningfulWorkspaceAuthState, normalizeWorkspaceAuthState } from './authState';

describe('workspace auth state', () => {
  it('builds a stable snapshot from workspace state', () => {
    const snapshot = buildWorkspaceAuthState({
      markdown: '# CV\n',
      selectedCvId: 42,
      editorMode: 'visual',
      rightPanel: 'ai',
      suggestionsOpen: false,
      design: {
        ...defaultDesignSettings,
        template: 'swiss',
        accentColor: '#0f766e'
      },
      aiArtifacts: [
        {
          id: 'adapt-1',
          action: 'adapt',
          title: 'Adaptar CV',
          content: 'Resultado',
          model: 'test-model',
          createdAt: '2026-05-02T10:00:00.000Z'
        }
      ]
    });

    expect(snapshot.markdown).toBe('# CV\n');
    expect(snapshot.selectedCvId).toBe(42);
    expect(snapshot.editorMode).toBe('visual');
    expect(snapshot.rightPanel).toBe('ai');
    expect(snapshot.suggestionsOpen).toBe(false);
    expect(snapshot.design.template).toBe('swiss');
    expect(snapshot.aiArtifacts).toHaveLength(1);
    expect(snapshot.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fingerprintWorkspaceAuthState(snapshot)).toContain('"editorMode":"visual"');
  });

  it('normalizes structured state payloads from the server', () => {
    const normalized = normalizeWorkspaceAuthState({
      markdown: '# Hola\n',
      selectedCvId: 7,
      editorMode: 'visual',
      rightPanel: 'design',
      suggestionsOpen: false,
      design: {
        template: 'swiss',
        accentColor: '#0f766e',
        fontFamily: 'times',
        fontSize: 13.5,
        pageMargin: 48,
        showIcons: false
      },
      aiArtifacts: [
        {
          id: 'artifact-1',
          action: 'ask',
          title: 'Pregunta',
          content: 'Contenido',
          model: 'gemini',
          createdAt: '2026-05-02T11:00:00.000Z'
        }
      ],
      updatedAt: '2026-05-02T11:05:00.000Z'
    });

    expect(normalized?.editorMode).toBe('visual');
    expect(normalized?.rightPanel).toBe('design');
    expect(normalized?.design.template).toBe('swiss');
    expect(normalized?.aiArtifacts).toHaveLength(1);
    expect(normalized?.updatedAt).toBe('2026-05-02T11:05:00.000Z');
  });

  it('detects whether a snapshot contains useful user state', () => {
    expect(hasMeaningfulWorkspaceAuthState({
      markdown: defaultMarkdown,
      selectedCvId: null,
      editorMode: 'markdown',
      rightPanel: 'preview',
      suggestionsOpen: true,
      design: defaultDesignSettings,
      aiArtifacts: [],
      updatedAt: '2026-05-02T11:00:00.000Z'
    })).toBe(false);

    expect(hasMeaningfulWorkspaceAuthState({
      markdown: '# Tu Nombre\n\n## Experiencia\n- Algo\n',
      selectedCvId: null,
      editorMode: 'markdown',
      rightPanel: 'preview',
      suggestionsOpen: true,
      design: defaultDesignSettings,
      aiArtifacts: [],
      updatedAt: '2026-05-02T11:00:00.000Z'
    })).toBe(true);
  });
});
