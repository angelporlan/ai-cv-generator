import type { ParsedCv } from './editor';

export type NavigatorItem = {
  id: string;
  label: string;
  count: number;
};

export type NavigatorRange = {
  id: string;
  start: number;
  end: number;
};

export function buildNavigatorItems(parsed: ParsedCv, introLines: string[] = []): NavigatorItem[] {
  const items: NavigatorItem[] = [
    {
      id: 'profile',
      label: 'Perfil',
      count: Math.max(1, introLines.length)
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

export function getIntroLines(markdown: string, parsed: ParsedCv) {
  const beforeSections: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('# ')) continue;
    if (line.startsWith('## ')) break;
    beforeSections.push(line.replace(/^[-*]\s*/, '').trim());
  }

  const fallback = [parsed.title, parsed.subtitle].filter(Boolean);
  return Array.from(new Set(beforeSections.length ? beforeSections : fallback)).slice(0, 7);
}

export function getMarkdownNavigatorRanges(markdown: string): NavigatorRange[] {
  const lines = markdown.split(/\r?\n/);
  const ranges: NavigatorRange[] = [];
  let cursor = 0;
  let sectionIndex = -1;
  let profileEnd = markdown.length;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (sectionIndex < 0) {
        profileEnd = cursor;
      } else {
        ranges[ranges.length - 1].end = cursor;
      }

      sectionIndex += 1;
      ranges.push({
        id: `section-${sectionIndex}`,
        start: cursor,
        end: markdown.length
      });
    }

    cursor += line.length + 1;
  }

  ranges.unshift({ id: 'profile', start: 0, end: profileEnd });
  return ranges;
}

export function getMarkdownNavigatorIdAtOffset(markdown: string, offset: number) {
  const ranges = getMarkdownNavigatorRanges(markdown);
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    if (offset >= ranges[index].start) {
      return ranges[index].id;
    }
  }

  return ranges[0]?.id || 'profile';
}

export function getMarkdownSectionRange(markdown: string, sectionId: string) {
  return getMarkdownNavigatorRanges(markdown).find((range) => range.id === sectionId) || null;
}
