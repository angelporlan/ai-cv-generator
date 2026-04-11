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

// Tamaños de fuente optimizados para mejor legibilidad en 1 página
const LAYOUT = {
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

function drawSectionHeading(doc, title) {
  ensurePageSpace(doc, 22);
  doc.moveDown(LAYOUT.sectionGap);

  doc.font('Helvetica-Bold')
    .fontSize(LAYOUT.sectionSize)
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

function drawParagraph(doc, text, options = {}) {
  const font = options.font || 'Helvetica';
  const size = options.size || LAYOUT.bodySize;
  const color = options.color || COLORS.text;
  const gap = options.gap ?? LAYOUT.paragraphGap;
  const align = options.align || 'left';

  ensurePageSpace(doc, size * 3);
  doc.font(font)
    .fontSize(size)
    .fillColor(color)
    .text(text, PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align,
      lineGap: LAYOUT.lineGap
    });

  doc.moveDown(gap);
}

function drawBullet(doc, text) {
  ensurePageSpace(doc, 16);
  // Posiciones ajustadas para el sangrado de las viñetas
  const bulletX = PAGE_MARGIN + 8;
  const textX = PAGE_MARGIN + 18;
  const startY = doc.y;

  // Tamaño de viñeta corregido
  doc.font('Helvetica')
    .fontSize(LAYOUT.bulletSize)
    .fillColor(COLORS.text)
    .text('\u2022', bulletX, startY);

  doc.font('Helvetica')
    .fontSize(LAYOUT.bodySize)
    .fillColor(COLORS.text)
    .text(text, textX, startY, {
      width: CONTENT_WIDTH - 18,
      align: 'left',
      lineGap: LAYOUT.lineGap
    });

  doc.moveDown(LAYOUT.bulletGap);
}

function drawEntry(doc, entry) {
  ensurePageSpace(doc, 28);
  const startY = doc.y;

  // Título alineado a la izquierda
  doc.font('Helvetica-Bold')
    .fontSize(LAYOUT.headingSize)
    .fillColor(COLORS.text)
    .text(entry.heading, PAGE_MARGIN, startY, {
      width: CONTENT_WIDTH * 0.7,
      continued: false
    });

  // Fecha perfectamente alineada a la derecha en la misma línea
  if (entry.date) {
    doc.font('Helvetica')
      .fontSize(LAYOUT.metaSize)
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
      .fontSize(LAYOUT.metaSize)
      .fillColor(COLORS.text)
      .text(entry.subheading, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH
      });
  }

  doc.moveDown(0.15);

  for (const paragraph of entry.paragraphs || []) {
    drawParagraph(doc, paragraph, { gap: LAYOUT.paragraphGap });
  }

  for (const bullet of entry.bullets || []) {
    drawBullet(doc, bullet);
  }

  doc.moveDown(LAYOUT.entryGap);
}

function drawContactLines(doc, contact) {
  if (!contact.length) {
    return;
  }

  // Usamos el separador clásico · con buenos espacios
  const sep = '   ·   ';
  const firstLine = contact.slice(0, 3).map((item) => `${item.label}: ${item.value}`).join(sep);
  const secondLine = contact.slice(3).map((item) => `${item.label}: ${item.value}`).join(sep);

  doc.font('Helvetica')
    .fontSize(LAYOUT.contactSize)
    .fillColor(COLORS.muted)
    .text(firstLine, PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
      lineGap: 1.5
    });

  if (secondLine) {
    doc.text(secondLine, PAGE_MARGIN, doc.y + 1, {
      width: CONTENT_WIDTH,
      align: 'center',
      lineGap: 1.5
    });
  }
}

function drawSkillsSection(doc, section) {
  drawSectionHeading(doc, section.title);

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
        .fontSize(LAYOUT.bodySize)
        .fillColor(COLORS.accent)
        .text(label + ': ', PAGE_MARGIN + 6, startY, {
          continued: true,
          width: CONTENT_WIDTH - 6
        });

      doc.font('Helvetica')
        .fontSize(LAYOUT.bodySize)
        .fillColor(COLORS.text)
        .text(value, {
          width: CONTENT_WIDTH - 6,
          lineGap: LAYOUT.lineGap
        });

      doc.moveDown(0.08);
    } else {
      doc.font('Helvetica')
        .fontSize(LAYOUT.bodySize)
        .fillColor(COLORS.text)
        .text(item, PAGE_MARGIN + 6, doc.y, {
          width: CONTENT_WIDTH - 6,
          lineGap: LAYOUT.lineGap
        });
      doc.moveDown(0.08);
    }
  }
}

