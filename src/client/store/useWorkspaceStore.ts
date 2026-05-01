import { create } from 'zustand';
import { defaultMarkdown } from '../domain/editor';

type WorkspaceState = {
  markdown: string;
  selectedCvId: number | null;
  editorMode: 'markdown' | 'visual';
  rightPanel: 'preview' | 'quality' | 'ai';
  setMarkdown: (markdown: string) => void;
  setSelectedCvId: (id: number | null) => void;
  setEditorMode: (mode: 'markdown' | 'visual') => void;
  setRightPanel: (panel: 'preview' | 'quality' | 'ai') => void;
};

const storageKey = 'cv-studio-spa-draft';

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  markdown: localStorage.getItem(storageKey) || defaultMarkdown,
  selectedCvId: null,
  editorMode: 'markdown',
  rightPanel: 'preview',
  setMarkdown: (markdown) => {
    localStorage.setItem(storageKey, markdown);
    set({ markdown });
  },
  setSelectedCvId: (selectedCvId) => set({ selectedCvId }),
  setEditorMode: (editorMode) => set({ editorMode }),
  setRightPanel: (rightPanel) => set({ rightPanel })
}));
