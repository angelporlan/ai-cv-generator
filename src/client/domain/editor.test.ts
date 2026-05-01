import { describe, expect, it } from 'vitest';
import { getQualitySignals, parseMarkdown, serializeParsedCv } from './editor';

describe('editor domain', () => {
  it('parses markdown into title, subtitle and sections', () => {
    const parsed = parseMarkdown(`# Jane Doe

Product manager

## Experience
- Improved conversion by 20%

## Skills
- Research
`);

    expect(parsed.title).toBe('Jane Doe');
    expect(parsed.subtitle).toBe('Product manager');
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].items[0]).toBe('Improved conversion by 20%');
  });

  it('serializes parsed CV state back to markdown', () => {
    const markdown = serializeParsedCv({
      title: 'Jane Doe',
      subtitle: 'Designer',
      sections: [{ title: 'Skills', items: ['Figma', '- Research'] }]
    });

    expect(markdown).toContain('# Jane Doe');
    expect(markdown).toContain('## Skills');
    expect(markdown).toContain('- Figma');
    expect(markdown).toContain('- Research');
  });

  it('scores quality signals from external CV behavior', () => {
    const quality = getQualitySignals(`# Jane

jane@example.com

## Experiencia
- Aumente ventas un 30%

## Skills
- Node.js
`);

    expect(quality.score).toBe(100);
    expect(quality.checks.every((check) => check.passed)).toBe(true);
  });
});
