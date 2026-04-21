const STORAGE_KEY = 'cv-studio-markdown';
const SAVE_INTERVAL_MS = 2500;
const VISUAL_TEMPLATE_STORAGE_KEY = 'cv-studio-visual-template';
const EDITOR_FONT_SIZE_STORAGE_KEY = 'cv-studio-editor-font-size';

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const saveStatus = document.getElementById('save-status');
const importButton = document.getElementById('import-button');
const exampleButton = document.getElementById('example-button');
const downloadMdButton = document.getElementById('download-md-button');
const downloadPdfButton = document.getElementById('download-pdf-button');
const fileInput = document.getElementById('file-input');
const templateSelector = document.getElementById('template-selector');
const visualTemplateSelector = document.getElementById('visual-template-selector');
const editorModeSwitch = document.getElementById('editor-mode-switch');
const editorBody = document.querySelector('.editor-body');
const visualEditor = document.getElementById('visual-editor');
const workspace = document.querySelector('.workspace');
const editorPanel = document.querySelector('.editor-panel');
const previewPanel = document.querySelector('.preview-panel');
const workspaceResizer = document.getElementById('workspace-resizer');
const libraryModal = document.getElementById('library-modal');
const openLibraryBtn = document.getElementById('open-library-button');
const closeLibraryBtn = document.getElementById('close-library-button');
const saveToLibraryBtn = document.getElementById('save-to-library-button');
const libraryItemsContainer = document.getElementById('library-items');
const libraryCountTag = document.getElementById('library-count');
const newCvNameInput = document.getElementById('new-cv-name');
const newCvStatusSelect = document.getElementById('new-cv-status');
const newCvDateInput = document.getElementById('new-cv-date');
const newCvUrlInput = document.getElementById('new-cv-url');
const newCvDescriptionInput = document.getElementById('new-cv-description');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');

const LIBRARY_STORAGE_KEY = 'cv-studio-library';
const EDITOR_MODE_STORAGE_KEY = 'cv-studio-editor-mode';
const ADAPT_TOKEN_STORAGE_KEY = 'cv-studio-openrouter-token';
const ADAPT_MODEL_STORAGE_KEY = 'cv-studio-openrouter-model';
const openAdaptModalButton = document.getElementById('open-adapt-modal-button');
const adaptCvModal = document.getElementById('adapt-cv-modal');
const closeAdaptModalButton = document.getElementById('close-adapt-modal-button');
const adaptModelSelect = document.getElementById('adapt-model-select');
const adaptJobDescription = document.getElementById('adapt-job-description');
const adaptOpenRouterToken = document.getElementById('adapt-openrouter-token');
const adaptSubmitButton = document.getElementById('adapt-submit-button');
const adaptCancelButton = document.getElementById('adapt-cancel-button');
const toggleReferenceButton = document.getElementById('toggle-reference-button');
const referencePane = document.getElementById('reference-pane');
const referenceCvSelect = document.getElementById('reference-cv-select');
const referenceEditor = document.getElementById('reference-editor');
const referenceVisual = document.getElementById('reference-visual');
const referenceModeSwitch = document.getElementById('reference-mode-switch');
const closeReferencePaneButton = document.getElementById('close-reference-pane');
const REFERENCE_CV_STORAGE_KEY = 'cv-studio-reference-cv-id';
const REFERENCE_MODE_STORAGE_KEY = 'cv-studio-reference-mode';
const WORKSPACE_SPLIT_STORAGE_KEY = 'cv-studio-workspace-split';

let currentReferenceMode = localStorage.getItem(REFERENCE_MODE_STORAGE_KEY) === 'visual' ? 'visual' : 'markdown';
let showIcons = localStorage.getItem('cv-studio-show-icons') !== 'false';

function setReferenceToggleButton(isOpen) {
  if (!toggleReferenceButton) return;
  const label = isOpen ? 'Ocultar comparación' : 'Comparar CV';
  toggleReferenceButton.innerHTML = `
    <svg viewBox="0 0 12 12" fill="none">
      <path d="M1.5 2.2h3.8v7.6H1.5V2.2zm5.2 0h3.8v7.6H6.7V2.2z" stroke="currentColor" stroke-width="1.1" />
    </svg>
    ${label}
  `;
}

let libraryData = [];
let currentEditorMode = 'visual';
let visualNeedsRefreshFromMarkdown = true;
let isSyncingFromVisual = false;
let sectionsSortable = null;
let visualState = {
  title: '',
  contacts: [],
  sections: []
};

let saveTimer = null;
let lastSavedValue = '';

function setStatus(message) {
  saveStatus.textContent = message;
}

/**
 * Muestra un modal de confirmación personalizado
 * @param {Object} options - { title, message, okText, cancelText, variant }
 * @returns {Promise<boolean>}
 */
function showConfirm({ title, message, okText = 'Confirmar', cancelText = 'Cancelar', variant = 'primary' } = {}) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title || '¿Estás seguro?';
    confirmMessage.textContent = message || 'Esta acción no se puede deshacer.';
    confirmOkBtn.textContent = okText;
    confirmCancelBtn.textContent = cancelText;

    if (cancelText) {
      confirmCancelBtn.style.display = 'inline-flex';
    } else {
      confirmCancelBtn.style.display = 'none';
    }

    // Aplicar variante (por ejemplo, rojo para peligro)
    confirmOkBtn.className = `button button-${variant}`;

    const handleOk = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      confirmOkBtn.removeEventListener('click', handleOk);
      confirmCancelBtn.removeEventListener('click', handleCancel);
      confirmModal.classList.remove('active');
    };

    confirmOkBtn.addEventListener('click', handleOk);
    confirmCancelBtn.addEventListener('click', handleCancel);
    confirmModal.classList.add('active');
  });
}

/**
 * Muestra un aviso personalizado (equivalente a alert)
 */
async function showAlert(message, title = 'Atención') {
  await showConfirm({
    title,
    message,
    okText: 'Entendido',
    cancelText: '', // Ocultar si está vacío (necesitamos CSS para eso o lógica aquí)
  });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toSafeText(value) {
  return typeof value === 'string' ? value : '';
}

const ICON_MAP = {
  linkedIn: 'fa-brands fa-linkedin',
  github: 'fa-brands fa-github',
  portfolio: 'fa-solid fa-globe',
  web: 'fa-solid fa-globe',
  website: 'fa-solid fa-globe',
  phone: 'fa-solid fa-phone',
  teléfono: 'fa-solid fa-phone',
  email: 'fa-solid fa-envelope',
  correo: 'fa-solid fa-envelope',
  location: 'fa-solid fa-location-dot',
  ubicación: 'fa-solid fa-location-dot',
  dirección: 'fa-solid fa-location-dot',
  twitter: 'fa-brands fa-twitter',
  x: 'fa-brands fa-x-twitter',
  instagram: 'fa-brands fa-instagram',
  facebook: 'fa-brands fa-facebook',
  stackoverflow: 'fa-brands fa-stack-overflow',
  youtube: 'fa-brands fa-youtube',
  behance: 'fa-brands fa-behance',
  dribbble: 'fa-brands fa-dribbble'
};

function getIconForLabel(label, value = '') {
  const normalizedLabel = label.toLowerCase().trim();
  const normalizedValue = value.toLowerCase().trim();
  
  // 1. Check by label
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (normalizedLabel.includes(key.toLowerCase())) {
      return `<i class="${icon}"></i>`;
    }
  }
  
  // 2. Check by value (URLs)
  if (normalizedValue.includes('linkedin.com')) return `<i class="${ICON_MAP.linkedIn}"></i>`;
  if (normalizedValue.includes('github.com')) return `<i class="${ICON_MAP.github}"></i>`;
  if (normalizedValue.includes('twitter.com')) return `<i class="${ICON_MAP.twitter}"></i>`;
  if (normalizedValue.includes('x.com')) return `<i class="${ICON_MAP.x}"></i>`;
  if (normalizedValue.includes('instagram.com')) return `<i class="${ICON_MAP.instagram}"></i>`;
  if (normalizedValue.includes('facebook.com')) return `<i class="${ICON_MAP.facebook}"></i>`;
  
  // 3. Guess by content
  if (normalizedValue.includes('@')) return `<i class="${ICON_MAP.email}"></i>`;
  if (/^\+?[0-9\s-]{7,}$/.test(normalizedValue)) return `<i class="${ICON_MAP.phone}"></i>`;
  
  return '';
}

