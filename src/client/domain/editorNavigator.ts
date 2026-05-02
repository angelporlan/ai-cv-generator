import type { ParsedCv } from './editor';

export type NavigatorItem = {
  id: string;
  label: string;
  count: number;
};

export function buildNavigatorItems(parsed: ParsedCv, introLines: string[] = []): NavigatorItem[] {
  const items: NavigatorItem[] = [
    {
      id: 'profile',
      label: 'Perfil',
      count: Math.max(1, parsed.subtitle ? 2 : 1)
    }
  ];
  const seenLabels = new Map<string, number>();

  parsed.sections.forEach((section, index) => {
    const baseLabel = section.title.trim() || `Seccion ${index + 1}`;
    const normalizedLabel = baseLabel.toLowerCase();
    const occurrence = seenLabels.get(normalizedLabel) || 0;
    seenLabels.set(normalizedLabel, occurrence + 1);

    items.push({
      id: `section-${index}`,
      label: occurrence ? `${baseLabel} ${occurrence + 1}` : baseLabel,
      count: section.items.length + (index === 0 && introLines.length ? 1 : 0)
    });
  });

  return items;
}
