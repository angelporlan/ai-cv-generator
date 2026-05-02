import { describe, expect, it } from 'vitest';
import { buildNavigatorItems, getIntroLines, getMarkdownNavigatorIdAtOffset, getMarkdownNavigatorRanges, getMarkdownSectionRange } from './editorNavigator';

describe('editor navigator', () => {
  it('builds stable items with a profile entry and deduplicated section labels', () => {
    const items = buildNavigatorItems(
      {
        title: 'Jane Doe',
        subtitle: 'Designer',
        sections: [
          { title: 'Experience', items: ['One', 'Two'] },
          { title: 'Experience', items: ['Three'] },
          { title: '', items: [] }
        ]
      },
      ['jane@example.com']
    );

    expect(items).toEqual([
      { id: 'profile', label: 'Perfil', count: 1 },
      { id: 'section-0', label: 'Experience', count: 3 },
      { id: 'section-1', label: 'Experience 2', count: 1 },
      { id: 'section-2', label: 'Seccion 3', count: 0 }
    ]);
  });

  it('derives intro lines and markdown ranges for scroll sync', () => {
    const markdown = `# Jane Doe\n\nProduct manager\n\n## Experience\n- One\n- Two\n\n## Skills\n- Research\n`;
    const ranges = getMarkdownNavigatorRanges(markdown);

    expect(getIntroLines(markdown, {
      title: 'Jane Doe',
      subtitle: 'Product manager',
      sections: []
    })).toEqual(['Product manager']);
    expect(ranges).toEqual([
      { id: 'profile', start: 0, end: 29 },
      { id: 'section-0', start: 29, end: 56 },
      { id: 'section-1', start: 56, end: markdown.length }
    ]);
    expect(getMarkdownNavigatorIdAtOffset(markdown, 30)).toBe('section-0');
    expect(getMarkdownSectionRange(markdown, 'section-1')).toEqual({ id: 'section-1', start: 56, end: markdown.length });
  });
});