function renderInlineMarkdown(text, strip = false) {
  if (strip) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1');
  }
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function parseMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const data = {
    title: 'Curriculum Vitae',
    contacts: [],
    sections: []
  };

  let currentSection = null;
  let currentEntry = null;

  function ensureSection(title) {
    currentSection = { title, items: [] };
    data.sections.push(currentSection);
    currentEntry = null;
  }

  function addParagraph(text) {
    if (!currentSection) {
      return;
    }
    if (currentEntry) {
      currentEntry.content.push({ type: 'paragraph', text });
      return;
    }
    currentSection.items.push({ type: 'paragraph', text });
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line === '---') {
      continue;
    }

    if (line.startsWith('# ')) {
      data.title = line.slice(2).replace(/^CV\s*--\s*/i, '').trim() || data.title;
      continue;
    }

    const contactMatch = line.match(/^\*\*([^*]+):\*\*\s*(.+)$/);
    if (contactMatch && !currentSection) {
      data.contacts.push({
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
      if (!currentSection) {
        continue;
      }

      currentEntry = {
        type: 'entry',
        title: line.slice(4).trim(),
        role: '',
        date: '',
        content: []
      };
      currentSection.items.push(currentEntry);
      continue;
    }

    if (line.startsWith('- ')) {
      const target = currentEntry || currentSection;
      if (!target) {
        continue;
      }

      const list = currentEntry
        ? currentEntry.content
        : currentSection.items;

      const previous = list[list.length - 1];
      if (!previous || previous.type !== 'list') {
        list.push({ type: 'list', items: [line.slice(2).trim()] });
      } else {
        previous.items.push(line.slice(2).trim());
      }
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

  return data;
}

function createEmptySection() {
  return { title: 'Nueva sección', blocks: [] };
}

function parseMarkdownToVisualState(markdown) {
  const parsed = parseMarkdown(markdown);

  return {
    title: toSafeText(parsed.title),
    contacts: parsed.contacts.map((contact) => ({
      label: toSafeText(contact.label),
      value: toSafeText(contact.value)
    })),
    sections: parsed.sections.map((section) => ({
      title: toSafeText(section.title),
      blocks: section.items.map((item) => {
        if (item.type === 'entry') {
          const paragraphs = item.content
            .filter((content) => content.type === 'paragraph')
            .map((content) => content.text)
            .join('\n');
          const bullets = item.content
            .filter((content) => content.type === 'list')
            .flatMap((content) => content.items)
            .join('\n');

          return {
            type: 'entry',
            title: toSafeText(item.title),
            role: toSafeText(item.role),
            date: toSafeText(item.date),
            summary: paragraphs,
            bullets
          };
        }

        if (item.type === 'list') {
          return {
            type: 'list',
            items: item.items.join('\n')
          };
        }

        return {
          type: 'paragraph',
          text: toSafeText(item.text)
        };
      })
    }))
  };
}

function splitMultiline(value) {
  return toSafeText(value)
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function serializeVisualStateToMarkdown(state) {
  const lines = [];
  lines.push(`# CV -- ${toSafeText(state.title).trim() || 'Nombre Apellido'}`);
  lines.push('');

  state.contacts
    .filter((contact) => toSafeText(contact.label).trim() && toSafeText(contact.value).trim())
    .forEach((contact) => {
      lines.push(`**${contact.label.trim()}:** ${contact.value.trim()}`);
    });

  if (state.contacts.length > 0) {
    lines.push('');
  }

  state.sections
    .filter((section) => toSafeText(section.title).trim())
    .forEach((section, sectionIndex, validSections) => {
      if (sectionIndex > 0 || lines[lines.length - 1] !== '') {
        lines.push('---');
        lines.push('');
      }

      lines.push(`## ${section.title.trim()}`);
      lines.push('');

      section.blocks.forEach((block) => {
        if (block.type === 'entry') {
          lines.push(`### ${toSafeText(block.title).trim() || 'Puesto / Proyecto'}`);
          if (toSafeText(block.role).trim()) {
            lines.push(`**${block.role.trim()}**`);
          }
          if (toSafeText(block.date).trim()) {
            lines.push(block.date.trim());
          }
          lines.push('');

          splitMultiline(block.summary).forEach((paragraphLine) => {
            lines.push(paragraphLine);
          });

          splitMultiline(block.bullets).forEach((bulletLine) => {
            lines.push(`- ${bulletLine}`);
          });

          lines.push('');
          return;
        }

        if (block.type === 'list') {
          splitMultiline(block.items).forEach((item) => {
            lines.push(`- ${item}`);
          });
          lines.push('');
          return;
        }

        splitMultiline(block.text).forEach((paragraphLine) => {
          lines.push(paragraphLine);
        });
        lines.push('');
      });

      if (sectionIndex === validSections.length - 1) {
        return;
      }
    });

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function renderPreview(markdown) {
  const data = parseMarkdown(markdown);

  const sectionsHtml = data.sections.map((section) => {
    const isSkills = section.title.toLowerCase() === 'skills' || section.title.toLowerCase() === 'habilidades';
    
    let itemsHtml;
    
    if (isSkills) {
      const items = section.items.flatMap(item => {
        if (item.type === 'list') return item.items;
        if (item.type === 'paragraph') return [item.text];
        return [];
      });

      itemsHtml = items.map(item => {
        const colonIndex = item.indexOf(':');
        if (colonIndex !== -1) {
          const label = item.substring(0, colonIndex).trim();
          const value = item.substring(colonIndex + 1).trim();
          return `<div class="skill-row"><span class="skill-label">${renderInlineMarkdown(label, true)}:</span> ${renderInlineMarkdown(value, true)}</div>`;
        }
        return `<div class="skill-row">${renderInlineMarkdown(item, true)}</div>`;
      }).join('');
    } else {
      itemsHtml = section.items.map((item) => {
        if (item.type === 'paragraph') {
          return `<p>${renderInlineMarkdown(item.text)}</p>`;
        }

        if (item.type === 'list') {
          return `<ul>${item.items.map((entry) => `<li>${renderInlineMarkdown(entry)}</li>`).join('')}</ul>`;
        }

        const contentHtml = item.content.map((content) => {
          if (content.type === 'paragraph') {
            return `<p>${renderInlineMarkdown(content.text)}</p>`;
          }
          return `<ul>${content.items.map((entry) => `<li>${renderInlineMarkdown(entry)}</li>`).join('')}</ul>`;
        }).join('');

        return `
          <article class="entry">
            <div class="entry-header">
              <h3>${renderInlineMarkdown(item.title)}</h3>
              ${item.date ? `<span class="entry-meta">${renderInlineMarkdown(item.date)}</span>` : ''}
            </div>
            ${item.role ? `<p class="entry-role">${renderInlineMarkdown(item.role)}</p>` : ''}
            ${contentHtml}
          </article>
        `;
      }).join('');
    }

    return `
      <section>
        <h2>${renderInlineMarkdown(section.title)}</h2>
        <div class="section-rule"></div>
        ${itemsHtml}
      </section>
    `;
  }).join('');

  preview.innerHTML = `
    <header>
      <h1>${renderInlineMarkdown(data.title)}</h1>
      <div class="preview-contact">
        ${data.contacts.map((contact) => `
          <span>
            ${showIcons ? getIconForLabel(contact.label, contact.value) : ''}
            ${renderInlineMarkdown(contact.label)}: ${renderInlineMarkdown(contact.value)}
          </span>
        `).join('')}
      </div>
    </header>
    ${sectionsHtml || '<p class="empty-state">Empieza a escribir tu CV en markdown para verlo aquí.</p>'}
  `;
}

function saveToLocalStorage(force = false) {
  const value = editor.value;
  if (!force && value === lastSavedValue) {
    return;
  }

  localStorage.setItem(STORAGE_KEY, value);
  lastSavedValue = value;
  setStatus(`Guardado local · ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
}

function scheduleSave() {
  setStatus('Escribiendo...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveToLocalStorage(), SAVE_INTERVAL_MS);
}

const PREVIEW_DEBOUNCE_MS = 600;
const pdfPreview = document.getElementById('pdf-preview');
let previewTimer = null;
let currentPreviewUrl = null;

async function updatePdfPreview() {
  const markdown = editor.value;
  if (!markdown.trim()) return;
  const fontSize = Number(localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY) || '12.5');

  try {
    const response = await fetch('/api/preview.pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        markdown, 
        download: false,
        template: visualTemplateSelector ? visualTemplateSelector.value : 'harvard',
        fontSize,
        showIcons,
        accentColor: localStorage.getItem(EDITOR_ACCENT_COLOR_KEY) || '',
        fontFamily: localStorage.getItem(EDITOR_FONT_FAMILY_KEY) || 'helvetica',
        pageMargin: Number(localStorage.getItem(EDITOR_PAGE_MARGIN_KEY)) || 36
      })
    });

    if (!response.ok) throw new Error('Preview failed');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    // Cleanup previous URL to avoid memory leaks
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
    
    // Ocultar barras de herramientas y ajustar al ancho (FitH)
    currentPreviewUrl = url;
    pdfPreview.src = `${url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
  } catch (error) {
    console.error('[preview] Error updating PDF:', error);
  }
}

/* ── Library Management ────────────────────────────────────────── */
function loadLibraryData() {
  const saved = localStorage.getItem(LIBRARY_STORAGE_KEY);
  try {
    libraryData = saved ? JSON.parse(saved) : [];
    // Migración básica y saneamiento
    libraryData = libraryData.map(cv => ({
      ...cv,
      status: cv.status || (cv.space === 'Trabajo' ? 'Enviado' : 'Archivado'),
      description: cv.description || cv.space || '',
      jobUrl: cv.jobUrl || '',
      lastUsedDate: cv.lastUsedDate || cv.date || new Date().toISOString()
    }));
  } catch (e) {
    libraryData = [];
  }
  renderLibrary();
}

function formatDate(isoString) {
  if (!isoString) return 'Sin fecha';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return 'Sin fecha';
  }
}

function getStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('enviado')) return 'status-enviado';
  if (s.includes('entrevista')) return 'status-entrevista';
  if (s.includes('prueba')) return 'status-prueba';
  if (s.includes('aceptado') || s.includes('oferta')) return 'status-aceptado';
  if (s.includes('rechazado')) return 'status-rechazado';
  return 'status-archivado';
}

function saveLibraryData() {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(libraryData));
  renderLibrary();
}

let librarySearchTerm = '';
let libraryStatusFilter = 'all';
let libraryViewMode = localStorage.getItem('cv-studio-library-view') || 'list';

function bindCardEvents(container) {
  container.querySelectorAll('.load-cv').forEach(btn => {
    btn.addEventListener('click', () => loadCvFromLibrary(btn.dataset.id));
  });
  container.querySelectorAll('.delete-cv').forEach(btn => {
    btn.addEventListener('click', () => deleteFromLibrary(btn.dataset.id));
  });
  container.querySelectorAll('.edit-cv').forEach(btn => {
    btn.addEventListener('click', () => toggleEditForm(btn.dataset.id));
  });
  container.querySelectorAll('.cancel-edit').forEach(btn => {
    btn.addEventListener('click', () => toggleEditForm(btn.dataset.id, false));
  });
  container.querySelectorAll('.save-edit').forEach(btn => {
    btn.addEventListener('click', () => saveEditForm(btn.dataset.id));
  });
}

function renderKanban(sortedList) {
  const kanbanContainer = document.getElementById('library-kanban');
  if (!kanbanContainer) return;

  const statuses = ['Enviado', 'Entrevista', 'Prueba Técnica', 'Aceptado', 'Rechazado', 'Archivado'];
  
  kanbanContainer.innerHTML = statuses.map(status => {
    const items = sortedList.filter(cv => (cv.status || 'Archivado') === status);
    
    const itemsHtml = items.map(cv => {
      const statusOptionsHtml = statuses
        .map(s => `<option value="${s}"${cv.status === s ? ' selected' : ''}>${s}</option>`)
        .join('');
      const dateValue = cv.lastUsedDate ? new Date(cv.lastUsedDate).toISOString().split('T')[0] : '';
      
      return `
      <div class="cv-card" data-cv-id="${cv.id}">
        <div class="cv-card-header">
          <div class="cv-card-name">${escapeHtml(cv.name)}</div>
        </div>
        ${cv.jobUrl ? `<div class="cv-card-description" style="margin-bottom: 4px;"><a href="${cv.jobUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>Ver Oferta</a></div>` : ''}
        ${cv.description ? `<div class="cv-card-description">${escapeHtml(cv.description)}</div>` : ''}
        <div class="cv-card-footer">
          <span class="cv-card-date">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            ${formatDate(cv.lastUsedDate)}
          </span>
        </div>
        <div class="cv-card-actions">
          <button class="button-ghost-sm load-cv" data-id="${cv.id}" title="Cargar este CV">Abrir</button>
          <button class="button-ghost-sm edit-cv" data-id="${cv.id}" title="Editar datos">Editar</button>
          <button class="button-ghost-sm button-danger-ghost delete-cv" data-id="${cv.id}" title="Eliminar">Eliminar</button>
        </div>
        <div class="cv-card-edit-form" data-edit-id="${cv.id}" hidden>
          <div class="edit-row">
            <div class="edit-field"><span class="edit-field-label">Nombre</span><input type="text" class="edit-field-input" data-field="name" value="${escapeHtml(cv.name)}"></div>
            <div class="edit-field"><span class="edit-field-label">Estado</span><select class="edit-field-input" data-field="status">${statusOptionsHtml}</select></div>
          </div>
          <div class="edit-row">
            <div class="edit-field"><span class="edit-field-label">Fecha</span><input type="date" class="edit-field-input" data-field="lastUsedDate" value="${dateValue}"></div>
            <div class="edit-field"><span class="edit-field-label">URL</span><input type="url" class="edit-field-input" data-field="jobUrl" value="${escapeHtml(cv.jobUrl || '')}"></div>
          </div>
          <div class="edit-row full-width">
            <div class="edit-field"><span class="edit-field-label">Empresa</span><input type="text" class="edit-field-input" data-field="description" value="${escapeHtml(cv.description || '')}"></div>
          </div>
          <div class="cv-card-edit-actions">
            <button class="button button-secondary cancel-edit" data-id="${cv.id}" type="button">Cancelar</button>
            <button class="button button-primary save-edit" data-id="${cv.id}" type="button">Guardar</button>
          </div>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="kanban-column" data-status="${status}">
        <div class="kanban-column-header">
          <span>${status}</span>
          <span class="kanban-column-count">${items.length}</span>
        </div>
        <div class="kanban-column-body" data-status="${status}">
          ${itemsHtml}
        </div>
      </div>
    `;
  }).join('');

  bindCardEvents(kanbanContainer);
  initKanbanDragAndDrop();
}

let kanbanSortables = [];

function initKanbanDragAndDrop() {
  if (!window.Sortable) return;
  
  kanbanSortables.forEach(s => s.destroy());
  kanbanSortables = [];
  
  const columns = document.querySelectorAll('.kanban-column-body');
  columns.forEach(col => {
    const sortable = new window.Sortable(col, {
      group: 'kanban',
      animation: 150,
      ghostClass: 'kanban-ghost',
      dragClass: 'kanban-drag',
      onEnd: function (evt) {
        const itemEl = evt.item;
        const cvId = itemEl.dataset.cvId;
        const newStatus = evt.to.dataset.status;
        const oldStatus = evt.from.dataset.status;
        
        if (newStatus !== oldStatus) {
          const cv = libraryData.find(c => c.id === cvId);
          if (cv) {
            cv.status = newStatus;
            saveLibraryData(); // This will re-render everything
          }
        }
      }
    });
    kanbanSortables.push(sortable);
  });
}

function renderLibrary() {
  if (!libraryCountTag || !libraryItemsContainer) return;
  
  const filter = librarySearchTerm;
  const statusFilter = libraryStatusFilter;
  
  libraryCountTag.textContent = `${libraryData.length} CV${libraryData.length !== 1 ? 's' : ''}`;
  
  if (libraryData.length === 0) {
    libraryItemsContainer.innerHTML = `
      <div class="empty-library">
        <p>Aún no tienes CVs guardados. ¡Guarda el actual para empezar!</p>
      </div>
    `;
    return;
  }

  // Filtrar
  const normalizedFilter = filter.toLowerCase().trim();
  const filtered = libraryData.filter(cv => {
    const matchesText = !normalizedFilter || 
      (cv.name || '').toLowerCase().includes(normalizedFilter) ||
      (cv.description || '').toLowerCase().includes(normalizedFilter);
    
    const matchesStatus = statusFilter === 'all' || cv.status === statusFilter;
    
    return matchesText && matchesStatus;
  });

  // Set active toggle button
  const toggleButtons = document.querySelectorAll('#library-view-toggle .mode-tab');
  if (toggleButtons.length) {
    toggleButtons.forEach(btn => {
      const isActive = btn.dataset.view === libraryViewMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  }

  const gridContainer = document.getElementById('library-items');
  const kanbanContainer = document.getElementById('library-kanban');

  if (libraryViewMode === 'kanban') {
    if (gridContainer) gridContainer.hidden = true;
    if (kanbanContainer) kanbanContainer.hidden = false;
  } else {
    if (gridContainer) gridContainer.hidden = false;
    if (kanbanContainer) kanbanContainer.hidden = true;
  }

  if (filtered.length === 0) {
    if (gridContainer) {
      gridContainer.innerHTML = `
        <div class="no-results-message">
          <p>No se encontraron resultados para los filtros aplicados.</p>
        </div>
      `;
    }
    if (kanbanContainer) kanbanContainer.innerHTML = '';
    return;
  }

  // Ordenar por fecha de uso desc
  const sorted = [...filtered].sort((a, b) => new Date(b.lastUsedDate) - new Date(a.lastUsedDate));

  const statusOptions = ['Enviado', 'Entrevista', 'Prueba Técnica', 'Aceptado', 'Rechazado', 'Archivado'];

  libraryItemsContainer.innerHTML = sorted.map(cv => {
    const statusOptionsHtml = statusOptions
      .map(s => `<option value="${s}"${cv.status === s ? ' selected' : ''}>${s}</option>`)
      .join('');

    const dateValue = cv.lastUsedDate
      ? new Date(cv.lastUsedDate).toISOString().split('T')[0]
      : '';

    return `
    <div class="cv-card" data-cv-id="${cv.id}">
      <div class="cv-card-header">
        <div>
          <div class="cv-card-name">${escapeHtml(cv.name)}</div>
          <div class="status-badge ${getStatusClass(cv.status)}">${cv.status || 'Sin estado'}</div>
        </div>
      </div>
      
      ${cv.jobUrl ? `<div class="cv-card-description" style="margin-bottom: 4px;"><a href="${cv.jobUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        Ver Oferta
      </a></div>` : ''}
      ${cv.description ? `<div class="cv-card-description">${escapeHtml(cv.description)}</div>` : ''}
      
      <div class="cv-card-footer">
        <span class="cv-card-date">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          ${formatDate(cv.lastUsedDate)}
        </span>
      </div>

      <div class="cv-card-actions">
        <button class="button-ghost-sm load-cv" data-id="${cv.id}" title="Cargar este CV">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Abrir
        </button>
        <button class="button-ghost-sm edit-cv" data-id="${cv.id}" title="Editar datos">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Editar
        </button>
        <button class="button-ghost-sm button-danger-ghost delete-cv" data-id="${cv.id}" title="Eliminar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Eliminar
        </button>
      </div>

      <!-- Inline edit form (hidden by default) -->
      <div class="cv-card-edit-form" data-edit-id="${cv.id}" hidden>
        <div class="edit-row">
          <div class="edit-field">
            <span class="edit-field-label">Nombre</span>
            <input type="text" class="edit-field-input" data-field="name" value="${escapeHtml(cv.name)}">
          </div>
          <div class="edit-field">
            <span class="edit-field-label">Estado</span>
            <select class="edit-field-input" data-field="status">${statusOptionsHtml}</select>
          </div>
        </div>
        <div class="edit-row">
          <div class="edit-field">
            <span class="edit-field-label">Fecha de envío</span>
            <input type="date" class="edit-field-input" data-field="lastUsedDate" value="${dateValue}">
          </div>
          <div class="edit-field">
            <span class="edit-field-label">URL del trabajo</span>
            <input type="url" class="edit-field-input" data-field="jobUrl" value="${escapeHtml(cv.jobUrl || '')}" placeholder="https://...">
          </div>
        </div>
        <div class="edit-row full-width">
          <div class="edit-field">
            <span class="edit-field-label">Empresa / Descripción</span>
            <input type="text" class="edit-field-input" data-field="description" value="${escapeHtml(cv.description || '')}">
          </div>
        </div>
        <div class="cv-card-edit-actions">
          <button class="button button-secondary cancel-edit" data-id="${cv.id}" type="button">Cancelar</button>
          <button class="button button-primary save-edit" data-id="${cv.id}" type="button">Guardar</button>
        </div>
      </div>
    </div>
  `;
  }).join('');

  if (libraryViewMode === 'list') {
    bindCardEvents(libraryItemsContainer);
  } else {
    renderKanban(sorted);
  }
}

// Add event listener for view toggle
document.addEventListener('DOMContentLoaded', () => {
  const viewToggle = document.getElementById('library-view-toggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', (event) => {
      const tab = event.target.closest('.mode-tab');
      if (!tab || !tab.dataset.view) return;
      libraryViewMode = tab.dataset.view;
      localStorage.setItem('cv-studio-library-view', libraryViewMode);
      renderLibrary();
    });
  }
});

function toggleEditForm(id, forceOpen) {
  const card = document.querySelector(`.cv-card[data-cv-id="${id}"]`);
  const form = document.querySelector(`.cv-card-edit-form[data-edit-id="${id}"]`);
  if (!card || !form) return;

  const isHidden = form.hidden;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : isHidden;

  // Close all other edit forms first
  document.querySelectorAll('.cv-card-edit-form').forEach(f => {
    f.hidden = true;
    f.closest('.cv-card')?.classList.remove('is-editing');
  });

  form.hidden = !shouldOpen;
  card.classList.toggle('is-editing', shouldOpen);

  if (shouldOpen) {
    const firstInput = form.querySelector('input[type="text"]');
    if (firstInput) firstInput.focus();
  }
}

function saveEditForm(id) {
  const form = document.querySelector(`.cv-card-edit-form[data-edit-id="${id}"]`);
  if (!form) return;

  const cv = libraryData.find(c => c.id === id);
  if (!cv) return;

  const nameInput = form.querySelector('[data-field="name"]');
  const statusInput = form.querySelector('[data-field="status"]');
  const dateInput = form.querySelector('[data-field="lastUsedDate"]');
  const descInput = form.querySelector('[data-field="description"]');
  const urlInput = form.querySelector('[data-field="jobUrl"]');

  const newName = nameInput ? nameInput.value.trim() : cv.name;
  if (!newName) {
    showAlert('El nombre no puede estar vacío.', 'Nombre requerido');
    return;
  }

  cv.name = newName;
  cv.status = statusInput ? statusInput.value : cv.status;
  cv.lastUsedDate = dateInput && dateInput.value
    ? new Date(dateInput.value).toISOString()
    : cv.lastUsedDate;
  cv.description = descInput ? descInput.value.trim() : cv.description;
  cv.jobUrl = urlInput ? urlInput.value.trim() : cv.jobUrl;

  saveLibraryData();
  setStatus(`"${cv.name}" actualizado`);
}

function saveToLibrary() {
  const name = newCvNameInput.value.trim();
  const status = newCvStatusSelect.value;
  const description = newCvDescriptionInput.value.trim();
  const jobUrl = newCvUrlInput.value.trim();
  const dateValue = newCvDateInput.value;
  const content = editor.value;

  if (!name) {
    showAlert('Introduce un nombre para el CV', 'Nombre requerido');
    return;
  }

  const newCv = {
    id: Date.now().toString(),
    name,
    status,
    description,
    jobUrl,
    lastUsedDate: dateValue ? new Date(dateValue).toISOString() : new Date().toISOString(),
    content,
    visualTemplate: visualTemplateSelector ? visualTemplateSelector.value : 'harvard',
    date: new Date().toISOString()
  };

  libraryData.push(newCv);
  saveLibraryData();
  
  // Limpiar campos
  newCvNameInput.value = '';
  newCvDescriptionInput.value = '';
  newCvUrlInput.value = '';
  newCvDateInput.value = new Date().toISOString().split('T')[0];
  
  setStatus('Postulación guardada en la biblioteca');
}

async function loadCvFromLibrary(id) {
  const cv = libraryData.find(c => c.id === id);
  if (cv) {
    const confirmed = await showConfirm({
      title: `Cargar "${cv.name}"`,
      message: '¿Quieres cargar este CV? Se perderán los cambios actuales no guardados en el editor.',
      okText: 'Cargar CV',
      variant: 'primary'
    });

    if (confirmed) {
      if (cv.visualTemplate && visualTemplateSelector) {
        visualTemplateSelector.value = cv.visualTemplate;
        localStorage.setItem(VISUAL_TEMPLATE_STORAGE_KEY, cv.visualTemplate);
      }
      updateEditor(cv.content, `"${cv.name}" cargado`);
      closeLibrary();
    }
  }
}

async function deleteFromLibrary(id) {
  const cv = libraryData.find(c => c.id === id);
  if (cv) {
    const confirmed = await showConfirm({
      title: 'Eliminar CV',
      message: `¿Estás seguro de que quieres eliminar "${cv.name}"? Esta acción es permanente.`,
      okText: 'Eliminar',
      variant: 'danger'
    });

    if (confirmed) {
      libraryData = libraryData.filter(c => c.id !== id);
      saveLibraryData();
    }
  }
}

function openLibrary() {
  loadLibraryData();
  if (newCvDateInput && !newCvDateInput.value) {
    newCvDateInput.value = new Date().toISOString().split('T')[0];
  }
  libraryModal.classList.add('active');
}

function closeLibrary() {
  libraryModal.classList.remove('active');
  // Reset search
  librarySearchTerm = '';
  libraryStatusFilter = 'all';
  const searchInput = document.getElementById('library-search');
  if (searchInput) searchInput.value = '';
  const statusFilter = document.getElementById('library-status-filter');
  if (statusFilter) statusFilter.value = 'all';
}

function getStoredLibraryEntries() {
  const saved = localStorage.getItem(LIBRARY_STORAGE_KEY);
  try {
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderReferenceVisual(markdown) {
  if (!referenceVisual) return;

  const safeMarkdown = typeof markdown === 'string' ? markdown : '';
  const data = parseMarkdown(safeMarkdown);

  const sectionsHtml = data.sections.map((section) => {
    const itemsHtml = section.items.map((item) => {
      if (item.type === 'paragraph') {
        return `<p>${renderInlineMarkdown(item.text)}</p>`;
      }

      if (item.type === 'list') {
        return `<ul>${item.items.map((entry) => `<li>${renderInlineMarkdown(entry)}</li>`).join('')}</ul>`;
      }

      const contentHtml = item.content.map((content) => {
        if (content.type === 'paragraph') {
          return `<p>${renderInlineMarkdown(content.text)}</p>`;
        }
        return `<ul>${content.items.map((entry) => `<li>${renderInlineMarkdown(entry)}</li>`).join('')}</ul>`;
      }).join('');

      return `
        <article class="reference-entry">
          <div class="reference-entry-head">
            <h4>${renderInlineMarkdown(item.title)}</h4>
            ${item.date ? `<span>${renderInlineMarkdown(item.date)}</span>` : ''}
          </div>
          ${item.role ? `<p class="reference-entry-role">${renderInlineMarkdown(item.role)}</p>` : ''}
          ${contentHtml}
        </article>
      `;
    }).join('');

    return `
      <section class="reference-section">
        <h3>${renderInlineMarkdown(section.title)}</h3>
        ${itemsHtml}
      </section>
    `;
  }).join('');

  referenceVisual.innerHTML = `
    <div class="reference-visual-inner">
      <header class="reference-header">
        <h2>${renderInlineMarkdown(data.title)}</h2>
        <div class="reference-contact">
          ${data.contacts.map((contact) => `<span>${renderInlineMarkdown(contact.label)}: ${renderInlineMarkdown(contact.value)}</span>`).join('')}
        </div>
      </header>
      ${sectionsHtml || '<p class="reference-empty">Sin contenido para mostrar.</p>'}
    </div>
  `;
}

function applyReferenceMode(mode) {
  currentReferenceMode = mode === 'visual' ? 'visual' : 'markdown';
  localStorage.setItem(REFERENCE_MODE_STORAGE_KEY, currentReferenceMode);

  if (referenceEditor) {
    referenceEditor.hidden = currentReferenceMode !== 'markdown';
  }

  if (referenceVisual) {
    referenceVisual.hidden = currentReferenceMode !== 'visual';
  }

  if (referenceModeSwitch) {
    referenceModeSwitch.querySelectorAll('[data-reference-mode]').forEach((tab) => {
      const isActive = tab.getAttribute('data-reference-mode') === currentReferenceMode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }
}

function renderReferenceOptions(preferredId = '') {
  if (!referenceCvSelect) return [];

  const entries = getStoredLibraryEntries()
    .sort((a, b) => (a.space || '').localeCompare(b.space || '') || (a.name || '').localeCompare(b.name || ''));

  if (entries.length === 0) {
    referenceCvSelect.innerHTML = '<option value="" selected>No hay CVs guardados</option>';
    referenceCvSelect.disabled = true;
    return [];
  }

  referenceCvSelect.disabled = false;
  referenceCvSelect.innerHTML = entries
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name || 'CV sin nombre')} · ${escapeHtml(item.space || 'Sin espacio')}</option>`)
    .join('');

  const existing = entries.find((entry) => entry.id === preferredId);
  referenceCvSelect.value = existing ? existing.id : entries[0].id;
  return entries;
}

function updateReferenceContentById(id) {
  const entries = getStoredLibraryEntries();
  const selected = entries.find((entry) => entry.id === id);
  if (!selected || !referenceEditor) return;

  referenceEditor.value = selected.content || '';
  renderReferenceVisual(selected.content || '');
  localStorage.setItem(REFERENCE_CV_STORAGE_KEY, selected.id);
}

async function openReferencePane() {
  if (!referencePane || !editorBody) return;

  const savedId = localStorage.getItem(REFERENCE_CV_STORAGE_KEY) || '';
  const entries = renderReferenceOptions(savedId);

  if (entries.length === 0) {
    closeReferencePane();
    await showAlert('No tienes CVs guardados en "Mis CVs" para comparar.', 'Sin CVs guardados');
    return;
  }

  updateReferenceContentById(referenceCvSelect.value);
  applyReferenceMode(currentReferenceMode);
  referencePane.hidden = false;
  editorBody.classList.add('has-reference');
  setReferenceToggleButton(true);
}

function closeReferencePane() {
  if (!referencePane || !editorBody) return;
  referencePane.hidden = true;
  editorBody.classList.remove('has-reference');
  setReferenceToggleButton(false);
}

function applyWorkspaceSplit(editorPercent) {
  if (!workspace || !editorPanel || !previewPanel) return;
  if (window.matchMedia('(max-width: 900px)').matches) {
    editorPanel.style.flex = '';
    previewPanel.style.flex = '';
    return;
  }

  const safeEditor = Math.max(28, Math.min(72, editorPercent));
  const safePreview = 100 - safeEditor;
  editorPanel.style.flex = `0 0 ${safeEditor}%`;
  previewPanel.style.flex = `0 0 ${safePreview}%`;
}

function initWorkspaceResizer() {
  if (!workspace || !workspaceResizer || !editorPanel || !previewPanel) return;

  const saved = Number(localStorage.getItem(WORKSPACE_SPLIT_STORAGE_KEY) || '50');
  applyWorkspaceSplit(Number.isFinite(saved) ? saved : 50);

  let isDragging = false;

  const onPointerMove = (event) => {
    if (!isDragging) return;
    const rect = workspace.getBoundingClientRect();
    if (!rect.width) return;

    const offsetX = event.clientX - rect.left;
    const percent = (offsetX / rect.width) * 100;
    const clamped = Math.max(28, Math.min(72, percent));
    applyWorkspaceSplit(clamped);
    localStorage.setItem(WORKSPACE_SPLIT_STORAGE_KEY, clamped.toFixed(2));
  };

  const stopDragging = () => {
    if (!isDragging) return;
    isDragging = false;
    workspace.classList.remove('is-resizing');
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', stopDragging);
  };

  workspaceResizer.addEventListener('pointerdown', (event) => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      return;
    }

    event.preventDefault();
    isDragging = true;
    workspace.classList.add('is-resizing');
    document.body.style.cursor = 'col-resize';
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', stopDragging);
  });

  workspaceResizer.addEventListener('dblclick', () => {
    const defaultSplit = 50;
    applyWorkspaceSplit(defaultSplit);
    localStorage.setItem(WORKSPACE_SPLIT_STORAGE_KEY, String(defaultSplit));
  });

  window.addEventListener('resize', () => {
    const stored = Number(localStorage.getItem(WORKSPACE_SPLIT_STORAGE_KEY) || '50');
    applyWorkspaceSplit(Number.isFinite(stored) ? stored : 50);
  });
}

function openAdaptModal() {
  if (!adaptCvModal) return;
  const storedToken = localStorage.getItem(ADAPT_TOKEN_STORAGE_KEY);
  if (storedToken && adaptOpenRouterToken && !adaptOpenRouterToken.value.trim()) {
    adaptOpenRouterToken.value = storedToken;
  }

  const storedModel = localStorage.getItem(ADAPT_MODEL_STORAGE_KEY);
  if (storedModel && adaptModelSelect) {
    adaptModelSelect.value = storedModel;
  }

  adaptCvModal.classList.add('active');
  if (adaptJobDescription) {
    adaptJobDescription.focus();
  }
}

/* ── Personalization Panel Logic ─────────────────────────────── */
const EDITOR_ACCENT_COLOR_KEY = 'cv_studio_accent_color';
const EDITOR_FONT_FAMILY_KEY = 'cv_studio_font_family';
const EDITOR_PAGE_MARGIN_KEY = 'cv_studio_page_margin';

const toggleCustomizeBtn = document.getElementById('toggle-customize-btn');
const customizePanel = document.getElementById('customize-panel');
const presetColors = document.querySelectorAll('.color-preset');
const customHexColor = document.getElementById('custom-hex-color');
const fontFamilySelector = document.getElementById('font-family-selector');
const marginSelectorTabs = document.querySelectorAll('#margin-selector .mode-tab');

if (toggleCustomizeBtn && customizePanel) {
  toggleCustomizeBtn.addEventListener('click', () => {
    const isExpanded = toggleCustomizeBtn.getAttribute('aria-expanded') === 'true';
    toggleCustomizeBtn.setAttribute('aria-expanded', !isExpanded);
    toggleCustomizeBtn.classList.toggle('active');
    customizePanel.hidden = isExpanded;
  });
}

function updateColorUI(color) {
  presetColors.forEach(btn => {
    if (btn.dataset.color.toLowerCase() === color.toLowerCase()) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  customHexColor.value = color;
}

presetColors.forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    localStorage.setItem(EDITOR_ACCENT_COLOR_KEY, color);
    updateColorUI(color);
    schedulePreviewUpdate();
  });
});

