const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { CV_MAPPING } = require('./cv-content');

// Márgenes ligeramente ampliados para que el texto "respire" mejor
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

// Colores más definidos (negro puro para texto principal)
const COLORS = {
  text: '#000000',
  muted: '#555555',
  accent: '#000000',
  rule: '#000000'
};

// Tamaños de fuente base optimizados para mejor legibilidad en 1 página
const BASE_LAYOUT = {
  nameSize: 20,
  contactSize: 8.5,
  sectionSize: 11,
  headingSize: 10,
  metaSize: 9,
  bodySize: 9,
  bulletSize: 9,
  lineGap: 1.5,
  sectionGap: 0.5,
  paragraphGap: 0.2,
  bulletGap: 0.15,
  entryGap: 0.4
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getFontScale(fontSize) {
  const numeric = Number(fontSize);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  // 12.5px is the default UI value.
  return clamp(numeric / 12.5, 0.75, 1.8);
}

function buildLayout(scale) {
  const layout = {};
  for (const [key, value] of Object.entries(BASE_LAYOUT)) {
    layout[key] = value * scale;
  }
  return layout;
}

const MODERN_CONFIG = {
  sidebarWidth: 175,
  sidebarColor: '#1a5f7a', // Petroleum Blue
  accentColor: '#1a5f7a',
  sidebarPadding: 22,
  mainPadding: 25,
  sidebarTextColor: '#ffffff',
  sidebarMutedColor: '#d1d5db',
  lineColor: '#e5e7eb'
};

function normalizeLine(line) {
  return line.replace(/\r/g, '').trimEnd();
}

const SVG_ICONS = {
  linkedIn: 'M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z',
  github: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  web: 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  email: 'M0 3v18h24v-18h-24zm6.623 7.929l-4.623 5.712v-9.458l4.623 3.746zm-4.141-5.929h19.035l-9.517 7.713-9.518-7.713zm5.694 7.188l3.824 3.099 3.83-3.104 5.612 8.817h-18.779l5.513-8.812zm9.208-1.264l4.616-3.741v9.348l-4.616-5.607z',
  phone: 'M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.75-.03-1.02.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21c.28-.26.36-.65.25-1C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z',
  location: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'
};

function getIconType(label, value = '') {
  const nl = label.toLowerCase();
  const nv = value.toLowerCase();
  if (nl.includes('linkedin')) return 'linkedIn';
  if (nl.includes('github')) return 'github';
  if (nl.includes('portfolio') || nl.includes('web') || nv.includes('http')) return 'web';
  if (nl.includes('phone') || nl.includes('teléfono') || /^\+?[0-9\s-]{7,}$/.test(nv)) return 'phone';
  if (nl.includes('email') || nl.includes('correo') || nv.includes('@')) return 'email';
  if (nl.includes('location') || nl.includes('ubicación')) return 'location';
  return null;
}

function drawIcon(doc, type, x, y, size, color = '#000000') {
  const p = SVG_ICONS[type];
  if (!p) return false;
  doc.save().translate(x, y).scale(size / 24).path(p).fill(color).restore();
  return true;
}

function cleanMarkdownInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();
}

function slugifyFile(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function parseCvMarkdown(content) {
  const lines = content.split('\n').map(normalizeLine);
  const cv = {
    name: 'Curriculum Vitae',
    contact: [],
    sections: []
  };

  let currentSection = null;
  let currentEntry = null;
  let currentParagraphs = [];

  function flushParagraphs(target) {
    if (!currentParagraphs.length || !target) {
      currentParagraphs = [];
      return;
    }

    const paragraph = cleanMarkdownInline(currentParagraphs.join(' ').trim());
    if (!paragraph) {
      currentParagraphs = [];
      return;
    }

    if (!target.paragraphs) {
      target.paragraphs = [];
    }

    target.paragraphs.push(paragraph);
    currentParagraphs = [];
  }

  function ensureSection(title) {
    currentSection = {
      title: cleanMarkdownInline(title),
      paragraphs: [],
      entries: [],
      bullets: []
    };
    cv.sections.push(currentSection);
    currentEntry = null;
    currentParagraphs = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line === '---') {
      flushParagraphs(currentEntry || currentSection);
      continue;
    }

    if (line.startsWith('# ')) {
      cv.name = cleanMarkdownInline(line.slice(2)).replace(/^CV\s*--\s*/i, '').trim() || cv.name;
      continue;
    }

    const contactMatch = line.match(/^\*\*([^*]+):\*\*\s*(.+)$/);
    if (contactMatch && !currentSection) {
      cv.contact.push({
        label: cleanMarkdownInline(contactMatch[1]),
        value: cleanMarkdownInline(contactMatch[2])
      });
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraphs(currentEntry || currentSection);
      ensureSection(line.slice(3));
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraphs(currentEntry || currentSection);
      currentEntry = {
        heading: cleanMarkdownInline(line.slice(4)),
        subheading: '',
        date: '',
        paragraphs: [],
        bullets: []
      };
      if (currentSection) {
        currentSection.entries.push(currentEntry);
      }
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraphs(currentEntry || currentSection);
      const bullet = cleanMarkdownInline(line.slice(2));
      if (currentEntry) {
        currentEntry.bullets.push(bullet);
      } else if (currentSection) {
        currentSection.bullets.push(bullet);
      }
      continue;
    }

    if (line.startsWith('**') && line.endsWith('**') && currentEntry && !currentEntry.subheading) {
      currentEntry.subheading = cleanMarkdownInline(line);
      continue;
    }

    if (currentEntry && !currentEntry.date && !line.startsWith('**')) {
      currentEntry.date = cleanMarkdownInline(line);
      continue;
    }

    currentParagraphs.push(line);
  }

  flushParagraphs(currentEntry || currentSection);
  return cv;
}

