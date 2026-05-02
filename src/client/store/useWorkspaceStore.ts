import { create } from 'zustand';
import { createAiArtifact, loadAiArtifacts, saveAiArtifacts, type AiArtifact } from '../domain/aiArtifacts';
import { defaultDesignSettings, normalizeDesignSettings, type DesignSettings } from '../domain/design';
import { defaultMarkdown } from '../domain/editor';

type WorkspaceState = {
  markdown: string;
  selectedCvId: number | null;
  editorMode: 'markdown' | 'visual';
  rightPanel: 'preview' | 'quality' | 'ai' | 'design';
  suggestionsOpen: boolean;
  design: DesignSettings;
  aiArtifacts: AiArtifact[];
  setMarkdown: (markdown: string) => void;
  setSelectedCvId: (id: number | null) => void;
  setEditorMode: (mode: 'markdown' | 'visual') => void;
  setRightPanel: (panel: 'preview' | 'quality' | 'ai' | 'design') => void;
  setSuggestionsOpen: (open: boolean) => void;
  setDesign: (design: Partial<DesignSettings>) => void;
  setAiArtifacts: (items: AiArtifact[]) => void;
  addAiArtifact: (artifact: Omit<AiArtifact, 'id' | 'createdAt'>) => void;
  clearAiArtifacts: () => void;
};

const storageKey = 'cv-studio-spa-draft';
const editorModeStorageKey = 'cv-studio-spa-editor-mode';
const rightPanelStorageKey = 'cv-studio-spa-right-panel';
const designStorageKey = 'cv-studio-spa-design';
const suggestionsStorageKey = 'cv-studio-spa-suggestions-open';

function loadDesignSettings() {
  try {
    const raw = localStorage.getItem(designStorageKey);
    return normalizeDesignSettings(raw ? JSON.parse(raw) : defaultDesignSettings);
  } catch {
    return defaultDesignSettings;
  }
}

function loadSuggestionsOpen() {
  try {
    const raw = localStorage.getItem(suggestionsStorageKey);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function loadEditorMode() {
  try {
    const raw = localStorage.getItem(editorModeStorageKey);
    return raw === 'visual' ? 'visual' : 'markdown';
  } catch {
    return 'markdown';
  }
}

function loadRightPanel() {
  try {
    const raw = localStorage.getItem(rightPanelStorageKey);
    return raw === 'quality' || raw === 'ai' || raw === 'design' ? raw : 'preview';
  } catch {
    return 'preview';
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  markdown: localStorage.getItem(storageKey) || defaultMarkdown,
  selectedCvId: null,
  editorMode: loadEditorMode(),
  rightPanel: loadRightPanel(),
  suggestionsOpen: loadSuggestionsOpen(),
  design: loadDesignSettings(),
  aiArtifacts: loadAiArtifacts(),
  setMarkdown: (markdown) => {
    localStorage.setItem(storageKey, markdown);
    set({ markdown });
  },
  setSelectedCvId: (selectedCvId) => set({ selectedCvId }),
  setEditorMode: (editorMode) => {
    localStorage.setItem(editorModeStorageKey, editorMode);
    set({ editorMode });
  },
  setRightPanel: (rightPanel) => {
    localStorage.setItem(rightPanelStorageKey, rightPanel);
    set({ rightPanel });
  },
  setSuggestionsOpen: (suggestionsOpen) => {
    localStorage.setItem(suggestionsStorageKey, String(suggestionsOpen));
    set({ suggestionsOpen });
  },
  setDesign: (designPatch) => set((state) => {
    const design = normalizeDesignSettings({ ...state.design, ...designPatch });
    localStorage.setItem(designStorageKey, JSON.stringify(design));
    return { design };
  }),
  setAiArtifacts: (items) => {
    saveAiArtifacts(items);
    set({ aiArtifacts: items.slice(0, 25) });
  },
  addAiArtifact: (input) => set((state) => {
    const aiArtifacts = [createAiArtifact(input), ...state.aiArtifacts].slice(0, 25);
    saveAiArtifacts(aiArtifacts);
    return { aiArtifacts };
  }),
  clearAiArtifacts: () => {
    saveAiArtifacts([]);
    set({ aiArtifacts: [] });
  }
}));