if (customHexColor) {
  customHexColor.addEventListener('input', (e) => {
    const color = e.target.value;
    localStorage.setItem(EDITOR_ACCENT_COLOR_KEY, color);
    updateColorUI(color);
    schedulePreviewUpdate();
  });
}

if (fontFamilySelector) {
  const savedFont = localStorage.getItem(EDITOR_FONT_FAMILY_KEY) || 'helvetica';
  fontFamilySelector.value = savedFont;
  
  fontFamilySelector.addEventListener('change', (e) => {
    localStorage.setItem(EDITOR_FONT_FAMILY_KEY, e.target.value);
    schedulePreviewUpdate();
  });
}

marginSelectorTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    marginSelectorTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-checked', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-checked', 'true');
    localStorage.setItem(EDITOR_PAGE_MARGIN_KEY, tab.dataset.margin);
    schedulePreviewUpdate();
  });
});

const savedMargin = localStorage.getItem(EDITOR_PAGE_MARGIN_KEY) || '36';
marginSelectorTabs.forEach(tab => {
  if (tab.dataset.margin === savedMargin) {
    tab.classList.add('active');
    tab.setAttribute('aria-checked', 'true');
  } else {
    tab.classList.remove('active');
    tab.setAttribute('aria-checked', 'false');
  }
});