function ensurePageSpace(doc, heightNeeded) {
  // Sin saltos de página por diseño (todo en 1 página)
  return;
}

function drawSectionHeading(doc, title, layout) {
  ensurePageSpace(doc, 22);
  doc.moveDown(layout.sectionGap);

  doc.font('Helvetica-Bold')
    .fontSize(layout.sectionSize)
    .fillColor(COLORS.accent)
    .text(title.toUpperCase(), PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'left',
      characterSpacing: 0.5
    });

  const ruleY = doc.y + 2.5; // Mejor separación de la línea
  doc.moveTo(PAGE_MARGIN, ruleY)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, ruleY)
    .strokeColor(COLORS.rule)
    .lineWidth(0.75) // Línea un poco más sólida
    .stroke();

  doc.y = ruleY + 4.5;
}

function drawParagraph(doc, text, layout, options = {}) {
  const font = options.font || 'Helvetica';
  const size = options.size || layout.bodySize;
  const color = options.color || COLORS.text;
  const gap = options.gap ?? layout.paragraphGap;
  const align = options.align || 'left';

  ensurePageSpace(doc, size * 3);
  doc.font(font)
    .fontSize(size)
    .fillColor(color)
    .text(text, PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align,
      lineGap: layout.lineGap
    });

  doc.moveDown(gap);
}

function drawBullet(doc, text, layout) {
  ensurePageSpace(doc, 16);
  // Posiciones ajustadas para el sangrado de las viñetas
  const bulletX = PAGE_MARGIN + 8;
  const textX = PAGE_MARGIN + 18;
  const startY = doc.y;

  // Tamaño de viñeta corregido
  doc.font('Helvetica')
    .fontSize(layout.bulletSize)
    .fillColor(COLORS.text)
    .text('\u2022', bulletX, startY);

  doc.font('Helvetica')
    .fontSize(layout.bodySize)
    .fillColor(COLORS.text)
    .text(text, textX, startY, {
      width: CONTENT_WIDTH - 18,
      align: 'left',
      lineGap: layout.lineGap
    });

  doc.moveDown(layout.bulletGap);
}

function drawEntry(doc, entry, layout) {
  ensurePageSpace(doc, 28);
  const startY = doc.y;

  // Título alineado a la izquierda
  doc.font('Helvetica-Bold')
    .fontSize(layout.headingSize)
    .fillColor(COLORS.text)
    .text(entry.heading, PAGE_MARGIN, startY, {
      width: CONTENT_WIDTH * 0.7,
      continued: false
    });

  // Fecha perfectamente alineada a la derecha en la misma línea
  if (entry.date) {
    doc.font('Helvetica')
      .fontSize(layout.metaSize)
      .fillColor(COLORS.muted)
      .text(entry.date, PAGE_MARGIN, startY, {
        width: CONTENT_WIDTH,
        align: 'right'
      });
  }

  // Subtítulo (Rol)
  if (entry.subheading) {
    doc.y += 1;
    doc.font('Helvetica-Oblique')
      .fontSize(layout.metaSize)
      .fillColor(COLORS.text)
      .text(entry.subheading, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH
      });
  }

  doc.moveDown(0.15);

  for (const paragraph of entry.paragraphs || []) {
    drawParagraph(doc, paragraph, layout, { gap: layout.paragraphGap });
  }

  for (const bullet of entry.bullets || []) {
    drawBullet(doc, bullet, layout);
  }

  doc.moveDown(layout.entryGap);
}

