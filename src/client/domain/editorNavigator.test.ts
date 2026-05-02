import { describe, expect, it } from 'vitest';
import { buildNavigatorItems } from './editorNavigator';

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
      { id: 'profile', label: 'Perfil', count: 2 },
      { id: 'section-0', label: 'Experience', count: 3 },
      { id: 'section-1', label: 'Experience 2', count: 1 },
      { id: 'section-2', label: 'Seccion 3', count: 0 }
    ]);
  });
});