const savedColor = localStorage.getItem(EDITOR_ACCENT_COLOR_KEY);
if (savedColor) {
  updateColorUI(savedColor);
}

function closeAdaptModal() {
  if (!adaptCvModal) return;
  adaptCvModal.classList.remove('active');
}

async function adaptCvWithAi() {
  const markdown = editor.value;
  const model = adaptModelSelect ? adaptModelSelect.value : '';
  const actionSelect = document.getElementById('adapt-action-select');
  const action = actionSelect ? actionSelect.value : 'adapt';
  const jobDescription = adaptJobDescription ? adaptJobDescription.value.trim() : '';
  const token = adaptOpenRouterToken ? adaptOpenRouterToken.value.trim() : '';

  if (!markdown.trim()) {
    await showAlert('Primero escribe o carga un CV para poder usar la IA.', 'CV vacío');
    return;
  }

  if (!jobDescription && action !== 'optimize_star' && action !== 'translate') {
    await showAlert('Pega la descripción de la oferta para continuar.', 'Falta información');
    return;
  }

  if (!jobDescription && action === 'translate') {
    await showAlert('Escribe a qué idioma quieres traducir el currículum.', 'Falta información');
    return;
  }

  if (!token) {
    await showAlert('Añade tu token de OpenRouter para usar la IA.', 'Falta token');
    return;
  }

  localStorage.setItem(ADAPT_TOKEN_STORAGE_KEY, token);
  if (model) {
    localStorage.setItem(ADAPT_MODEL_STORAGE_KEY, model);
  }

  if (adaptSubmitButton) {
    adaptSubmitButton.disabled = true;
    adaptSubmitButton.textContent = 'Generando...';
  }

  setStatus('Procesando con IA...');

  try {
    const response = await fetch('/api/adapt-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, jobDescription, token, model, action })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
      const apiError = new Error(payload?.error || 'No se pudo adaptar el CV con IA');
      if (payload?.metadata) {
        apiError.metadata = payload.metadata;
      }
      throw apiError;
    }

    if (!payload?.markdown || !payload.markdown.trim()) {
      throw new Error('La IA no devolvió contenido válido');
    }

    updateEditor(payload.markdown, 'Operación con IA completada (Usa Ctrl+Z para deshacer si lo necesitas)');
    closeAdaptModal();
  } catch (error) {
    console.error('[adapt-cv] Error:', error);
    setStatus('Error adaptando CV con IA');
    closeAdaptModal();
    const selectedModel = model ? ` (${model})` : '';
    const rawDetails = error?.metadata?.raw ? `\n\nDetalle técnico:\n${error.metadata.raw}` : '';
    await showAlert(`${error.message || 'No se pudo adaptar el CV'}${selectedModel}${rawDetails}`, 'Error de IA');
  } finally {
    if (adaptSubmitButton) {
      adaptSubmitButton.disabled = false;
      adaptSubmitButton.textContent = 'Generar CV ATS';
    }
  }
}

