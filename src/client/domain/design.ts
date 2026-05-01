export type VisualTemplate = 'harvard' | 'modern' | 'minimal' | 'creative' | 'swiss';
export type FontFamily = 'helvetica' | 'times' | 'courier';

export type DesignSettings = {
  template: VisualTemplate;
  accentColor: string;
  fontFamily: FontFamily;
  pageMargin: number;
  showIcons: boolean;
};

export const defaultDesignSettings: DesignSettings = {
  template: 'harvard',
  accentColor: '#2563eb',
  fontFamily: 'helvetica',
  pageMargin: 36,
  showIcons: true
};

export const visualTemplates: Array<{ value: VisualTemplate; label: string; description: string }> = [
  { value: 'harvard', label: 'Clasico', description: 'Formal, sobrio y facil de leer.' },
  { value: 'modern', label: 'Moderno', description: 'Mas editorial, con jerarquia visual clara.' },
  { value: 'minimal', label: 'Minimal', description: 'Ligero, discreto y muy limpio.' },
  { value: 'creative', label: 'Creativo', description: 'Mas expresivo sin perder estructura.' },
  { value: 'swiss', label: 'Swiss', description: 'Precision, columnas y ritmo tipografico.' }
];

export const accentColors = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#b45309', '#111827'];

export const fontFamilies: Array<{ value: FontFamily; label: string }> = [
  { value: 'helvetica', label: 'Sans' },
  { value: 'times', label: 'Serif' },
  { value: 'courier', label: 'Mono' }
];

export const pageMargins = [
  { value: 28, label: 'Compacto' },
  { value: 36, label: 'Normal' },
  { value: 48, label: 'Amplio' }
];

export function normalizeDesignSettings(input: Partial<DesignSettings> = {}): DesignSettings {
  const template: VisualTemplate = input.template && visualTemplates.some((item) => item.value === input.template)
    ? input.template
    : defaultDesignSettings.template;
  const fontFamily: FontFamily = input.fontFamily && fontFamilies.some((item) => item.value === input.fontFamily)
    ? input.fontFamily
    : defaultDesignSettings.fontFamily;
  const pageMargin = input.pageMargin && pageMargins.some((item) => item.value === input.pageMargin)
    ? input.pageMargin
    : defaultDesignSettings.pageMargin;
  const accentColor = typeof input.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.accentColor)
    ? input.accentColor
    : defaultDesignSettings.accentColor;

  return {
    template,
    fontFamily,
    pageMargin,
    accentColor,
    showIcons: input.showIcons !== false
  };
}