function drawContactLines(doc, contact, layout, showIcons = true) {
  if (!contact.length) {
    return;
  }

  const sep = '   ·   ';
  const iconSize = layout.contactSize * 0.9;
  const iconGap = 3;

  const renderLine = (items, y) => {
    let totalWidth = 0;
    const itemData = items.map((item, i) => {
      const text = `${item.label}: ${item.value}`;
      const textWidth = doc.widthOfString(text);
      const iconType = showIcons ? getIconType(item.label, item.value) : null;
      const iconWidth = iconType ? iconSize + iconGap : 0;
      const sepWidth = (i < items.length - 1) ? doc.widthOfString(sep) : 0;
      totalWidth += iconWidth + textWidth + sepWidth;
      return { text, textWidth, iconType, iconWidth, sepWidth };
    });

    let currentX = PAGE_MARGIN + (CONTENT_WIDTH - totalWidth) / 2;
    itemData.forEach((data) => {
      if (data.iconType) {
        drawIcon(doc, data.iconType, currentX, y - 0.5, iconSize, COLORS.muted);
        currentX += data.iconWidth;
      }
      doc.text(data.text, currentX, y, { lineBreak: false });
      currentX += data.textWidth;
      if (data.sepWidth > 0) {
        doc.text(sep, currentX, y, { lineBreak: false });
        currentX += data.sepWidth;
      }
    });
  };

  doc.font('Helvetica')
    .fontSize(layout.contactSize)
    .fillColor(COLORS.muted);

  const firstLineItems = contact.slice(0, 3);
  renderLine(firstLineItems, doc.y);
  doc.y += layout.contactSize;

  if (contact.length > 3) {
    doc.y += 2.5; // Margen entre líneas de contacto
    const secondLineItems = contact.slice(3);
    renderLine(secondLineItems, doc.y);
    doc.y += layout.contactSize;
  }
}

function drawSkillsSection(doc, section, layout) {
  drawSectionHeading(doc, section.title, layout);

  const items = [...(section.paragraphs || []), ...(section.bullets || [])];
  if (!items.length) {
    return;
  }

  ensurePageSpace(doc, 50);

  for (const item of items) {
    const parts = item.split(':');
    if (parts.length >= 2) {
      const label = parts[0].trim();
      const value = parts.slice(1).join(':').trim();
      const startY = doc.y;

      doc.font('Helvetica-Bold')
        .fontSize(layout.bodySize)
        .fillColor(COLORS.accent)
        .text(label + ': ', PAGE_MARGIN + 6, startY, {
          continued: true,
          width: CONTENT_WIDTH - 6
        });

      doc.font('Helvetica')
        .fontSize(layout.bodySize)
        .fillColor(COLORS.text)
        .text(value, {
          width: CONTENT_WIDTH - 6,
          lineGap: layout.lineGap
        });

      doc.moveDown(0.08);
    } else {
      doc.font('Helvetica')
        .fontSize(layout.bodySize)
        .fillColor(COLORS.text)
        .text(item, PAGE_MARGIN + 6, doc.y, {
          width: CONTENT_WIDTH - 6,
          lineGap: layout.lineGap
        });
      doc.moveDown(0.08);
    }
  }
}

function renderCvPdf(doc, cv, layout, showIcons = true) {
  // Existing Harvard rendering remains here...
  doc.info.Title = `CV - ${cv.name}`;
  doc.info.Author = cv.name;
  doc.info.Subject = 'Curriculum Vitae';

  // Nombre con más presencia visual
  doc.font('Helvetica-Bold')
    .fontSize(layout.nameSize)
    .fillColor(COLORS.text)
    .text(cv.name.toUpperCase(), PAGE_MARGIN, PAGE_MARGIN, {
      width: CONTENT_WIDTH,
      align: 'center',
      characterSpacing: 1.2
    });

  doc.moveDown(0.2);
  drawContactLines(doc, cv.contact, layout, showIcons);

  const headerRuleY = doc.y + 12; // Añadido más margen antes de la raya
  doc.moveTo(PAGE_MARGIN, headerRuleY)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, headerRuleY)
    .strokeColor(COLORS.accent)
    .lineWidth(0.8)
    .stroke();

  doc.y = headerRuleY + 10; // Añadido más margen después de la raya

  for (const section of cv.sections) {
    if (section.title.toLowerCase() === 'skills' || section.title.toLowerCase() === 'habilidades') {
      drawSkillsSection(doc, section, layout);
    } else {
      drawSectionHeading(doc, section.title, layout);

      for (const paragraph of section.paragraphs || []) {
        drawParagraph(doc, paragraph, layout);
      }

      for (const entry of section.entries || []) {
        drawEntry(doc, entry, layout);
      }

      for (const bullet of section.bullets || []) {
        drawBullet(doc, bullet, layout);
      }
    }
    doc.moveDown(layout.sectionGap);
  }
}