function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePdfPreview, PREVIEW_DEBOUNCE_MS);
}

function blockTypeLabel(type) {
  if (type === 'entry') return 'Experiencia / Proyecto';
  if (type === 'list') return 'Lista';
  return 'Párrafo';
}

function buildVisualEditorHtml() {
  const contactRows = visualState.contacts.map((contact, contactIndex) => `
    <div class="visual-contact-row">
      <input class="visual-input" data-bind="contact-label" data-contact-index="${contactIndex}" placeholder="Etiqueta (Email, LinkedIn...)" value="${escapeHtml(toSafeText(contact.label))}">
      <input class="visual-input" data-bind="contact-value" data-contact-index="${contactIndex}" placeholder="Valor" value="${escapeHtml(toSafeText(contact.value))}">
      <button type="button" class="button-mini button-mini-danger" data-action="remove-contact" data-contact-index="${contactIndex}">Quitar</button>
    </div>
  `).join('');

  const sectionsHtml = visualState.sections.map((section, sectionIndex) => {
    const blocksHtml = section.blocks.map((block, blockIndex) => {
      const blockBody = block.type === 'entry'
        ? `
          <div class="visual-row">
            <input class="visual-input" data-bind="entry-title" data-section-index="${sectionIndex}" data-block-index="${blockIndex}" placeholder="Título (Empresa -- Ciudad)" value="${escapeHtml(toSafeText(block.title))}">
            <input class="visual-input" data-bind="entry-date" data-section-index="${sectionIndex}" data-block-index="${blockIndex}" placeholder="Fecha" value="${escapeHtml(toSafeText(block.date))}">
          </div>
          <input class="visual-input" data-bind="entry-role" data-section-index="${sectionIndex}" data-block-index="${blockIndex}" placeholder="Rol / Puesto" value="${escapeHtml(toSafeText(block.role))}">
          <textarea class="visual-textarea" data-bind="entry-summary" data-section-index="${sectionIndex}" data-block-index="${blockIndex}" placeholder="Resumen breve">${escapeHtml(toSafeText(block.summary))}</textarea>
          <textarea class="visual-textarea" data-bind="entry-bullets" data-section-index="${sectionIndex}" data-block-index="${blockIndex}" placeholder="Logros (uno por línea)">${escapeHtml(toSafeText(block.bullets))}</textarea>
        `
        : block.type === 'list'
          ? `<textarea class="visual-textarea" data-bind="list-items" data-section-index="${sectionIndex}" data-block-index="${blockIndex}" placeholder="Elemento de lista (uno por línea)">${escapeHtml(toSafeText(block.items))}</textarea>`
          : `<textarea class="visual-textarea" data-bind="paragraph-text" data-section-index="${sectionIndex}" data-block-index="${blockIndex}" placeholder="Texto del párrafo">${escapeHtml(toSafeText(block.text))}</textarea>`;

      return `
        <div class="visual-block">
          <div class="visual-block-head">
            <span class="visual-block-type">${blockTypeLabel(block.type)}</span>
            <button type="button" class="button-mini button-mini-danger" data-action="remove-block" data-section-index="${sectionIndex}" data-block-index="${blockIndex}">Quitar bloque</button>
          </div>
          ${blockBody}
        </div>
      `;
    }).join('');

    return `
      <div class="visual-section" data-section-index="${sectionIndex}">
        <div class="visual-section-head">
          <button type="button" class="drag-handle" aria-label="Arrastrar sección" title="Arrastrar sección">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M8 6h8M8 12h8M8 18h8"></path>
            </svg>
          </button>
          <input class="visual-input" data-bind="section-title" data-section-index="${sectionIndex}" placeholder="Título de sección" value="${escapeHtml(toSafeText(section.title))}">
          <button type="button" class="button-mini button-mini-danger" data-action="remove-section" data-section-index="${sectionIndex}">Quitar sección</button>
        </div>
        ${blocksHtml || '<div class="visual-empty">No hay bloques en esta sección.</div>'}
        <div class="visual-actions">
          <button type="button" class="button-mini" data-action="add-block" data-section-index="${sectionIndex}" data-block-type="entry">+ Experiencia</button>
          <button type="button" class="button-mini" data-action="add-block" data-section-index="${sectionIndex}" data-block-type="paragraph">+ Párrafo</button>
          <button type="button" class="button-mini" data-action="add-block" data-section-index="${sectionIndex}" data-block-type="list">+ Lista</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="visual-shell">
      <div class="visual-card">
        <div class="visual-card-head">
          <span class="visual-title">Cabecera del CV</span>
        </div>
        <input class="visual-input" data-bind="cv-title" placeholder="Nombre y apellido" value="${escapeHtml(toSafeText(visualState.title))}">
      </div>

      <div class="visual-card">
        <div class="visual-card-head">
          <span class="visual-title">Datos de contacto</span>
          <button type="button" class="button-mini" data-action="add-contact">+ Contacto</button>
        </div>
        <div class="visual-contact-grid">
          ${contactRows || '<div class="visual-empty">Agrega email, teléfono o enlaces.</div>'}
        </div>
      </div>

      <div class="visual-card">
        <div class="visual-card-head">
          <span class="visual-title">Bloques del CV</span>
          <button type="button" class="button-mini" data-action="add-section">+ Sección</button>
        </div>
        <div id="visual-sections-list" class="visual-sections-list">
          ${sectionsHtml || '<div class="visual-empty">Crea una sección para empezar a construir tu CV.</div>'}
        </div>
        <div class="visual-actions" style="margin-top: 12px;">
          <button type="button" class="button-mini" data-action="add-section">+ Añadir sección</button>
        </div>
      </div>
    </div>
  `;
}

function initSectionsDragAndDrop() {
  if (!visualEditor || !window.Sortable) {
    return;
  }

  const sectionsList = visualEditor.querySelector('#visual-sections-list');
  if (!sectionsList) {
    return;
  }

  const draggableSections = sectionsList.querySelectorAll('.visual-section');
  if (draggableSections.length < 2) {
    if (sectionsSortable) {
      sectionsSortable.destroy();
      sectionsSortable = null;
    }
    return;
  }

  if (sectionsSortable) {
    sectionsSortable.destroy();
    sectionsSortable = null;
  }

  sectionsSortable = new window.Sortable(sectionsList, {
    animation: 170,
    easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    handle: '.drag-handle',
    draggable: '.visual-section',
    ghostClass: 'visual-section-ghost',
    chosenClass: 'visual-section-chosen',
    dragClass: 'visual-section-drag',
    onEnd: (event) => {
      const fromIndex = event.oldIndex;
      const toIndex = event.newIndex;
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) {
        return;
      }

      const [movedSection] = visualState.sections.splice(fromIndex, 1);
      if (!movedSection) {
        return;
      }

      visualState.sections.splice(toIndex, 0, movedSection);
      renderVisualEditor();
      syncMarkdownFromVisual('Secciones reordenadas');
    }
  });
}

function autoResizeTextarea(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return;
  }

  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function initVisualTextareaAutoResize() {
  if (!visualEditor) {
    return;
  }

  visualEditor.querySelectorAll('.visual-textarea').forEach((textarea) => {
    autoResizeTextarea(textarea);
  });
}

function renderVisualEditor() {
  if (!visualEditor) return;
  visualEditor.innerHTML = buildVisualEditorHtml();
  initVisualTextareaAutoResize();
  initSectionsDragAndDrop();
}

function syncMarkdownFromVisual(statusMessage = 'Modo visual actualizado') {
  const markdown = serializeVisualStateToMarkdown(visualState);
  isSyncingFromVisual = true;
  editor.value = markdown;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  isSyncingFromVisual = false;
  setStatus(statusMessage);
}

function ensureVisualStateFromMarkdown() {
  if (!visualNeedsRefreshFromMarkdown) return;
  visualState = parseMarkdownToVisualState(editor.value);
  if (visualState.sections.length === 0) {
    visualState.sections.push(createEmptySection());
  }
  renderVisualEditor();
  visualNeedsRefreshFromMarkdown = false;
}

function switchEditorMode(mode) {
  currentEditorMode = mode === 'visual' ? 'visual' : 'markdown';
  localStorage.setItem(EDITOR_MODE_STORAGE_KEY, currentEditorMode);

  if (editorBody) {
    editorBody.classList.toggle('is-visual', currentEditorMode === 'visual');
    editorBody.classList.toggle('is-markdown', currentEditorMode === 'markdown');
  }

  if (visualEditor) {
    visualEditor.hidden = currentEditorMode !== 'visual';
  }

  if (currentEditorMode === 'visual') {
    ensureVisualStateFromMarkdown();
  }

  if (editorModeSwitch) {
    editorModeSwitch.querySelectorAll('.mode-tab').forEach((tab) => {
      const isActive = tab.dataset.mode === currentEditorMode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }
}

function addBlockToSection(section, blockType) {
  if (!section) return;

  if (blockType === 'entry') {
    section.blocks.push({
      type: 'entry',
      title: '',
      role: '',
      date: '',
      summary: '',
      bullets: ''
    });
    return;
  }

  if (blockType === 'list') {
    section.blocks.push({ type: 'list', items: '' });
    return;
  }

  section.blocks.push({ type: 'paragraph', text: '' });
}

function updateEditor(markdown, statusMessage = 'Listo') {
  editor.value = markdown;
  visualNeedsRefreshFromMarkdown = true;
  if (currentEditorMode === 'visual') {
    ensureVisualStateFromMarkdown();
  }
  schedulePreviewUpdate();
  scheduleSave();
  setStatus(statusMessage);
}

async function loadSource(fileName) {
  const response = await fetch(`/api/cv?file=${encodeURIComponent(fileName)}`);
  if (!response.ok) {
    throw new Error('No se pudo cargar el archivo');
  }

  return response.text();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadPdf() {
  setStatus('Generando PDF...');
  const fontSize = Number(localStorage.getItem(EDITOR_FONT_SIZE_STORAGE_KEY) || '12.5');
  const response = await fetch('/api/preview.pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      markdown: editor.value,
      download: true,
      template: visualTemplateSelector ? visualTemplateSelector.value : 'harvard',
      fontSize,
      showIcons,
      accentColor: localStorage.getItem(EDITOR_ACCENT_COLOR_KEY) || '',
      fontFamily: localStorage.getItem(EDITOR_FONT_FAMILY_KEY) || 'helvetica',
      pageMargin: Number(localStorage.getItem(EDITOR_PAGE_MARGIN_KEY)) || 36
    })
  });

  if (!response.ok) {
    setStatus('Error al generar PDF');
    return;
  }

  const blob = await response.blob();
  downloadBlob(blob, 'cv-preview.pdf');
  setStatus('PDF descargado');
}

editor.addEventListener('input', () => {
  if (!isSyncingFromVisual) {
    visualNeedsRefreshFromMarkdown = true;
  }
  schedulePreviewUpdate();
  scheduleSave();
});

if (editorModeSwitch) {
  editorModeSwitch.addEventListener('click', (event) => {
    const tab = event.target.closest('.mode-tab');
    if (!tab || !tab.dataset.mode) return;
    switchEditorMode(tab.dataset.mode);
  });
}

if (visualEditor) {
  visualEditor.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const action = trigger.dataset.action;
    const sectionIndex = Number(trigger.dataset.sectionIndex);
    const blockIndex = Number(trigger.dataset.blockIndex);
    const contactIndex = Number(trigger.dataset.contactIndex);

    if (action === 'add-contact') {
      visualState.contacts.push({ label: '', value: '' });
    }

    if (action === 'remove-contact' && Number.isInteger(contactIndex)) {
      visualState.contacts.splice(contactIndex, 1);
    }

    if (action === 'add-section') {
      visualState.sections.push(createEmptySection());
    }

    if (action === 'remove-section' && Number.isInteger(sectionIndex)) {
      visualState.sections.splice(sectionIndex, 1);
      if (visualState.sections.length === 0) {
        visualState.sections.push(createEmptySection());
      }
    }

    if (action === 'add-block' && Number.isInteger(sectionIndex)) {
      const section = visualState.sections[sectionIndex];
      addBlockToSection(section, trigger.dataset.blockType);
    }

    if (action === 'remove-block' && Number.isInteger(sectionIndex) && Number.isInteger(blockIndex)) {
      const section = visualState.sections[sectionIndex];
      if (section) {
        section.blocks.splice(blockIndex, 1);
      }
    }

    renderVisualEditor();
    syncMarkdownFromVisual();
  });

  visualEditor.addEventListener('input', (event) => {
    const field = event.target.dataset.bind;
    if (!field) return;

    if (event.target.matches('.visual-textarea')) {
      autoResizeTextarea(event.target);
    }

    const sectionIndex = Number(event.target.dataset.sectionIndex);
    const blockIndex = Number(event.target.dataset.blockIndex);
    const contactIndex = Number(event.target.dataset.contactIndex);

    if (field === 'cv-title') {
      visualState.title = event.target.value;
    }

    if (field === 'section-title' && Number.isInteger(sectionIndex) && visualState.sections[sectionIndex]) {
      visualState.sections[sectionIndex].title = event.target.value;
    }

    if (field === 'contact-label' && Number.isInteger(contactIndex) && visualState.contacts[contactIndex]) {
      visualState.contacts[contactIndex].label = event.target.value;
    }

    if (field === 'contact-value' && Number.isInteger(contactIndex) && visualState.contacts[contactIndex]) {
      visualState.contacts[contactIndex].value = event.target.value;
    }

    if (Number.isInteger(sectionIndex) && Number.isInteger(blockIndex)) {
      const section = visualState.sections[sectionIndex];
      const block = section?.blocks?.[blockIndex];
      if (block) {
        if (field === 'entry-title') block.title = event.target.value;
        if (field === 'entry-role') block.role = event.target.value;
        if (field === 'entry-date') block.date = event.target.value;
        if (field === 'entry-summary') block.summary = event.target.value;
        if (field === 'entry-bullets') block.bullets = event.target.value;
        if (field === 'list-items') block.items = event.target.value;
        if (field === 'paragraph-text') block.text = event.target.value;
      }
    }

    syncMarkdownFromVisual();
  });
}

