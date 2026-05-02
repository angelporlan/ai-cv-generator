import type { AiArtifact } from './aiArtifacts';
import type { AiActionId } from './aiActions';
import { defaultMarkdown } from './editor';
import { defaultDesignSettings, normalizeDesignSettings, type DesignSettings } from './design';

export type WorkspaceEditorMode = 'markdown' | 'visual';
export type WorkspaceRightPanel = 'preview' | 'quality' | 'ai' | 'design';

export type WorkspaceAuthState = {
  markdown: string;
  selectedCvId: number | null;
  editorMode: WorkspaceEditorMode;
  rightPanel: WorkspaceRightPanel;
  suggestionsOpen: boolean;
  design: DesignSettings;
  aiArtifacts: AiArtifact[];
  updatedAt: string;
};

export type WorkspaceAuthStateInput = Omit<WorkspaceAuthState, 'updatedAt'>;

const defaultState: WorkspaceAuthStateInput = {
  markdown: defaultMarkdown,
  selectedCvId: null,
  editorMode: 'markdown',
  rightPanel: 'preview',
  suggestionsOpen: true,
  design: defaultDesignSettings,
  aiArtifacts: []
};

export function buildWorkspaceAuthState(input: WorkspaceAuthStateInput): WorkspaceAuthState {
  return {
    markdown: input.markdown,
    selectedCvId: input.selectedCvId,
    editorMode: input.editorMode,
    rightPanel: input.rightPanel,
    suggestionsOpen: input.suggestionsOpen,
    design: normalizeDesignSettings(input.design),
    aiArtifacts: input.aiArtifacts.map((artifact) => ({ ...artifact })),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeWorkspaceAuthState(input: unknown): WorkspaceAuthState | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Partial<WorkspaceAuthState>;
  if (typeof candidate.markdown !== 'string') {
    return null;
  }

  return {
    markdown: candidate.markdown,
    selectedCvId: typeof candidate.selectedCvId === 'number' ? candidate.selectedCvId : null,
    editorMode: candidate.editorMode === 'visual' ? 'visual' : 'markdown',
    rightPanel: candidate.rightPanel === 'quality' || candidate.rightPanel === 'ai' || candidate.rightPanel === 'design'
      ? candidate.rightPanel
      : 'preview',
    suggestionsOpen: candidate.suggestionsOpen !== false,
    design: normalizeDesignSettings(candidate.design),
    aiArtifacts: Array.isArray(candidate.aiArtifacts) ? candidate.aiArtifacts.filter(isArtifactLike).map((artifact) => ({
      id: String(artifact.id),
      action: String(artifact.action || 'adapt') as AiActionId,
      title: String(artifact.title || ''),
      content: String(artifact.content || ''),
      model: String(artifact.model || ''),
      createdAt: String(artifact.createdAt || new Date().toISOString())
    })) : [],
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString()
  };
}

export function hasMeaningfulWorkspaceAuthState(state: WorkspaceAuthStateInput | WorkspaceAuthState | null | undefined) {
  if (!state) return false;
  const design = normalizeDesignSettings(state.design);
  const isDefaultDesign =
    design.template === defaultState.design.template
    && design.accentColor === defaultState.design.accentColor
    && design.fontFamily === defaultState.design.fontFamily
    && design.fontSize === defaultState.design.fontSize
    && design.pageMargin === defaultState.design.pageMargin
    && design.showIcons === defaultState.design.showIcons;

  return (
    state.markdown.trim() !== defaultState.markdown.trim()
    || state.selectedCvId !== null
    || state.editorMode !== defaultState.editorMode
    || state.rightPanel !== defaultState.rightPanel
    || state.suggestionsOpen !== defaultState.suggestionsOpen
    || !isDefaultDesign
    || state.aiArtifacts.length > 0
  );
}

export function fingerprintWorkspaceAuthState(state: WorkspaceAuthStateInput | WorkspaceAuthState | null | undefined) {
  if (!state) return '';
  const normalized = {
    markdown: state.markdown,
    selectedCvId: state.selectedCvId ?? null,
    editorMode: state.editorMode,
    rightPanel: state.rightPanel,
    suggestionsOpen: state.suggestionsOpen,
    design: normalizeDesignSettings(state.design),
    aiArtifacts: state.aiArtifacts.map((artifact) => ({
      id: artifact.id,
      action: artifact.action,
      title: artifact.title,
      content: artifact.content,
      model: artifact.model,
      createdAt: artifact.createdAt
    }))
  };

    return JSON.stringify(normalized);
  }

function isArtifactLike(value: unknown): value is AiArtifact {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id !== 'undefined'
    && typeof candidate.action !== 'undefined'
    && typeof candidate.title !== 'undefined'
    && typeof candidate.content !== 'undefined'
    && typeof candidate.model !== 'undefined'
    && typeof candidate.createdAt !== 'undefined';
}