function renderModernCvPdf(doc, cv, scale = 1, showIcons = true) {
  const { sidebarWidth, sidebarColor, sidebarPadding, mainPadding, sidebarTextColor, sidebarMutedColor, accentColor, lineColor } = MODERN_CONFIG;
  const pageHeight = doc.page.height;
  const pageWidth = doc.page.width;

  // 1. Draw Sidebar Background
  doc.rect(0, 0, sidebarWidth, pageHeight).fill(sidebarColor);

  // 2. Split Content
  const sidebarSections = [];
  const mainSections = [];

  const sidebarTitles = ['skills', 'habilidades', 'idiomas', 'languages', 'aptitudes', 'contact', 'contacto', 'competencias'];

  for (const section of cv.sections) {
    if (sidebarTitles.includes(section.title.toLowerCase())) {
      sidebarSections.push(section);
    } else {
      mainSections.push(section);
    }
  }

  // 3. Draw Sidebar Content
  let currentY = 40;

  // Category Title Helper for Sidebar
  const drawSidebarHeading = (title) => {
    doc.font('Helvetica-Bold')
      .fontSize(11 * scale)
      .fillColor(sidebarTextColor)
      .text(title.toUpperCase(), sidebarPadding, currentY, { characterSpacing: 1 });
    currentY += 15;
    doc.moveTo(sidebarPadding, currentY)
      .lineTo(sidebarWidth - sidebarPadding, currentY)
      .strokeColor(sidebarMutedColor)
      .lineWidth(0.5)
      .stroke();
    currentY += 10;
  };

  // Draw Contact in Sidebar first if available
    if (cv.contact && cv.contact.length > 0) {
    drawSidebarHeading('Contacto');
    doc.font('Helvetica').fontSize(8.5 * scale).fillColor(sidebarTextColor);
    for (const info of cv.contact) {
      const label = info.label || '';
      const value = info.value || '';
      const iconType = showIcons ? getIconType(label, value) : null;
      const iconSize = 8.5 * scale;
      
      let textX = sidebarPadding;
      if (iconType) {
        drawIcon(doc, iconType, sidebarPadding, currentY + 1, iconSize, sidebarTextColor);
        textX += iconSize + 5;
      }
      
      const contactText = `${label}: ${value}`;
      doc.text(contactText, textX, currentY, { 
        width: sidebarWidth - sidebarPadding - textX + sidebarPadding, 
        lineGap: 2 
      });
      currentY = doc.y + 4;
    }
    currentY += 15;
  }

  // Draw Sidebar Sections
  for (const section of sidebarSections) {
    drawSidebarHeading(section.title);
    doc.font('Helvetica').fontSize(9 * scale).fillColor(sidebarTextColor);
    
    const items = [...(section.paragraphs || []), ...(section.bullets || [])];
    for (const item of items) {
      doc.text('• ' + item, sidebarPadding + 2, currentY, { 
        width: sidebarWidth - sidebarPadding * 2 - 2,
        lineGap: 2.5
      });
      currentY = doc.y + 3;
    }
    currentY += 15;
  }

  // 4. Draw Main Content
  const mainX = sidebarWidth + mainPadding;
  const mainWidth = pageWidth - sidebarWidth - mainPadding * 2;
  currentY = 40;
  const fs = (size) => size * scale;

  // Draw Name Header
  doc.font('Helvetica-Bold')
    .fontSize(fs(28))
    .fillColor('#333333')
    .text(cv.name, mainX, currentY);
  
  currentY = doc.y + 20;

  // Main Category Title Helper
  const drawMainHeading = (title) => {
    doc.font('Helvetica-Bold')
      .fontSize(fs(12))
      .fillColor(accentColor)
      .text(title.toUpperCase(), mainX, currentY, { characterSpacing: 0.5 });
    
    currentY = doc.y + 3;
    doc.moveTo(mainX, currentY)
      .lineTo(mainX + mainWidth, currentY)
      .strokeColor(lineColor)
      .lineWidth(1)
      .stroke();
    currentY += 10;
  };

  for (const section of mainSections) {
    drawMainHeading(section.title);

    // Draft Paragraphs
    for (const p of section.paragraphs || []) {
      doc.font('Helvetica').fontSize(fs(9.5)).fillColor('#444444').text(p, mainX, currentY, {
        width: mainWidth,
        lineGap: 2,
        align: 'justify'
      });
      currentY = doc.y + 8;
    }

    // Entries
    for (const entry of section.entries || []) {
      const entryY = currentY;
      
      // Heading (Left)
      doc.font('Helvetica-Bold').fontSize(fs(10)).fillColor('#333333').text(entry.heading, mainX, entryY, { width: mainWidth - 80 });
      
      // Date (Right)
      if (entry.date) {
        doc.font('Helvetica-Bold').fontSize(fs(9)).fillColor('#666666').text(entry.date, mainX, entryY, { align: 'right', width: mainWidth });
      }
      
      currentY = doc.y + 2;

      // Subheading
      if (entry.subheading) {
        doc.font('Helvetica-BoldOblique').fontSize(fs(9)).fillColor('#555555').text(entry.subheading, mainX, currentY);
        currentY = doc.y + 4;
      }

      // Entry Paragraphs
      for (const p of entry.paragraphs || []) {
        doc.font('Helvetica').fontSize(fs(9)).fillColor('#444444').text(p, mainX, currentY, { width: mainWidth, lineGap: 1.5 });
        currentY = doc.y + 4;
      }

      // Entry Bullets
      for (const b of entry.bullets || []) {
        doc.font('Helvetica').fontSize(fs(9)).fillColor('#444444').text('• ' + b, mainX + 10, currentY, { width: mainWidth - 10, lineGap: 1.5 });
        currentY = doc.y + 2;
      }
      
      currentY += 8;
    }

    // General Bullets
    for (const b of section.bullets || []) {
      doc.font('Helvetica').fontSize(fs(9.5)).fillColor('#444444').text('• ' + b, mainX + 10, currentY, { width: mainWidth - 10, lineGap: 2 });
      currentY = doc.y + 4;
    }

    currentY += 15;
  }
}