if (visualTemplateSelector) {
  visualTemplateSelector.addEventListener('change', () => {
    localStorage.setItem(VISUAL_TEMPLATE_STORAGE_KEY, visualTemplateSelector.value);
    updatePdfPreview();
  });
}

templateSelector.addEventListener('change', async () => {
  const selectedFile = templateSelector.value;
  const confirmed = await showConfirm({
    title: 'Cambiar plantilla',
    message: `¿Quieres cargar la plantilla "${templateSelector.options[templateSelector.selectedIndex].text}"? Se perderán los cambios no guardados en el editor.`,
    okText: 'Cargar plantilla'
  });

  if (confirmed) {
    try {
      const content = await loadSource(selectedFile);
      updateEditor(content, 'Plantilla cargada');
    } catch (error) {
      setStatus('Error al cargar la plantilla');
    }
  } else {
    // Si cancela, restaurar el valor previo (esto es un poco complejo sin estado previo,
    // pero podemos intentar recargar el valor del editor si coincide con alguna plantilla o dejarlo así)
  }
});

importButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const text = await file.text();
  updateEditor(text, 'Archivo importado');
  fileInput.value = '';
});

exampleButton.addEventListener('click', async () => {
  try {
    const selectedFile = templateSelector.value;
    const exampleFile = selectedFile.replace('.md', '-example.md');
    const example = await loadSource(exampleFile);
    updateEditor(example, 'Ejemplo cargado');
  } catch (error) {
    setStatus('No se pudo cargar el ejemplo');
  }
});

