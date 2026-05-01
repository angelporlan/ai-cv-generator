import { create } from 'zustand';
import { createAiArtifact, loadAiArtifacts, saveAiArtifacts, type AiArtifact } from '../domain/aiArtifacts';
import { defaultDesignSettings, normalizeDesignSettings, type DesignSettings } from '../domain/design';
import { defaultMarkdown } from '../domain/editor';

type WorkspaceState = {
  markdown: string;
  selectedCvId: number | null;
  editorMode: 'markdown' | 'visual';
  rightPanel: 'preview' | 'quality' | 'ai' | 'design';
  design: DesignSettings;
  aiArtifacts: AiArtifact[];
  setMarkdown: (markdown: string) => void;
  setSelectedCvId: (id: number | null) => void;
  setEditorMode: (mode: 'markdown' | 'visual') => void;
  setRightPanel: (panel: 'preview' | 'quality' | 'ai' | 'design') => void;
  setDesign: (design: Partial<DesignSettings>) => void;
  addAiArtifact: (artifact: Omit<AiArtifact, 'id' | 'createdAt'>) => void;
  clearAiArtifacts: () => void;
};

const storageKey = 'cv-studio-spa-draft';
const designStorageKey = 'cv-studio-spa-design';

function loadDesignSettings() {
  try {
    const raw = localStorage.getItem(designStorageKey);
    return normalizeDesignSettings(raw ? JSON.parse(raw) : defaultDesignSettings);
  } catch {
    return defaultDesignSettings;
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  markdown: localStorage.getItem(storageKey) || defaultMarkdown,
  selectedCvId: null,
  editorMode: 'markdown',
  rightPanel: 'preview',
  design: loadDesignSettings(),
  aiArtifacts: loadAiArtifacts(),
  setMarkdown: (markdown) => {
    localStorage.setItem(storageKey, markdown);
    set({ markdown });
  },
  setSelectedCvId: (selectedCvId) => set({ selectedCvId }),
  setEditorMode: (editorMode) => set({ editorMode }),
  setRightPanel: (rightPanel) => set({ rightPanel }),
  setDesign: (designPatch) => set((state) => {
    const design = normalizeDesignSettings({ ...state.design, ...designPatch });
    localStorage.setItem(designStorageKey, JSON.stringify(design));
    return { design };
  }),
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