function getEmbeddedCvContent(fileName) {
  const safeFileName = fileName || 'cv.md';
  return CV_MAPPING[safeFileName] || null;
}

function getAllowedCvPath(fileName) {
  const safeFileName = fileName || 'cv.md';

  // Allow files from /cvs directory if they exist
  if (safeFileName.startsWith('cvs/')) {
    const cvPath = path.join(__dirname, safeFileName);
    if (!cvPath.startsWith(path.join(__dirname, 'cvs'))) {
      return null;
    }
    return cvPath;
  }

  return null;
}

function createPdfDocumentFromMarkdown(markdown, response, options = {}) {
  const cv = parseCvMarkdown(markdown);
  const templateType = options.template || 'harvard';
  const fontScale = getFontScale(options.fontSize);
  const layout = buildLayout(fontScale);
  const pdfName = options.fileName || `${slugifyFile(cv.name) || 'cv'}-${templateType}.pdf`;
  const contentDisposition = options.download ? 'attachment' : 'inline';
  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: 0, // Control manual en Modern, márgines en Harvard
      bottom: 0,
      left: 0,
      right: 0
    },
    bufferPages: true
  });

  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${contentDisposition}; filename="${pdfName}"`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  doc.pipe(response);
  
  if (templateType === 'modern') {
    renderModernCvPdf(doc, cv, fontScale, options.showIcons !== false);
  } else {
    renderCvPdf(doc, cv, layout, options.showIcons !== false);
  }
  doc.end();
}

function createCvPdfResponse(response, fileName) {
  const embeddedMarkdown = getEmbeddedCvContent(fileName);
  if (embeddedMarkdown) {
    createPdfDocumentFromMarkdown(embeddedMarkdown, response);
    return { ok: true };
  }

  const sourcePath = getAllowedCvPath(fileName);
  if (sourcePath && fs.existsSync(sourcePath)) {
    const markdown = fs.readFileSync(sourcePath, 'utf8');
    createPdfDocumentFromMarkdown(markdown, response);
    return { ok: true };
  }

  return {
    ok: false,
    statusCode: 404,
    error: 'CV source content not found'
  };
}

module.exports = {
  createPdfDocumentFromMarkdown,
  createCvPdfResponse,
  parseCvMarkdown
};
