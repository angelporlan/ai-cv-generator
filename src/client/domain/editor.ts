export type ParsedCv = {
  title: string;
  subtitle: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
};

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
