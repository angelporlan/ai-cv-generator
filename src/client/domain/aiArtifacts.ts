import type { AiActionId } from './aiActions';

export type AiArtifact = {
  id: string;
  action: AiActionId;
  title: string;
  content: string;
  model: string;
  createdAt: string;
};

const storageKey = 'cv-studio-spa-ai-artifacts';

export function createAiArtifact(input: Omit<AiArtifact, 'id' | 'createdAt'>): AiArtifact {
  const createdAt = new Date().toISOString();
  return {
    ...input,
    id: `${input.action}-${createdAt}`,
    createdAt
  };
}

export function loadAiArtifacts(): AiArtifact[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAiArtifacts(items: AiArtifact[]) {
  localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 25)));
}
