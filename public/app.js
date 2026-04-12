const STORAGE_KEY = 'cv-studio-markdown';
const SAVE_INTERVAL_MS = 2500;
const VISUAL_TEMPLATE_STORAGE_KEY = 'cv-studio-visual-template';

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
const libraryModal = document.getElementById('library-modal');
const openLibraryBtn = document.getElementById('open-library-button');
const closeLibraryBtn = document.getElementById('close-library-button');
const saveToLibraryBtn = document.getElementById('save-to-library-button');
const libraryItemsContainer = document.getElementById('library-items');
const libraryCountTag = document.getElementById('library-count');
const newCvNameInput = document.getElementById('new-cv-name');
const newCvSpaceSelect = document.getElementById('new-cv-space');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');

const LIBRARY_STORAGE_KEY = 'cv-studio-library';
let libraryData = [];

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
        ${data.contacts.map((contact) => `<span>${renderInlineMarkdown(contact.label)}: ${renderInlineMarkdown(contact.value)}</span>`).join('')}
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

  try {
    const response = await fetch('/api/preview.pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        markdown, 
        download: false,
        template: visualTemplateSelector ? visualTemplateSelector.value : 'harvard'
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
  } catch (e) {
    libraryData = [];
  }
  renderLibrary();
}

function saveLibraryData() {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(libraryData));
  renderLibrary();
}

function renderLibrary() {
  if (!libraryCountTag || !libraryItemsContainer) return;
  
  libraryCountTag.textContent = `${libraryData.length} CV${libraryData.length !== 1 ? 's' : ''}`;
  
  if (libraryData.length === 0) {
    libraryItemsContainer.innerHTML = `
      <div class="empty-library">
        <p>Aún no tienes CVs guardados. ¡Guarda el actual para empezar!</p>
      </div>
    `;
    return;
  }

  // Ordenar por espacio y luego por nombre
  const sorted = [...libraryData].sort((a, b) => a.space.localeCompare(b.space) || a.name.localeCompare(b.name));

  libraryItemsContainer.innerHTML = sorted.map(cv => `
    <div class="cv-card">
      <div class="cv-card-header">
        <div>
          <div class="cv-card-name">${escapeHtml(cv.name)}</div>
          <div class="cv-card-space">${cv.space}</div>
        </div>
      </div>
      <div class="cv-card-actions">
        <button class="button-ghost-sm load-cv" data-id="${cv.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Abrir
        </button>
        <button class="button-ghost-sm button-danger-ghost delete-cv" data-id="${cv.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Eliminar
        </button>
      </div>
    </div>
  `).join('');

  // Listeners para los botones generados
  libraryItemsContainer.querySelectorAll('.load-cv').forEach(btn => {
    btn.addEventListener('click', () => loadCvFromLibrary(btn.dataset.id));
  });
  libraryItemsContainer.querySelectorAll('.delete-cv').forEach(btn => {
    btn.addEventListener('click', () => deleteFromLibrary(btn.dataset.id));
  });
}

function saveToLibrary() {
  const name = newCvNameInput.value.trim();
  const space = newCvSpaceSelect.value;
  const content = editor.value;

  if (!name) {
    showAlert('Introduce un nombre para el CV', 'Nombre requerido');
    return;
  }

  const newCv = {
    id: Date.now().toString(),
    name,
    space,
    content,
    visualTemplate: visualTemplateSelector ? visualTemplateSelector.value : 'harvard',
    date: new Date().toISOString()
  };

  libraryData.push(newCv);
  saveLibraryData();
  newCvNameInput.value = '';
  setStatus('CV guardado en la biblioteca');
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
  libraryModal.classList.add('active');
}

function closeLibrary() {
  libraryModal.classList.remove('active');
}

function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePdfPreview, PREVIEW_DEBOUNCE_MS);
}

function updateEditor(markdown, statusMessage = 'Listo') {
  editor.value = markdown;
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
  const response = await fetch('/api/preview.pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      markdown: editor.value,
      download: true,
      template: visualTemplateSelector ? visualTemplateSelector.value : 'harvard'
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
  schedulePreviewUpdate();
  scheduleSave();
});

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

downloadPdfButton.addEventListener('click', downloadPdf);

window.addEventListener('beforeunload', () => saveToLocalStorage(true));

async function init() {
  try {
    // Restaurar plantilla visual
    const savedTemplate = localStorage.getItem(VISUAL_TEMPLATE_STORAGE_KEY);
    if (savedTemplate && visualTemplateSelector) {
      visualTemplateSelector.value = savedTemplate;
    }

    const localDraft = localStorage.getItem(STORAGE_KEY);
    if (localDraft && localDraft.trim()) {
      editor.value = localDraft;
      lastSavedValue = localDraft;
      schedulePreviewUpdate();
      setStatus('Borrador local cargado');
      return;
    }

    const initialMarkdown = await loadSource('cv.md');
    editor.value = initialMarkdown;
    lastSavedValue = initialMarkdown;
    schedulePreviewUpdate();
    setStatus('cv.md cargado');
  } catch (error) {
    setStatus('Error cargando el CV');
  }
}

init();