downloadMdButton.addEventListener('click', () => {
  saveToLocalStorage(true);
  downloadBlob(new Blob([editor.value], { type: 'text/markdown;charset=utf-8' }), 'cv.md');
  setStatus('Markdown descargado');
});

openLibraryBtn.addEventListener('click', openLibrary);
closeLibraryBtn.addEventListener('click', closeLibrary);
saveToLibraryBtn.addEventListener('click', saveToLibrary);
libraryModal.addEventListener('click', (e) => {
  if (e.target === libraryModal) closeLibrary();
});

// Library search
const librarySearchInput = document.getElementById('library-search');
if (librarySearchInput) {
  librarySearchInput.addEventListener('input', () => {
    librarySearchTerm = librarySearchInput.value;
    renderLibrary();
  });
}

const libraryStatusFilterSelect = document.getElementById('library-status-filter');
if (libraryStatusFilterSelect) {
  libraryStatusFilterSelect.addEventListener('change', () => {
    libraryStatusFilter = libraryStatusFilterSelect.value;
    renderLibrary();
  });
}

if (openAdaptModalButton) {
  openAdaptModalButton.addEventListener('click', openAdaptModal);
}

if (closeAdaptModalButton) {
  closeAdaptModalButton.addEventListener('click', closeAdaptModal);
}

if (adaptCancelButton) {
  adaptCancelButton.addEventListener('click', closeAdaptModal);
}

if (adaptCvModal) {
  adaptCvModal.addEventListener('click', (event) => {
    if (event.target === adaptCvModal) {
      closeAdaptModal();
    }
  });
}

if (adaptSubmitButton) {
  adaptSubmitButton.addEventListener('click', adaptCvWithAi);
}

const adaptActionSelect = document.getElementById('adapt-action-select');
const adaptInputLabelContainer = document.getElementById('adapt-input-label-container');
const adaptInputLabel = document.getElementById('adapt-input-label');

if (adaptActionSelect && adaptInputLabel && adaptJobDescription) {
  adaptActionSelect.addEventListener('change', () => {
    const val = adaptActionSelect.value;
    if (val === 'translate') {
      adaptInputLabel.textContent = 'Idioma de destino';
      adaptJobDescription.placeholder = 'Ej: Inglés, Alemán, Francés...';
    } else if (val === 'optimize_star') {
      adaptInputLabel.textContent = 'Oferta laboral o notas (Opcional)';
      adaptJobDescription.placeholder = 'Opcional: Pega la oferta para alinear tus logros a lo que buscan, o déjalo vacío...';
    } else {
      adaptInputLabel.textContent = 'Descripción de la oferta';
      adaptJobDescription.placeholder = 'Pega aquí la oferta de trabajo completa...';
    }
    
    if (adaptSubmitButton) {
      if (val === 'cover_letter') adaptSubmitButton.textContent = 'Generar Carta';
      else if (val === 'skill_gap') adaptSubmitButton.textContent = 'Analizar Gap';
      else if (val === 'translate') adaptSubmitButton.textContent = 'Traducir CV';
      else if (val === 'optimize_star') adaptSubmitButton.textContent = 'Optimizar Logros';
      else adaptSubmitButton.textContent = 'Generar CV ATS';
    }
  });
}

const toggleIconsBtn = document.getElementById('toggle-icons-btn');
if (toggleIconsBtn) {
  // Sync initial state
  toggleIconsBtn.classList.toggle('active', showIcons);
  toggleIconsBtn.setAttribute('aria-checked', String(showIcons));
  
  toggleIconsBtn.addEventListener('click', () => {
    showIcons = !showIcons;
    localStorage.setItem('cv-studio-show-icons', String(showIcons));
    toggleIconsBtn.classList.toggle('active', showIcons);
    toggleIconsBtn.setAttribute('aria-checked', String(showIcons));
    
    // Actualizar el PDF inmediatamente al cambiar iconos
    setStatus(showIcons ? 'Iconos activados' : 'Iconos desactivados');
    updatePdfPreview();
  });
}

if (adaptJobDescription) {
  adaptJobDescription.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      adaptCvWithAi();
    }
  });
}

if (toggleReferenceButton) {
  toggleReferenceButton.addEventListener('click', () => {
    const isOpen = referencePane && !referencePane.hidden;
    if (isOpen) {
      closeReferencePane();
      return;
    }
    openReferencePane();
  });
}

if (closeReferencePaneButton) {
  closeReferencePaneButton.addEventListener('click', closeReferencePane);
}

if (referenceCvSelect) {
  referenceCvSelect.addEventListener('change', () => {
    updateReferenceContentById(referenceCvSelect.value);
  });
}

if (referenceModeSwitch) {
  referenceModeSwitch.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-reference-mode]');
    if (!tab) return;
    applyReferenceMode(tab.getAttribute('data-reference-mode'));
  });
}

if (editorBody) {
  editorBody.addEventListener('click', (event) => {
    const closeTrigger = event.target.closest('#close-reference-pane');
    if (closeTrigger) {
      closeReferencePane();
    }
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && referencePane && !referencePane.hidden) {
    closeReferencePane();
  }
});

downloadPdfButton.addEventListener('click', downloadPdf);

window.addEventListener('beforeunload', () => saveToLocalStorage(true));

window.addEventListener('cv-editor-font-size-changed', () => {
  schedulePreviewUpdate();
});

async function init() {
  try {
    initWorkspaceResizer();
    closeReferencePane();
    applyReferenceMode(currentReferenceMode);

    // Restaurar plantilla visual
    const savedTemplate = localStorage.getItem(VISUAL_TEMPLATE_STORAGE_KEY);
    if (savedTemplate && visualTemplateSelector) {
      visualTemplateSelector.value = savedTemplate;
    }

    const localDraft = localStorage.getItem(STORAGE_KEY);
    const savedEditorMode = localStorage.getItem(EDITOR_MODE_STORAGE_KEY);
    if (savedEditorMode === 'visual' || savedEditorMode === 'markdown') {
      currentEditorMode = savedEditorMode;
    }

    if (localDraft && localDraft.trim()) {
      editor.value = localDraft;
      lastSavedValue = localDraft;
      visualNeedsRefreshFromMarkdown = true;
      schedulePreviewUpdate();
      switchEditorMode(currentEditorMode);
      setStatus('Borrador local cargado');
      return;
    }

    const initialMarkdown = await loadSource('cv.md');
    editor.value = initialMarkdown;
    lastSavedValue = initialMarkdown;
    visualNeedsRefreshFromMarkdown = true;
    schedulePreviewUpdate();
    switchEditorMode(currentEditorMode);
    setStatus('cv.md cargado');
  } catch (error) {
    setStatus('Error cargando el CV');
  } finally {
    // Start tour if it's the first time
    setTimeout(() => {
      initTour(false); // false means auto-start check
    }, 1000);
  }
}

