import { describe, expect, it } from 'vitest';
import { getQualitySignals, parseMarkdown, parseVisualStateFromMarkdown, serializeParsedCv, serializeVisualStateToMarkdown } from './editor';

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

  it('parses and serializes visual state without losing contacts, entries, lists or paragraphs', () => {
    const markdown = `# Jane Doe

Senior product manager

**Email:** jane@example.com
**LinkedIn:** linkedin.com/in/janedoe

## Experience
### Acme Corp
**Lead PM**
2022 - Present
Delivered a 30% conversion lift.
- Launched experiments
- Aligned teams

Paragraph about the role.

## Skills
- Strategy
- Research
`;

    const visual = parseVisualStateFromMarkdown(markdown);

    expect(visual.title).toBe('Jane Doe');
    expect(visual.intro).toContain('Senior product manager');
    expect(visual.contacts).toEqual([
      { label: 'Email', value: 'jane@example.com' },
      { label: 'LinkedIn', value: 'linkedin.com/in/janedoe' }
    ]);
    expect(visual.sections).toHaveLength(2);
    expect(visual.sections[0].blocks[0]).toMatchObject({
      type: 'entry',
      title: 'Acme Corp',
      role: 'Lead PM',
      date: '2022 - Present',
      summary: 'Delivered a 30% conversion lift.\nParagraph about the role.',
      bullets: 'Launched experiments\nAligned teams'
    });
    expect(visual.sections[1].blocks[0]).toMatchObject({
      type: 'list',
      items: 'Strategy\nResearch'
    });

    const roundtrip = serializeVisualStateToMarkdown(visual);
    expect(roundtrip).toContain('# Jane Doe');
    expect(roundtrip).toContain('Senior product manager');
    expect(roundtrip).toContain('**Email:** jane@example.com');
    expect(roundtrip).toContain('### Acme Corp');
    expect(roundtrip).toContain('- Launched experiments');
    expect(roundtrip).toContain('Paragraph about the role.');
  });
});