function renderCvPdf(doc, cv) {
  // Existing Harvard rendering remains here...
  doc.info.Title = `CV - ${cv.name}`;
  doc.info.Author = cv.name;
  doc.info.Subject = 'Curriculum Vitae';

  // Nombre con más presencia visual
  doc.font('Helvetica-Bold')
    .fontSize(LAYOUT.nameSize)
    .fillColor(COLORS.text)
    .text(cv.name.toUpperCase(), PAGE_MARGIN, PAGE_MARGIN, {
      width: CONTENT_WIDTH,
      align: 'center',
      characterSpacing: 1.2
    });

  doc.moveDown(0.2);
  drawContactLines(doc, cv.contact);

  const headerRuleY = doc.y + 6;
  doc.moveTo(PAGE_MARGIN, headerRuleY)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, headerRuleY)
    .strokeColor(COLORS.accent)
    .lineWidth(0.8)
    .stroke();

  doc.y = headerRuleY + 6;

  for (const section of cv.sections) {
    if (section.title.toLowerCase() === 'skills' || section.title.toLowerCase() === 'habilidades') {
      drawSkillsSection(doc, section);
    } else {
      drawSectionHeading(doc, section.title);

      for (const paragraph of section.paragraphs || []) {
        drawParagraph(doc, paragraph);
      }

      for (const entry of section.entries || []) {
        drawEntry(doc, entry);
      }

      for (const bullet of section.bullets || []) {
        drawBullet(doc, bullet);
      }
    }
    doc.moveDown(LAYOUT.sectionGap);
  }
}

function renderModernCvPdf(doc, cv) {
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
      .fontSize(11)
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
    doc.font('Helvetica').fontSize(8.5).fillColor(sidebarTextColor);
    for (const info of cv.contact) {
      const contactText = typeof info === 'string' ? info : `${info.label}: ${info.value}`;
      doc.text(contactText, sidebarPadding, currentY, { width: sidebarWidth - sidebarPadding * 2, lineGap: 2 });
      currentY = doc.y + 4;
    }
    currentY += 15;
  }

  // Draw Sidebar Sections
  for (const section of sidebarSections) {
    drawSidebarHeading(section.title);
    doc.font('Helvetica').fontSize(9).fillColor(sidebarTextColor);
    
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

  // Draw Name Header
  doc.font('Helvetica-Bold')
    .fontSize(28)
    .fillColor('#333333')
    .text(cv.name, mainX, currentY);
  
  currentY = doc.y + 20;

  // Main Category Title Helper
  const drawMainHeading = (title) => {
    doc.font('Helvetica-Bold')
      .fontSize(12)
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
      doc.font('Helvetica').fontSize(9.5).fillColor('#444444').text(p, mainX, currentY, {
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
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text(entry.heading, mainX, entryY, { width: mainWidth - 80 });
      
      // Date (Right)
      if (entry.date) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#666666').text(entry.date, mainX, entryY, { align: 'right', width: mainWidth });
      }
      
      currentY = doc.y + 2;

      // Subheading
      if (entry.subheading) {
        doc.font('Helvetica-BoldOblique').fontSize(9).fillColor('#555555').text(entry.subheading, mainX, currentY);
        currentY = doc.y + 4;
      }

      // Entry Paragraphs
      for (const p of entry.paragraphs || []) {
        doc.font('Helvetica').fontSize(9).fillColor('#444444').text(p, mainX, currentY, { width: mainWidth, lineGap: 1.5 });
        currentY = doc.y + 4;
      }

      // Entry Bullets
      for (const b of entry.bullets || []) {
        doc.font('Helvetica').fontSize(9).fillColor('#444444').text('• ' + b, mainX + 10, currentY, { width: mainWidth - 10, lineGap: 1.5 });
        currentY = doc.y + 2;
      }
      
      currentY += 8;
    }

    // General Bullets
    for (const b of section.bullets || []) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#444444').text('• ' + b, mainX + 10, currentY, { width: mainWidth - 10, lineGap: 2 });
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
    renderModernCvPdf(doc, cv);
  } else {
    renderCvPdf(doc, cv);
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
