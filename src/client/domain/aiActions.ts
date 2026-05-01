import type { Usage } from '../api/client';

export type AiActionId = 'adapt' | 'skill_gap' | 'cover_letter' | 'optimize_star' | 'translate';

export type AiActionDefinition = {
  id: AiActionId;
  label: string;
  shortLabel: string;
  description: string;
  inputLabel: string;
  placeholder: string;
  requiresInput: boolean;
};

export const aiActions: AiActionDefinition[] = [
  {
    id: 'adapt',
    label: 'Adaptar a oferta',
    shortLabel: 'ATS',
    description: 'Alinea el CV con una descripcion de empleo sin perder estructura.',
    inputLabel: 'Descripcion de la oferta',
    placeholder: 'Pega aqui la oferta completa...',
    requiresInput: true
  },
  {
    id: 'skill_gap',
    label: 'Skill gap',
    shortLabel: 'Gap',
    description: 'Detecta keywords, fortalezas y huecos frente a una oferta.',
    inputLabel: 'Oferta o rol objetivo',
    placeholder: 'Pega la oferta o describe el rol objetivo...',
    requiresInput: true
  },
  {
    id: 'cover_letter',
    label: 'Carta',
    shortLabel: 'Carta',
    description: 'Genera una carta de presentacion coherente con el CV.',
    inputLabel: 'Oferta o empresa',
    placeholder: 'Pega la oferta o describe la empresa...',
    requiresInput: true
  },
  {
    id: 'optimize_star',
    label: 'Logros STAR',
    shortLabel: 'STAR',
    description: 'Convierte responsabilidades en logros concretos y medibles.',
    inputLabel: 'Notas opcionales',
    placeholder: 'Opcional: indica el tipo de rol o logros que quieres reforzar.',
    requiresInput: false
  },
  {
    id: 'translate',
    label: 'Traducir',
    shortLabel: 'Idioma',
    description: 'Traduce manteniendo formato Markdown y tono profesional.',
    inputLabel: 'Idioma de destino',
    placeholder: 'Ejemplo: ingles, aleman, frances...',
    requiresInput: true
  }
];

export function getAiAction(id: string): AiActionDefinition {
  return aiActions.find((action) => action.id === id) || aiActions[0];
}

export function getUsageCopy(usage?: Usage | null): string {
  if (!usage) return 'Inicia sesion para activar IA';
  if (usage.billing?.isActive) return 'IA Pro activa';
  return `${usage.remaining ?? 0} de ${usage.limit} usos disponibles`;
}
