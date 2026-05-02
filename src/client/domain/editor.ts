export type ParsedCv = {
  title: string;
  subtitle: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
};

export type VisualContact = {
  label: string;
  value: string;
};

export type VisualBlock =
  | {
      type: 'entry';
      title: string;
      role: string;
      date: string;
      summary: string;
      bullets: string;
    }
  | {
      type: 'list';
      items: string;
    }
  | {
      type: 'paragraph';
      text: string;
    };

export type VisualSection = {
  title: string;
  blocks: VisualBlock[];
};

export type VisualCvState = {
  title: string;
  intro: string;
  contacts: VisualContact[];
  sections: VisualSection[];
};

export function createEmptyVisualSection(): VisualSection {
  return {
    title: 'Nueva seccion',
    blocks: [{ type: 'paragraph', text: '' }]
  };
}

export const defaultMarkdown = `# Tu Nombre

Especialista en producto y tecnologia

## Perfil
- Resume en 3 lineas que haces, para quien y que resultados generas.

## Experiencia
- Empresa - Rol (2022 - Actualidad)
- Logro medible usando accion, contexto y resultado.

## Educacion
- Programa o titulacion - Institucion

## Skills
- React
- Node.js
- Comunicacion
`;

export function parseMarkdown(markdown: string): ParsedCv {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || 'CV sin titulo';
  const titleIndex = lines.findIndex((line) => line.startsWith('# '));
  const subtitle = lines.slice(titleIndex + 1).find((line) => line.trim() && !line.startsWith('#'))?.trim() || '';
  const sections: ParsedCv['sections'] = [];
  let current: ParsedCv['sections'][number] | null = null;

  lines.forEach((line) => {
    if (line.startsWith('## ')) {
      current = { title: line.replace(/^##\s+/, '').trim(), items: [] };
      sections.push(current);
      return;
    }

    if (current && line.trim()) {
      current.items.push(line.replace(/^[-*]\s*/, '').trim());
    }
  });

  return { title, subtitle, sections };
}

export function serializeParsedCv(cv: ParsedCv): string {
  const chunks = [`# ${cv.title}`, '', cv.subtitle, ''];
  cv.sections.forEach((section) => {
    chunks.push(`## ${section.title}`);
    section.items.forEach((item) => chunks.push(item.startsWith('- ') ? item : `- ${item}`));
    chunks.push('');
  });
  return chunks.join('\n').trim() + '\n';
}

export function parseVisualStateFromMarkdown(markdown: string): VisualCvState {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const state: VisualCvState = {
    title: 'Curriculum Vitae',
    intro: '',
    contacts: [],
    sections: []
  };

  let currentSection: VisualSection | null = null;
  let currentEntry: Extract<VisualBlock, { type: 'entry' }> | null = null;

  const ensureSection = (title: string) => {
    currentSection = { title, blocks: [] };
    state.sections.push(currentSection);
    currentEntry = null;
  };

  const addParagraph = (text: string) => {
    if (!currentSection) {
      state.intro = mergeLines(state.intro, text);
      return;
    }

    if (currentEntry) {
      currentEntry.summary = mergeLines(currentEntry.summary, text);
      return;
    }

    currentSection.blocks.push({ type: 'paragraph', text });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line === '---') continue;

    if (line.startsWith('# ')) {
      state.title = line.slice(2).replace(/^CV\s*--\s*/i, '').trim() || state.title;
      continue;
    }

    const contactMatch = line.match(/^\*\*([^*]+):\*\*\s*(.+)$/);
    if (contactMatch && !currentSection) {
      state.contacts.push({
        label: contactMatch[1].trim(),
        value: contactMatch[2].trim()
      });
      continue;
    }

    if (line.startsWith('## ')) {
      ensureSection(line.slice(3).trim());
      continue;
    }

    if (line.startsWith('### ')) {
      if (!currentSection) continue;

      currentEntry = {
        type: 'entry',
        title: line.slice(4).trim(),
        role: '',
        date: '',
        summary: '',
        bullets: ''
      };
      (currentSection as VisualSection).blocks.push(currentEntry);
      continue;
    }

    if (line.startsWith('- ')) {
      if (!currentSection) {
        state.intro = mergeLines(state.intro, line.slice(2).trim());
        continue;
      }

      if (currentEntry) {
        currentEntry.bullets = mergeLines(currentEntry.bullets, line.slice(2).trim());
        continue;
      }

      const listBlock = getOrCreateSectionListBlock(currentSection);
      listBlock.items = mergeLines(listBlock.items, line.slice(2).trim());
      continue;
    }

    if (currentEntry && line.startsWith('**') && line.endsWith('**') && !currentEntry.role) {
      currentEntry.role = line.replace(/\*\*/g, '').trim();
      continue;
    }

    if (currentEntry && !currentEntry.date) {
      currentEntry.date = line;
      continue;
    }

    addParagraph(line);
  }

  return state;
}

export function serializeVisualStateToMarkdown(state: VisualCvState): string {
  const lines: string[] = [];
  const title = state.title.trim() || 'CV sin titulo';
  lines.push(`# ${title}`, '');

  splitMultiline(state.intro).forEach((value) => lines.push(value));

  state.contacts
    .filter((contact) => contact.label.trim() || contact.value.trim())
    .forEach((contact) => {
      lines.push(`**${contact.label.trim() || 'Contacto'}:** ${contact.value.trim()}`);
    });

  if (state.intro.trim() && state.contacts.length > 0) {
    lines.push('');
  }

  if (state.intro.trim() || state.contacts.length > 0) {
    lines.push('');
  }

  state.sections
    .filter((section) => section.title.trim())
    .forEach((section, sectionIndex, validSections) => {
      if (sectionIndex > 0 || lines[lines.length - 1] !== '') {
        lines.push('');
      }

      lines.push(`## ${section.title.trim()}`);

      section.blocks.forEach((block) => {
        if (block.type === 'entry') {
          lines.push(`### ${block.title.trim() || 'Entrada'}`);
          if (block.role.trim()) lines.push(`**${block.role.trim()}**`);
          if (block.date.trim()) lines.push(block.date.trim());
          splitMultiline(block.summary).forEach((value) => lines.push(value));
          splitMultiline(block.bullets).forEach((value) => lines.push(`- ${value}`));
          lines.push('');
          return;
        }

        if (block.type === 'list') {
          splitMultiline(block.items).forEach((value) => lines.push(`- ${value}`));
          lines.push('');
          return;
        }

        splitMultiline(block.text).forEach((value) => lines.push(value));
        lines.push('');
      });

      if (sectionIndex === validSections.length - 1) {
        while (lines.length > 0 && lines[lines.length - 1] === '') {
          lines.pop();
        }
      }
    });

  return `${lines.join('\n').trimEnd()}\n`;
}

function mergeLines(existing: string, next: string) {
  if (!existing.trim()) return next.trim();
  if (!next.trim()) return existing.trim();
  return `${existing.trim()}\n${next.trim()}`;
}

function splitMultiline(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getOrCreateSectionListBlock(section: VisualSection) {
  const previous = section.blocks[section.blocks.length - 1];
  if (previous?.type === 'list') {
    return previous;
  }

  const block: Extract<VisualBlock, { type: 'list' }> = { type: 'list', items: '' };
  section.blocks.push(block);
  return block;
}

export function getQualitySignals(markdown: string) {
  const parsed = parseMarkdown(markdown);
  const hasContact = /@|linkedin\.com|github\.com|portfolio|tel/i.test(markdown);
  const hasMetrics = /\d+%|\d+x|\+\d+|\d+\s*(usuarios|clientes|proyectos|ventas|eur|€|k)/i.test(markdown);
  const hasSkills = parsed.sections.some((section) => /skill|habilidad|competencia/i.test(section.title));
  const hasExperience = parsed.sections.some((section) => /experiencia|experience/i.test(section.title));
  const score = [hasContact, hasMetrics, hasSkills, hasExperience].filter(Boolean).length * 25;

  return {
    score,
    checks: [
      { label: 'Contacto profesional', passed: hasContact },
      { label: 'Resultados medibles', passed: hasMetrics },
      { label: 'Skills claras', passed: hasSkills },
      { label: 'Experiencia estructurada', passed: hasExperience }
    ]
  };
}