/* ── Interactive Tour (Driver.js) ───────────────────────────── */
function initTour(force = true) {
  if (typeof window.driver === 'undefined') return;

  const TOUR_STORAGE_KEY = 'cv-studio-tour-completed';
  if (!force && localStorage.getItem(TOUR_STORAGE_KEY) === 'true') {
    return;
  }

  const driverObj = window.driver.js.driver({
    showProgress: true,
    nextBtnText: 'Siguiente —›',
    prevBtnText: '‹— Anterior',
    doneBtnText: '¡Entendido!',
    progressText: '{{current}} de {{total}}',
    popoverClass: 'driverjs-theme',
    steps: [
      {
        popover: {
          title: '👋 ¡Bienvenido a CV Studio!',
          description: 'Permíteme darte una guía rápida por las herramientas premium que tienes a tu disposición para crear el mejor CV.',
          side: "left",
          align: 'start'
        }
      },
      {
        element: '#open-library-button',
        popover: {
          title: 'Biblioteca de CVs',
          description: 'Aquí puedes guardar diferentes versiones de tu CV, gestionar tus candidaturas y ver tu progreso en un tablero Kanban.',
          side: "bottom",
          align: 'end'
        }
      },
      {
        element: '#template-selector',
        popover: {
          title: 'Plantillas de Contenido',
          description: 'Elige una base de contenido profesional según tu sector para no empezar de cero.',
          side: "bottom",
          align: 'start'
        }
      },
      {
        element: '#visual-template-selector',
        popover: {
          title: 'Diseño Editorial',
          description: 'Cambia el estilo visual al instante. Tenemos desde el clásico Harvard hasta diseños modernos en columnas.',
          side: "bottom",
          align: 'start'
        }
      },
      {
        element: '#editor-mode-switch',
        popover: {
          title: 'Modos de Edición',
          description: '¿Prefieres la potencia de Markdown o la sencillez de un editor Visual? Cambia según te sientas más cómodo.',
          side: "bottom",
          align: 'start'
        }
      },
      {
        element: '#open-adapt-modal-button',
        popover: {
          title: 'Adaptación con IA',
          description: 'Esta es nuestra joya de la corona. Pega una oferta de trabajo y la IA optimizará tu CV para superar los filtros ATS automáticamente.',
          side: "bottom",
          align: 'start'
        }
      },
      {
        element: '#download-pdf-button',
        popover: {
          title: 'Exportación Premium',
          description: 'Cuando estés listo, descarga tu CV en un PDF perfectamente maquetado y listo para impresionar.',
          side: "bottom",
          align: 'end'
        }
      },
      {
        popover: {
          title: '🚀 ¡Todo listo!',
          description: 'Ya puedes empezar a crear tu futuro profesional. Si necesitas volver a ver esta guía, haz clic en el icono de ayuda en la parte superior.',
          side: "left",
          align: 'start'
        }
      }
    ],
    onDestroyed: () => {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    }
  });

  driverObj.drive();
}

const startTourBtn = document.getElementById('start-tour-button');
if (startTourBtn) {
  startTourBtn.addEventListener('click', () => initTour(true));
}

/* ── LinkedIn Importer Logic ─────────────────────────────── */
const importLinkedinButton = document.getElementById('import-linkedin-button');
const linkedinModal = document.getElementById('linkedin-modal');
const closeLinkedinModalBtn = document.getElementById('close-linkedin-modal-button');
const linkedinCancelBtn = document.getElementById('linkedin-cancel-button');
const linkedinSubmitBtn = document.getElementById('linkedin-submit-button');
const linkedinText = document.getElementById('linkedin-text');
const linkedinToken = document.getElementById('linkedin-openrouter-token');

if (importLinkedinButton && linkedinModal) {
  importLinkedinButton.addEventListener('click', () => {
    linkedinModal.classList.add('active');
    const storedToken = localStorage.getItem(ADAPT_TOKEN_STORAGE_KEY);
    if (storedToken && linkedinToken && !linkedinToken.value.trim()) {
      linkedinToken.value = storedToken;
    }
    linkedinText.value = '';
    linkedinText.focus();
  });

  const closeLinkedinModal = () => linkedinModal.classList.remove('active');
  
  if (closeLinkedinModalBtn) closeLinkedinModalBtn.addEventListener('click', closeLinkedinModal);
  if (linkedinCancelBtn) linkedinCancelBtn.addEventListener('click', closeLinkedinModal);

  if (linkedinSubmitBtn) {
    linkedinSubmitBtn.addEventListener('click', async () => {
      const text = linkedinText.value.trim();
      const token = linkedinToken.value.trim();

      if (!text) {
        alert('Por favor, pega el texto de tu perfil de LinkedIn.');
        linkedinText.focus();
        return;
      }
      if (!token) {
        alert('Por favor, ingresa tu token de OpenRouter.');
        linkedinToken.focus();
        return;
      }

      localStorage.setItem(ADAPT_TOKEN_STORAGE_KEY, token);
      
      const originalBtnText = linkedinSubmitBtn.innerText;
      linkedinSubmitBtn.innerText = 'Procesando perfil con IA...';
      linkedinSubmitBtn.disabled = true;

      try {
        const response = await fetch('/api/import-linkedin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linkedInText: text,
            token: token
          })
        });

        const data = await response.json();

        if (response.ok && data.markdown) {
          editor.value = data.markdown;
          if (!isSyncingFromVisual) {
            visualNeedsRefreshFromMarkdown = true;
          }
          schedulePreviewUpdate();
          scheduleSave();
          closeLinkedinModal();
          setStatus('Perfil de LinkedIn importado con éxito');
        } else {
          alert('Error de IA: ' + (data.error || 'Error desconocido'));
        }
      } catch (error) {
        console.error('LinkedIn Import Error:', error);
        alert('Hubo un error de conexión al importar el perfil.');
      } finally {
        linkedinSubmitBtn.innerText = originalBtnText;
        linkedinSubmitBtn.disabled = false;
      }
    });
  }
}

/* ── Quality Check Logic ─────────────────────────────── */
const qualityBtn = document.getElementById('quality-check-button');
const qualityModal = document.getElementById('quality-check-modal');
const closeQualityModalBtn = document.getElementById('close-quality-modal-button');
const qualityCloseBtn = document.getElementById('quality-close-btn');
const qualityScoreText = document.getElementById('quality-score-text');
const qualityScoreCircle = document.getElementById('quality-score-circle');
const qualityList = document.getElementById('quality-list');

function analyzeCvQuality(markdown) {
  const checks = [];
  let score = 0;
  
  // 1. Email
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(markdown);
  checks.push({
    pass: hasEmail,
    title: 'Correo Electrónico',
    desc: hasEmail ? '¡Bien! Tienes un email de contacto.' : 'Falta un correo electrónico. Los reclutadores necesitan saber cómo contactarte.'
  });
  if (hasEmail) score += 15;

  // 2. Phone
  // A very basic check: string with + and/or 8-15 digits
  const hasPhone = /[\+\d][\d\s\-\(\)]{7,20}\d/.test(markdown);
  checks.push({
    pass: hasPhone,
    title: 'Número de Teléfono',
    desc: hasPhone ? 'Teléfono detectado correctamente.' : 'Es muy recomendable incluir un número de teléfono.'
  });
  if (hasPhone) score += 15;

  // 3. Digital Presence
  const hasLink = /(linkedin\.com|github\.com|portfolio|behance|dribbble|gitlab)/i.test(markdown);
  checks.push({
    pass: hasLink,
    title: 'Presencia Digital',
    desc: hasLink ? 'Has incluido enlaces a tu perfil profesional.' : 'Considera añadir tu LinkedIn, GitHub o portafolio.'
  });
  if (hasLink) score += 15;

  // 4. Experience Section
  const hasExperience = /#+.*(Experiencia|Experience|Trabajo|Work)/i.test(markdown);
  checks.push({
    pass: hasExperience,
    title: 'Experiencia Profesional',
    desc: hasExperience ? 'Sección de experiencia identificada.' : 'Falta una sección clara de "Experiencia Profesional" o "Work Experience".'
  });
  if (hasExperience) score += 20;

  // 5. Education Section
  const hasEducation = /#+.*(Educación|Education|Estudios|Formación)/i.test(markdown);
  checks.push({
    pass: hasEducation,
    title: 'Educación',
    desc: hasEducation ? 'Sección de educación identificada.' : 'Añade tu formación académica ("Educación").'
  });
  if (hasEducation) score += 10;

  // 6. Action Verbs
  const actionVerbs = /(desarrollé|lideré|implementé|gestioné|mejoré|aumenté|creé|optimicé|logré|diseñé|coordiné|developed|led|implemented|managed|improved|increased|created|optimized|achieved|designed|coordinated)/i;
  const hasActionVerbs = actionVerbs.test(markdown);
  checks.push({
    pass: hasActionVerbs,
    title: 'Verbos de Acción',
    desc: hasActionVerbs ? 'Usas verbos de acción para describir impacto.' : 'Mejora tus descripciones usando verbos fuertes (ej. "Lideré", "Implementé").'
  });
  if (hasActionVerbs) score += 15;

  // 7. Length
  const length = markdown.trim().length;
  const goodLength = length > 500 && length < 4000;
  checks.push({
    pass: goodLength,
    title: 'Longitud del CV',
    desc: goodLength ? 'La longitud de tu CV es óptima.' : (length <= 500 ? 'El CV es demasiado corto, añade más detalles.' : 'El CV es muy largo. Intenta mantenerlo conciso (1-2 páginas).')
  });
  if (goodLength) score += 10;

  return { checks, score };
}

function renderQualityCheck() {
  const markdown = editor.value || '';
  const { checks, score } = analyzeCvQuality(markdown);
  
  qualityScoreText.textContent = score;
  qualityScoreCircle.className = 'quality-score-circle';
  if (score >= 80) qualityScoreCircle.classList.add('score-high');
  else if (score >= 50) qualityScoreCircle.classList.add('score-medium');
  else qualityScoreCircle.classList.add('score-low');

  qualityList.innerHTML = '';
  checks.forEach(check => {
    const item = document.createElement('div');
    item.className = `quality-item ${check.pass ? 'quality-pass' : 'quality-fail'}`;
    item.innerHTML = `
      <div class="quality-icon">${check.pass ? '✅' : '❌'}</div>
      <div class="quality-content">
        <div class="quality-title">${check.title}</div>
        <div class="quality-desc">${check.desc}</div>
      </div>
    `;
    qualityList.appendChild(item);
  });
  
  qualityModal.classList.add('active');
}

if (qualityBtn && qualityModal) {
  qualityBtn.addEventListener('click', renderQualityCheck);
  const closeQuality = () => qualityModal.classList.remove('active');
  if (closeQualityModalBtn) closeQualityModalBtn.addEventListener('click', closeQuality);
  if (qualityCloseBtn) qualityCloseBtn.addEventListener('click', closeQuality);
}

init();
