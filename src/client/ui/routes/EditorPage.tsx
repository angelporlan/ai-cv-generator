import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bold,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FileInput,
  FileText,
  GripVertical,
  Italic,
  LayoutTemplate,
  Library,
  Link,
  List,
  ListOrdered,
  Loader2,
  Minus,
  MoreHorizontal,
  Palette,
  PanelRightOpen,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Underline,
  X,
  ZoomIn
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject, type TextareaHTMLAttributes } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, type CvStatus, type CvSummary } from '../../api/client';
import { getUsageCopy } from '../../domain/aiActions';
import { fromArtifactDto } from '../../domain/aiArtifacts';
import { accentColors, fontFamilies, fontSizes, pageMargins, visualTemplates, type DesignSettings } from '../../domain/design';
import { createEmptyVisualSection, getQualitySignals, parseMarkdown, parseVisualStateFromMarkdown, serializeVisualStateToMarkdown, type VisualBlock, type VisualCvState } from '../../domain/editor';
import { buildNavigatorItems, getIntroLines, getMarkdownNavigatorIdAtOffset, getMarkdownSectionRange } from '../../domain/editorNavigator';
import { statusLabels, statusOrder } from '../../domain/tracker';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { AiPanel } from '../components/AiPanel';
import { AiDialog, LinkedInDialog } from '../components/dialogs';
import { getErrorMessage, useSession } from '../hooks';

export function EditorPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { markdown, setMarkdown, selectedCvId, setSelectedCvId, editorMode, setEditorMode, rightPanel, setRightPanel, suggestionsOpen, setSuggestionsOpen, design, setDesign, aiArtifacts, clearAiArtifacts } = useWorkspaceStore();
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const introLines = useMemo(() => getIntroLines(markdown, parsed), [markdown, parsed]);
  const navigatorItems = useMemo(() => buildNavigatorItems(parsed, introLines), [parsed, introLines]);
  const quality = useMemo(() => getQualitySignals(markdown), [markdown]);
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceCvId, setReferenceCvId] = useState('');
  const [referenceMode, setReferenceMode] = useState<'markdown' | 'visual'>('markdown');
  const [referenceMarkdown, setReferenceMarkdown] = useState('');
  const [saveName, setSaveName] = useState(parsed.title);
  const [status, setStatus] = useState<CvStatus>('draft');
  const [contentTemplate, setContentTemplate] = useState('cv.md');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [activeNavigatorId, setActiveNavigatorId] = useState('profile');
  const [editorPaneWidth, setEditorPaneWidth] = useState(loadEditorPaneWidth);
  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editorColumnRef = useRef<HTMLDivElement>(null);
  const editorCanvasRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const usage = session.data?.usage;
  const authenticated = Boolean(session.data?.authenticated);
  const stats = useMemo(() => getEditorStats(markdown), [markdown]);
  const activeNavigator = useMemo(
    () => navigatorItems.find((item) => item.id === activeNavigatorId) || navigatorItems[0] || null,
    [activeNavigatorId, navigatorItems]
  );
  const formattingInMarkdown = editorMode === 'markdown';
  const toolbarHelp = formattingInMarkdown
    ? 'Selecciona texto en Markdown para aplicar formato. Si no hay seleccion, insertare un ejemplo editable.'
    : 'El formato se aplica al Markdown bruto. Cambia a Markdown para usar negrita, enlaces o listas.';
  const remoteArtifacts = useQuery({
    queryKey: ['ai-artifacts'],
    queryFn: api.listAiArtifacts,
    enabled: authenticated
  });
  const savedCvs = useQuery({
    queryKey: ['cvs', 'editor-reference'],
    queryFn: () => api.listCvs({ page: 1 }),
    enabled: authenticated
  });
  const visibleArtifacts = remoteArtifacts.data?.items.map(fromArtifactDto) || aiArtifacts;
  const savedCvItems = savedCvs.data?.items || [];
  const savedCvCount = savedCvItems.length;
  const openDesignSuggestions = () => {
    setSuggestionsOpen(true);
    setRightPanel('design');
  };

  const loadTemplate = useMutation({
    mutationFn: (file: string) => api.loadSource(file),
    onSuccess: (content, file) => {
      setMarkdown(content);
      setSelectedCvId(null);
      setSaveName(getTemplateLabel(file));
      setNotice('Plantilla cargada');
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  const loadReference = useMutation({
    mutationFn: (id: number) => api.getCv(id),
    onSuccess: (payload) => {
      setReferenceMarkdown(payload.cv.content);
      setReferenceCvId(String(payload.cv.id));
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  const saveCv = useMutation({
    mutationFn: async () => {
      const payload = {
        name: saveName || parsed.title || 'CV sin titulo',
        status,
        description: parsed.subtitle,
        content: markdown,
        template: design.template
      };
      return selectedCvId ? api.updateCv(selectedCvId, payload) : api.createCv(payload);
    },
    onSuccess: (payload) => {
      setSelectedCvId(payload.cv.id);
      setSaveName(payload.cv.name);
      queryClient.invalidateQueries({ queryKey: ['cvs'] });
      setNotice('Borrador guardado');
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  const downloadPdf = useMutation({
    mutationFn: () => api.previewPdf({
      markdown,
      download: true,
      template: design.template,
      accentColor: design.accentColor,
      fontFamily: design.fontFamily,
      fontSize: design.fontSize,
      pageMargin: design.pageMargin,
      showIcons: design.showIcons
    }),
    onSuccess: async (response) => {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(saveName || parsed.title || 'cv').replace(/\s+/g, '-').toLowerCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'auth_required') setNotice('Entra para descargar PDF');
      else setNotice(getErrorMessage(error));
    }
  });

  const handleTemplateChange = (file: string) => {
    if (!window.confirm(`Cargar "${getTemplateLabel(file)}"? Se sustituira el borrador actual del editor.`)) return;
    setContentTemplate(file);
    loadTemplate.mutate(file);
  };

  const handleExampleLoad = async () => {
    const exampleFile = contentTemplate.replace(/\.md$/i, '-example.md');
    try {
      const loaded = await api.loadSourceWithFallback(exampleFile, contentTemplate);
      setMarkdown(loaded.content);
      setSelectedCvId(null);
      setSaveName(getTemplateLabel(loaded.file));
      setNotice(
        loaded.fallbackUsed
          ? `No habia ejemplo para ${getTemplateLabel(contentTemplate)}; se cargo la plantilla base.`
          : 'Ejemplo cargado'
      );
    } catch (error) {
      setNotice(getErrorMessage(error));
    }
  };

  const handleFileImport = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setMarkdown(text);
    setSelectedCvId(null);
    setSaveName(file.name.replace(/\.(md|txt)$/i, '') || 'CV importado');
    setNotice('Archivo importado');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMarkdownDownload = () => {
    downloadTextFile(markdown, `${slugify(saveName || parsed.title || 'cv')}.md`, 'text/markdown;charset=utf-8');
    setDownloadOpen(false);
    setNotice('Markdown descargado');
  };

  const applyMarkdownFormat = (format: 'bold' | 'italic' | 'underline' | 'link' | 'list' | 'ordered') => {
    const textarea = editorRef.current;
    if (!textarea || editorMode !== 'markdown') {
      setEditorMode('markdown');
      setNotice('Toolbar de formato listo: selecciona texto en Markdown y vuelve a pulsar la accion.');
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = markdown.slice(start, end);
    const fallback = selected || 'texto';
    const replacements = {
      bold: `**${fallback}**`,
      italic: `*${fallback}*`,
      underline: `<u>${fallback}</u>`,
      link: `[${fallback}](https://)`,
      list: selected.split(/\r?\n/).map((line) => line.trim() ? `- ${line.replace(/^[-*]\s*/, '')}` : line).join('\n') || '- Elemento',
      ordered: selected.split(/\r?\n/).map((line, index) => line.trim() ? `${index + 1}. ${line.replace(/^\d+\.\s*/, '')}` : line).join('\n') || '1. Elemento'
    };
    const replacement = replacements[format];
    setMarkdown(`${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`);
    setNotice(selected ? 'Formato aplicado a la seleccion Markdown' : 'Formato insertado en Markdown');
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    });
  };

  const toggleReference = () => {
    if (!authenticated) {
      setNotice('Entra para comparar con CVs guardados');
      return;
    }

    if (!savedCvCount) {
      setReferenceOpen(true);
      setNotice('Todavia no tienes CVs guardados para comparar. Guarda uno o abre la biblioteca.');
      return;
    }

    const nextOpen = !referenceOpen;
    setReferenceOpen(nextOpen);
    if (nextOpen && !referenceMarkdown) {
      const firstId = savedCvItems[0]?.id;
      if (firstId) loadReference.mutate(firstId);
    }
  };

  const startEditorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 1280) return;

    const root = editorCanvasRef.current;
    if (!root) return;

    const separator = event.currentTarget;
    separator.setPointerCapture(event.pointerId);
    setIsResizingEditor(true);

    const updateWidth = (clientX: number) => {
      const rect = root.getBoundingClientRect();
      const rightColumnsWidth = referenceOpen ? 300 + 430 : PREVIEW_MIN_WIDTH;
      const maxWidth = Math.max(640, rect.width - rightColumnsWidth - RESIZER_WIDTH);
      const nextWidth = clamp(clientX - rect.left, 640, maxWidth);
      setEditorPaneWidth(nextWidth);
    };

    updateWidth(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateWidth(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      setIsResizingEditor(false);
      separator.releasePointerCapture(event.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
  };

  useEffect(() => {
    const clampEditorWidth = () => {
      const root = editorCanvasRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const rightColumnsWidth = referenceOpen ? 300 + 430 : PREVIEW_MIN_WIDTH;
      const maxWidth = Math.max(640, rect.width - rightColumnsWidth - RESIZER_WIDTH);
      setEditorPaneWidth((current) => clamp(current, 640, maxWidth));
    };

    clampEditorWidth();
    window.addEventListener('resize', clampEditorWidth);
    return () => window.removeEventListener('resize', clampEditorWidth);
  }, [referenceOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(EDITOR_PANE_WIDTH_STORAGE_KEY, String(editorPaneWidth));
    } catch {
      // Ignore storage failures and keep the current in-memory split.
    }
  }, [editorPaneWidth]);

  useEffect(() => {
    document.body.classList.toggle('is-resizing-editor', isResizingEditor);
    document.body.style.userSelect = isResizingEditor ? 'none' : '';
    document.body.style.cursor = isResizingEditor ? 'col-resize' : '';

    return () => {
      document.body.classList.remove('is-resizing-editor');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingEditor]);

  useEffect(() => {
    if (navigatorItems.length && !navigatorItems.some((item) => item.id === activeNavigatorId)) {
      setActiveNavigatorId(navigatorItems[0].id);
    }
  }, [activeNavigatorId, navigatorItems]);

  useEffect(() => {
    const root = editorColumnRef.current;
    if (!root || !navigatorItems.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        const sectionId = (visible.target as HTMLElement).dataset.sectionId;
        if (sectionId) {
          setActiveNavigatorId(sectionId);
        }
      },
      {
        root,
        threshold: [0.2, 0.4, 0.6, 0.8],
        rootMargin: '-10% 0px -55% 0px'
      }
    );

    navigatorItems.forEach((item) => {
      const element = sectionRefs.current[item.id];
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [navigatorItems]);

  useEffect(() => {
    if (editorMode !== 'markdown') return;
    const textarea = editorRef.current;
    if (!textarea) return;

    const syncActiveSection = () => {
      const nextId = getMarkdownNavigatorIdAtOffset(markdown, textarea.selectionStart);
      if (nextId) {
        setActiveNavigatorId(nextId);
      }
    };

    const handleSelectionChange = () => {
      if (document.activeElement === textarea) {
        syncActiveSection();
      }
    };

    textarea.addEventListener('keyup', syncActiveSection);
    textarea.addEventListener('click', syncActiveSection);
    textarea.addEventListener('input', syncActiveSection);
    document.addEventListener('selectionchange', handleSelectionChange);
    syncActiveSection();

    return () => {
      textarea.removeEventListener('keyup', syncActiveSection);
      textarea.removeEventListener('click', syncActiveSection);
      textarea.removeEventListener('input', syncActiveSection);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editorMode, markdown, parsed]);

  const scrollToSection = (sectionId: string) => {
    if (editorMode === 'markdown') {
      const textarea = editorRef.current;
      const range = getMarkdownSectionRange(markdown, sectionId);
      if (!textarea || !range) return;

      textarea.focus();
      textarea.setSelectionRange(range.start, range.start);
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
      const offsetLines = markdown.slice(0, range.start).split(/\r?\n/).length - 1;
      textarea.scrollTop = Math.max(0, offsetLines * lineHeight - textarea.clientHeight * 0.2);
    } else {
      const element = sectionRefs.current[sectionId];
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setActiveNavigatorId(sectionId);
  };

  return (
    <div
      className={`editor-shell ${navCollapsed ? (suggestionsOpen ? 'is-nav-collapsed' : 'is-nav-and-suggestions-collapsed') : suggestionsOpen ? 'is-suggestions-open' : 'is-suggestions-collapsed'
        }`}
    >
      {!navCollapsed ? (
        <aside className="editor-nav">
          <h2 className="px-4 pt-4 text-sm font-semibold text-slate-900 dark:text-white">Section Navigator</h2>
          <div className="mt-4 space-y-1 px-2">
            {navigatorItems.map((item) => (
              <button
                className={`editor-nav-item ${activeNavigatorId === item.id ? 'is-active' : ''}`}
                type="button"
                key={item.id}
                onClick={() => scrollToSection(item.id)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{item.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">{item.count}</span>
                </span>
                <ChevronDown size={13} />
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      <section className="editor-board">
        <div className="studio-topbar">
          <div className="min-w-0">
            <input
              className="studio-title-input"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              aria-label="Nombre del CV"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{notice || (authenticated ? 'Borrador local cargado' : 'Editando en local')}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <button className="studio-button ghost" type="button" onClick={() => setNavCollapsed((value) => !value)}>
              <ChevronLeft size={14} className={navCollapsed ? 'rotate-180 transition-transform' : 'transition-transform'} />
              {navCollapsed ? 'Mostrar nav' : 'Ocultar nav'}
            </button>
            <select className="studio-select" value={contentTemplate} onChange={(event) => handleTemplateChange(event.target.value)} aria-label="Plantilla de contenido">
              {contentTemplates.map((template) => <option value={template.value} key={template.value}>{template.label}</option>)}
            </select>
            <select className="studio-select" value={status} onChange={(event) => setStatus(event.target.value as CvStatus)} aria-label="Estado del CV">
              {statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}
            </select>
            <div className="mode-toggle" aria-label="Modo de edicion">
              <button className={editorMode === 'markdown' ? 'is-active' : ''} type="button" onClick={() => setEditorMode('markdown')}>
                <FileText size={13} />
                Markdown
              </button>
              <button className={editorMode === 'visual' ? 'is-active' : ''} type="button" onClick={() => setEditorMode('visual')}>
                <LayoutTemplate size={13} />
                Visual
              </button>
            </div>
            <button className="studio-button ghost" type="button" onClick={() => saveCv.mutate()} disabled={saveCv.isPending || !authenticated}>
              {saveCv.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
              Save Changes
            </button>
            <button className="studio-button ghost" type="button" onClick={() => setAiOpen(true)}>
              <Sparkles size={14} />
              AI Assistant Review
            </button>
            <button className="studio-button ghost" type="button" onClick={openDesignSuggestions}>
              <Palette size={14} />
              Personalizar
            </button>
            <button className="studio-button ghost" type="button" onClick={toggleReference}>
              <PanelRightOpen size={14} />
              Comparar
              {savedCvCount ? <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">{savedCvCount}</span> : null}
            </button>
            <div className="relative">
              <button className="studio-button primary" type="button" onClick={() => setDownloadOpen((open) => !open)} disabled={downloadPdf.isPending}>
                {downloadPdf.isPending ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                Download
                <ChevronDown size={13} />
              </button>
              {downloadOpen ? (
                <div className="download-menu">
                  <button type="button" onClick={() => downloadPdf.mutate()}><FileDown size={14} /> PDF</button>
                  <button type="button" onClick={handleMarkdownDownload}><FileText size={14} /> Markdown</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {!authenticated ? (
          <div className="mx-4 mt-4 rounded-md border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-50">
            Puedes editar en local. Entra para guardar biblioteca, descargar PDF y usar IA.
          </div>
        ) : null}

        <div className="mobile-section-nav lg:hidden">
          <div className="mobile-section-nav-head">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Secciones</span>
            <span className="text-xs text-slate-500">{activeNavigator?.label || 'Sin secciones'}</span>
          </div>
          <div className="mobile-section-nav-scroll" role="tablist" aria-label="Navegacion de secciones">
            {navigatorItems.map((item) => (
              <button
                aria-current={activeNavigatorId === item.id ? 'true' : undefined}
                className={`mobile-section-nav-item ${activeNavigatorId === item.id ? 'is-active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
              >
                <span className="truncate">{item.label}</span>
                <span className="mobile-section-nav-count">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className={`editor-canvas ${referenceOpen ? 'has-reference' : ''} ${isResizingEditor ? 'is-resizing' : ''}`}
          ref={editorCanvasRef}
          style={{ '--editor-panel-width': `${editorPaneWidth}px` } as React.CSSProperties}
        >
          <div className="editor-column" ref={editorColumnRef}>
            <div className="document-panel">
              <div className="format-toolbar" aria-label="Herramientas de formato">
                <div className="format-toolbar-actions">
                  <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('bold')} disabled={!formattingInMarkdown} title={toolbarHelp} aria-label="Negrita Markdown"><Bold size={14} /></button>
                  <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('italic')} disabled={!formattingInMarkdown} title={toolbarHelp} aria-label="Cursiva Markdown"><Italic size={14} /></button>
                  <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('underline')} disabled={!formattingInMarkdown} title={toolbarHelp} aria-label="Subrayado Markdown"><Underline size={14} /></button>
                  <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('link')} disabled={!formattingInMarkdown} title={toolbarHelp} aria-label="Enlace Markdown"><Link size={14} /></button>
                  <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('list')} disabled={!formattingInMarkdown} title={toolbarHelp} aria-label="Lista Markdown"><List size={14} /></button>
                  <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('ordered')} disabled={!formattingInMarkdown} title={toolbarHelp} aria-label="Lista numerada Markdown"><ListOrdered size={14} /></button>
                  <span className="format-toolbar-divider" aria-hidden="true" />
                  <button className="tool-icon" type="button" onClick={handleExampleLoad} aria-label="Cargar ejemplo"><MoreHorizontal size={14} /></button>
                  <button className="tool-icon" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Importar Markdown"><FileInput size={14} /></button>
                </div>
              </div>
              <input ref={fileInputRef} hidden type="file" accept=".md,text/markdown,text/plain" onChange={(event) => handleFileImport(event.target.files?.[0])} />

              {editorMode === 'markdown' ? (
                <textarea
                  ref={editorRef}
                  className="studio-textarea"
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  spellCheck={false}
                  aria-label="Editor markdown del CV"
                />
              ) : (
                <VisualEditor markdown={markdown} onChange={setMarkdown} sectionRefs={sectionRefs} />
              )}
              <div className="editor-stats">
                <span>{stats.characters.toLocaleString('es')} caracteres</span>
                <span>{stats.lines.toLocaleString('es')} lineas</span>
                <span>{stats.words.toLocaleString('es')} palabras</span>
              </div>
            </div>
          </div>

          <div
            className="workspace-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ajustar ancho del editor"
            onPointerDown={startEditorResize}
          />

          {referenceOpen ? (
            <ReferencePane
              cvs={savedCvItems}
              selectedId={referenceCvId}
              markdown={referenceMarkdown}
              mode={referenceMode}
              loading={loadReference.isPending}
              onModeChange={setReferenceMode}
              onSelect={(id) => loadReference.mutate(Number(id))}
              onClose={() => setReferenceOpen(false)}
              onOpenLibrary={() => navigate('/library')}
            />
          ) : null}

          <aside className="preview-column">
            <CvPreview markdown={markdown} design={design} showLabel={false} />
          </aside>
        </div>
      </section>

      {suggestionsOpen ? (
        <aside className="suggestions-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Design Suggestions</h2>
            <button className="tool-icon" type="button" onClick={() => setSuggestionsOpen(false)} aria-label="Cerrar sugerencias">
              <X size={14} />
            </button>
          </div>
          <SuggestionThumbnails design={design} onChange={setDesign} />
          <div className="border-t border-line p-4 dark:border-white/10">
            <div className="suggestion-tabs">
              {[
                { value: 'design', label: 'Design' },
                { value: 'quality', label: 'Check' },
                { value: 'ai', label: 'IA' }
              ].map((item) => (
                <button className={rightPanel === item.value ? 'is-active' : ''} type="button" key={item.value} onClick={() => setRightPanel(item.value as 'design' | 'quality' | 'ai')}>
                  {item.label}
                </button>
              ))}
            </div>
            {rightPanel === 'quality' ? <QualityPanel markdown={markdown} /> : null}
            {rightPanel === 'ai' ? (
              <div>
                <AiPanel inline markdown={markdown} usage={usage} authenticated={authenticated} onApply={setMarkdown} />
                <AiArtifactsPanel
                  artifacts={visibleArtifacts}
                  onApply={setMarkdown}
                  onClear={() => {
                    clearAiArtifacts();
                    if (authenticated) {
                      api.clearAiArtifacts()
                        .then(() => queryClient.invalidateQueries({ queryKey: ['ai-artifacts'] }))
                        .catch(() => undefined);
                    }
                  }}
                />
              </div>
            ) : null}
            {rightPanel === 'design' || rightPanel === 'preview' ? <DesignPanel design={design} onChange={setDesign} /> : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <SideMetric label="Calidad" value={`${quality.score}%`} tone={quality.score >= 75 ? 'good' : 'warn'} />
              <SideMetric label="IA" value={getUsageCopy(usage)} />
            </div>
            <div className="mt-4 space-y-2">
              <button className="side-action-dark" type="button" onClick={() => setLinkedinOpen(true)}>
                <BriefcaseBusiness size={15} /> Importar LinkedIn <ChevronRight size={14} />
              </button>
              <button className="side-action-dark" type="button" onClick={() => navigate('/library')}>
                <Library size={15} /> Abrir biblioteca <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      {aiOpen ? <AiDialog markdown={markdown} usage={usage} authenticated={authenticated} onApply={setMarkdown} onClose={() => setAiOpen(false)} /> : null}
      {linkedinOpen ? <LinkedInDialog onApply={setMarkdown} onClose={() => setLinkedinOpen(false)} /> : null}
    </div>
  );
}

function SectionHeader({ icon, title, collapsed = false, onToggle }: { icon: React.ReactNode; title: string; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className="section-header">
      <div className="flex items-center gap-2">{icon}<span>{title}</span></div>
      {onToggle ? (
        <button className="tool-icon" type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Expandir seccion' : 'Colapsar seccion'}>
          <ChevronDown className={collapsed ? '-rotate-90 transition-transform' : 'transition-transform'} size={14} />
        </button>
      ) : (
        <ChevronDown size={14} />
      )}
    </div>
  );
}

const contentTemplates = [
  { value: 'cv.md', label: 'Generico' },
  { value: 'cv-developer.md', label: 'Ingenieria y Tecnologia' },
  { value: 'cv-sales.md', label: 'Ventas y Negocio' },
  { value: 'cv-project-manager.md', label: 'Gestion de Proyectos' },
  { value: 'cv-hr.md', label: 'Recursos Humanos' },
  { value: 'cv-marketing.md', label: 'Marketing Digital' },
  { value: 'cv-administration.md', label: 'Administracion' },
  { value: 'cv-education.md', label: 'Educacion y Formacion' },
  { value: 'cv-finance.md', label: 'Finanzas y Contabilidad' }
];

const EDITOR_PANE_WIDTH_STORAGE_KEY = 'cv-studio-spa-editor-pane-width';
const DEFAULT_EDITOR_PANE_WIDTH = 760;
const MIN_EDITOR_PANE_WIDTH = 640;
const PREVIEW_MIN_WIDTH = 360;
const RESIZER_WIDTH = 12;

const defaultPreviewDesign: DesignSettings = {
  template: 'harvard',
  accentColor: '#2563eb',
  fontFamily: 'helvetica',
  fontSize: 12.5,
  pageMargin: 36,
  showIcons: true
};

function getTemplateLabel(file: string) {
  return contentTemplates.find((template) => template.value === file)?.label || file.replace(/-example\.md$|\.md$/g, '');
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'cv';
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function getEditorStats(markdown: string) {
  const text = markdown.trim();
  return {
    characters: markdown.length,
    lines: markdown ? markdown.split(/\r?\n/).length : 0,
    words: text ? text.split(/\s+/).length : 0
  };
}

function loadEditorPaneWidth() {
  try {
    const stored = Number(localStorage.getItem(EDITOR_PANE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= MIN_EDITOR_PANE_WIDTH) {
      return stored;
    }
  } catch {
    // Ignore storage access errors and fall back to the default width.
  }

  return DEFAULT_EDITOR_PANE_WIDTH;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function AiArtifactsPanel({ artifacts, onApply, onClear }: {
  artifacts: ReturnType<typeof useWorkspaceStore.getState>['aiArtifacts'];
  onApply: (markdown: string) => void;
  onClear: () => void;
}) {
  if (!artifacts.length) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-line bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-400">
        Los resultados de IA apareceran aqui para recuperarlos durante la sesion.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Artefactos IA</p>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white" type="button" onClick={onClear}>
          <Trash2 size={13} /> Limpiar
        </button>
      </div>
      {artifacts.slice(0, 4).map((artifact) => (
        <div className="rounded-md border border-line bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5" key={artifact.id}>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{artifact.title}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{artifact.model}</p>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{artifact.content}</p>
          <button className="studio-button ghost mt-3 h-8 text-xs" type="button" onClick={() => onApply(artifact.content)}>Aplicar</button>
        </div>
      ))}
    </div>
  );
}

function ReferencePane({ cvs, selectedId, markdown, mode, loading, onModeChange, onSelect, onClose, onOpenLibrary }: {
  cvs: CvSummary[];
  selectedId: string;
  markdown: string;
  mode: 'markdown' | 'visual';
  loading: boolean;
  onModeChange: (mode: 'markdown' | 'visual') => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onOpenLibrary: () => void;
}) {
  return (
    <aside className="reference-column">
      <div className="reference-head">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">Referencia</p>
          <select className="dark-field mt-1" value={selectedId} onChange={(event) => onSelect(event.target.value)} aria-label="CV de referencia" disabled={!cvs.length}>
            <option value="">{cvs.length ? 'Selecciona CV' : 'No hay CVs guardados'}</option>
            {cvs.map((cv) => <option value={cv.id} key={cv.id}>{cv.name}</option>)}
          </select>
        </div>
        <button className="tool-icon" type="button" onClick={onClose} aria-label="Cerrar comparacion"><X size={14} /></button>
      </div>
      {!cvs.length ? (
        <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 p-6 text-center">
          <Library size={22} className="text-slate-400 dark:text-slate-500" />
          <div className="max-w-xs">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Todavía no hay CVs para comparar</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Guarda un CV desde el editor para usarlo como referencia, o entra en Biblioteca para revisar tus versiones.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="button-secondary" type="button" onClick={onOpenLibrary}>
              <Library size={14} />
              Abrir biblioteca
            </button>
            <button className="button-primary" type="button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mode-toggle mx-3 mt-3">
            <button className={mode === 'markdown' ? 'is-active' : ''} type="button" onClick={() => onModeChange('markdown')}>Markdown</button>
            <button className={mode === 'visual' ? 'is-active' : ''} type="button" onClick={() => onModeChange('visual')}>Visual</button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="animate-spin" size={15} /> Cargando referencia</div>
          ) : mode === 'markdown' ? (
            <textarea className="reference-textarea" value={markdown} readOnly aria-label="Markdown del CV de referencia" />
          ) : (
            <div className="reference-visual">
              <CvPreview markdown={markdown || '# Sin referencia'} design={{ ...defaultPreviewDesign }} compact />
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function VisualEditor({
  markdown,
  onChange,
  sectionRefs
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  sectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
}) {
  const parsed = useMemo(() => parseVisualStateFromMarkdown(markdown), [markdown]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [draggedBlock, setDraggedBlock] = useState<{ sectionIndex: number; blockIndex: number } | null>(null);
  const update = (next: VisualCvState) => onChange(serializeVisualStateToMarkdown(next));
  const updateSection = (sectionIndex: number, patch: Partial<VisualCvState['sections'][number]>) => {
    update({
      ...parsed,
      sections: parsed.sections.map((section, index) => index === sectionIndex ? { ...section, ...patch } : section)
    });
  };
  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    const target = sectionIndex + direction;
    if (target < 0 || target >= parsed.sections.length) return;
    const sections = [...parsed.sections];
    const [section] = sections.splice(sectionIndex, 1);
    sections.splice(target, 0, section);
    update({ ...parsed, sections });
  };
  const moveSectionTo = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= parsed.sections.length) return;
    const sections = [...parsed.sections];
    const [section] = sections.splice(fromIndex, 1);
    sections.splice(toIndex, 0, section);
    update({ ...parsed, sections });
  };
  const updateBlock = (sectionIndex: number, blockIndex: number, patch: Partial<VisualBlock>) => {
    update({
      ...parsed,
      sections: parsed.sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) return section;
        return {
          ...section,
          blocks: section.blocks.map((block, currentBlockIndex) => currentBlockIndex === blockIndex ? { ...block, ...patch } as VisualBlock : block)
        };
      })
    });
  };
  const moveBlock = (sectionIndex: number, blockIndex: number, direction: -1 | 1) => {
    const section = parsed.sections[sectionIndex];
    if (!section) return;
    const target = blockIndex + direction;
    if (target < 0 || target >= section.blocks.length) return;
    const blocks = [...section.blocks];
    const [block] = blocks.splice(blockIndex, 1);
    blocks.splice(target, 0, block);
    updateSection(sectionIndex, { blocks });
  };
  const moveBlockTo = (sectionIndex: number, fromIndex: number, toIndex: number) => {
    const section = parsed.sections[sectionIndex];
    if (!section || fromIndex === toIndex || toIndex < 0 || toIndex >= section.blocks.length) return;
    const blocks = [...section.blocks];
    const [block] = blocks.splice(fromIndex, 1);
    blocks.splice(toIndex, 0, block);
    updateSection(sectionIndex, { blocks });
  };
  const toggleCollapsedSection = (sectionId: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };
  const isCollapsed = (sectionId: string) => collapsedSections.has(sectionId);
  const handleSectionDragOver = (event: DragEvent<HTMLElement>) => {
    if (draggedSectionIndex === null) return;
    event.preventDefault();
  };
  const handleSectionDrop = (event: DragEvent<HTMLElement>, sectionIndex: number) => {
    event.preventDefault();
    if (draggedSectionIndex === null) return;
    moveSectionTo(draggedSectionIndex, sectionIndex);
    setDraggedSectionIndex(null);
  };
  const handleBlockDragOver = (event: DragEvent<HTMLElement>) => {
    if (!draggedBlock) return;
    event.preventDefault();
  };
  const handleBlockDrop = (event: DragEvent<HTMLElement>, sectionIndex: number, blockIndex: number) => {
    event.preventDefault();
    if (!draggedBlock || draggedBlock.sectionIndex !== sectionIndex) return;
    moveBlockTo(sectionIndex, draggedBlock.blockIndex, blockIndex);
    setDraggedBlock(null);
  };
  const addContact = () => {
    update({ ...parsed, contacts: [...parsed.contacts, { label: '', value: '' }] });
  };
  const addSection = () => {
    update({ ...parsed, sections: [...parsed.sections, createEmptyVisualSection()] });
  };
  const addBlock = (sectionIndex: number, block: VisualBlock['type']) => {
    const section = parsed.sections[sectionIndex];
    if (!section) return;

    const nextBlock: VisualBlock =
      block === 'entry'
        ? { type: 'entry', title: 'Nueva entrada', role: '', date: '', summary: '', bullets: '' }
        : block === 'list'
          ? { type: 'list', items: '' }
          : { type: 'paragraph', text: '' };

    updateSection(sectionIndex, { blocks: [...section.blocks, nextBlock] });
  };

  return (
    <div className="space-y-4">
      <div
        className={`editable-section ${isCollapsed('profile') ? 'is-collapsed' : ''}`}
        data-section-id="profile"
        ref={(element) => {
          sectionRefs.current.profile = element;
        }}
      >
        <SectionHeader
          icon={<FileText size={14} />}
          title="Identidad"
          collapsed={isCollapsed('profile')}
          onToggle={() => toggleCollapsedSection('profile')}
        />
        {!isCollapsed('profile') ? <div className="space-y-4 p-4">
          <label className="block">
            <span className="dark-label">Nombre principal</span>
            <input className="section-title-input mt-1" value={parsed.title} onChange={(event) => update({ ...parsed, title: event.target.value })} aria-label="Nombre principal" />
          </label>
          <label className="block">
            <span className="dark-label">Resumen o introduccion</span>
            <AutoResizeTextarea className="section-body-input mt-1 min-h-24" value={parsed.intro} onChange={(event) => update({ ...parsed, intro: event.target.value })} aria-label="Resumen o introduccion" />
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="dark-label">Contactos</span>
              <button className="tool-mini-button" type="button" onClick={addContact}>
                <Plus size={12} /> Anadir contacto
              </button>
            </div>
            <div className="space-y-2">
              {parsed.contacts.map((contact, contactIndex) => (
                <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_auto]" key={`${contact.label}-${contactIndex}`}>
                  <input
                    className="section-title-input"
                    value={contact.label}
                    onChange={(event) => update({
                      ...parsed,
                      contacts: parsed.contacts.map((item, index) => index === contactIndex ? { ...item, label: event.target.value } : item)
                    })}
                    aria-label={`Etiqueta del contacto ${contactIndex + 1}`}
                    placeholder="Email"
                  />
                  <input
                    className="section-body-input min-h-0 py-2"
                    value={contact.value}
                    onChange={(event) => update({
                      ...parsed,
                      contacts: parsed.contacts.map((item, index) => index === contactIndex ? { ...item, value: event.target.value } : item)
                    })}
                    aria-label={`Valor del contacto ${contactIndex + 1}`}
                    placeholder="persona@correo.com"
                  />
                  <button
                    className="tool-icon self-start md:self-center"
                    type="button"
                    onClick={() => update({ ...parsed, contacts: parsed.contacts.filter((_, index) => index !== contactIndex) })}
                    aria-label="Eliminar contacto"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {!parsed.contacts.length ? <p className="text-xs text-slate-400">Puedes añadir email, enlaces o telefono como contactos editables.</p> : null}
            </div>
          </div>
        </div> : null}
      </div>
      {parsed.sections.map((section, sectionIndex) => (
        <div
          className={`editable-section ${isCollapsed(`section-${sectionIndex}`) ? 'is-collapsed' : ''} ${draggedSectionIndex === sectionIndex ? 'is-dragging' : ''}`}
          data-section-id={`section-${sectionIndex}`}
          key={`${section.title}-${sectionIndex}`}
          ref={(element) => {
            sectionRefs.current[`section-${sectionIndex}`] = element;
          }}
          onDragOver={handleSectionDragOver}
          onDrop={(event) => handleSectionDrop(event, sectionIndex)}
        >
          <div className="section-header">
            <div className="flex min-w-0 items-center gap-2">
              <button
                className="drag-handle"
                type="button"
                draggable
                onDragStart={(event) => {
                  setDraggedSectionIndex(sectionIndex);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', `section-${sectionIndex}`);
                }}
                onDragEnd={() => setDraggedSectionIndex(null)}
                aria-label="Arrastrar seccion"
              >
                <GripVertical size={14} />
              </button>
              <FileText size={14} />
              <span className="truncate">{section.title || 'Seccion sin titulo'}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="tool-icon" type="button" onClick={() => toggleCollapsedSection(`section-${sectionIndex}`)} aria-expanded={!isCollapsed(`section-${sectionIndex}`)} aria-label={isCollapsed(`section-${sectionIndex}`) ? 'Expandir seccion' : 'Colapsar seccion'}>
                <ChevronDown className={isCollapsed(`section-${sectionIndex}`) ? '-rotate-90 transition-transform' : 'transition-transform'} size={13} />
              </button>
              <button className="tool-icon" type="button" onClick={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0} aria-label="Subir seccion"><ArrowUp size={13} /></button>
              <button className="tool-icon" type="button" onClick={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === parsed.sections.length - 1} aria-label="Bajar seccion"><ArrowDown size={13} /></button>
              <button className="tool-icon" type="button" onClick={() => update({ ...parsed, sections: parsed.sections.filter((_, index) => index !== sectionIndex) })} aria-label="Eliminar seccion"><Trash2 size={13} /></button>
            </div>
          </div>
          {!isCollapsed(`section-${sectionIndex}`) ? <div className="space-y-4 p-4">
            <label className="block">
              <span className="dark-label">Titulo de seccion</span>
              <input className="section-title-input mt-1" value={section.title} onChange={(event) => updateSection(sectionIndex, { title: event.target.value })} aria-label="Titulo de seccion" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="tool-mini-button" type="button" onClick={() => addBlock(sectionIndex, 'entry')}><Plus size={12} /> Entrada</button>
              <button className="tool-mini-button" type="button" onClick={() => addBlock(sectionIndex, 'paragraph')}><Plus size={12} /> Párrafo</button>
              <button className="tool-mini-button" type="button" onClick={() => addBlock(sectionIndex, 'list')}><Plus size={12} /> Lista</button>
            </div>
            <div className="space-y-3">
              {section.blocks.map((block, blockIndex) => (
                <VisualBlockEditor
                  block={block}
                  blockIndex={blockIndex}
                  key={`${sectionIndex}-${blockIndex}-${block.type}`}
                  onChange={(patch) => updateBlock(sectionIndex, blockIndex, patch)}
                  onRemove={() => updateSection(sectionIndex, { blocks: section.blocks.filter((_, index) => index !== blockIndex) })}
                  onMove={(direction) => moveBlock(sectionIndex, blockIndex, direction)}
                  onDragStart={() => setDraggedBlock({ sectionIndex, blockIndex })}
                  onDragEnd={() => setDraggedBlock(null)}
                  onDragOver={handleBlockDragOver}
                  onDrop={(event) => handleBlockDrop(event, sectionIndex, blockIndex)}
                  canMoveUp={blockIndex > 0}
                  canMoveDown={blockIndex < section.blocks.length - 1}
                  dragging={draggedBlock?.sectionIndex === sectionIndex && draggedBlock.blockIndex === blockIndex}
                />
              ))}
              {!section.blocks.length ? <p className="text-xs text-slate-400">Anade una entrada, lista o párrafo para esta sección.</p> : null}
            </div>
          </div> : null}
        </div>
      ))}
      <button
        className="studio-button ghost mx-4 mb-4"
        type="button"
        onClick={addSection}
      >
        <Plus size={14} /> Anadir seccion
      </button>
    </div>
  );
}

function VisualBlockEditor({ block, blockIndex, canMoveUp, canMoveDown, onChange, onRemove, onMove, onDragStart, onDragEnd, onDragOver, onDrop, dragging }: {
  block: VisualBlock;
  blockIndex: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<VisualBlock>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  dragging: boolean;
}) {
  const blockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    blockRef.current?.querySelectorAll('textarea').forEach((textarea) => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }, [block]);

  return (
    <div ref={blockRef} className={`visual-block-card ${dragging ? 'is-dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          <span>{block.type === 'entry' ? 'Entrada' : block.type === 'list' ? 'Lista' : 'Párrafo'}</span>
          <button
            className="drag-handle"
            type="button"
            draggable
            onDragStart={(event) => {
              onDragStart();
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', `block-${blockIndex}`);
            }}
            onDragEnd={onDragEnd}
            aria-label="Arrastrar bloque"
          >
            <GripVertical size={14} />
          </button>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-300">Bloque {blockIndex + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="tool-icon" type="button" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Subir bloque"><ArrowUp size={13} /></button>
          <button className="tool-icon" type="button" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Bajar bloque"><ArrowDown size={13} /></button>
          <button className="tool-icon" type="button" onClick={onRemove} aria-label="Eliminar bloque"><Trash2 size={13} /></button>
        </div>
      </div>
      {block.type === 'entry' ? (
        <div className="space-y-3">
          <input className="section-title-input" value={block.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Titulo de entrada" placeholder="Empresa o proyecto" />
          <div className="grid gap-2 md:grid-cols-2">
            <input className="section-body-input min-h-0 py-2" value={block.role} onChange={(event) => onChange({ role: event.target.value })} aria-label="Rol de entrada" placeholder="Rol" />
            <input className="section-body-input min-h-0 py-2" value={block.date} onChange={(event) => onChange({ date: event.target.value })} aria-label="Fecha de entrada" placeholder="Fecha" />
          </div>
          <AutoResizeTextarea className="section-body-input min-h-24" value={block.summary} onChange={(event) => onChange({ summary: event.target.value })} aria-label="Resumen de entrada" placeholder="Resumen breve" />
          <AutoResizeTextarea className="section-body-input min-h-24" value={block.bullets} onChange={(event) => onChange({ bullets: event.target.value })} aria-label="Logros de entrada" placeholder="Logros, uno por linea" />
        </div>
      ) : null}
      {block.type === 'list' ? (
        <AutoResizeTextarea className="section-body-input min-h-24" value={block.items} onChange={(event) => onChange({ items: event.target.value })} aria-label="Lista" placeholder="Elemento por linea" />
      ) : null}
      {block.type === 'paragraph' ? (
        <textarea className="section-body-input min-h-24" value={block.text} onChange={(event) => onChange({ text: event.target.value })} aria-label="Parrafo" placeholder="Texto del párrafo" />
      ) : null}
    </div>
  );
}

function AutoResizeTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [props.value]);

  return <textarea {...props} ref={textareaRef} rows={1} />;
}

function CvPreview({ markdown, design, compact = false, showLabel = true }: { markdown: string; design: DesignSettings; compact?: boolean; showLabel?: boolean }) {
  const [url, setUrl] = useState('');
  const [zoom, setZoom] = useState(readStoredPreviewZoom);
  const [page, setPage] = useState(readStoredPreviewPage);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [error, setError] = useState('');
  const framePage = Math.min(page, totalPages || page);
  const zoomPercent = Math.round(zoom * 100);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const timer = window.setTimeout(() => {
      api.previewPdf({
        markdown,
        download: false,
        template: design.template,
        accentColor: design.accentColor,
        fontFamily: design.fontFamily,
        fontSize: design.fontSize,
        pageMargin: design.pageMargin,
        showIcons: design.showIcons
      })
        .then(async (response) => {
          const blob = await response.blob();
          if (cancelled) return;
          const pageCount = await getPdfPageCount(blob);
          objectUrl = URL.createObjectURL(blob);
          setUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return objectUrl;
          });
          setTotalPages(pageCount);
          setPage((current) => (pageCount ? Math.min(current, pageCount) : current));
          setError('');
        })
        .catch((previewError) => {
          if (!cancelled) setError(getErrorMessage(previewError));
        });
    }, compact ? 450 : 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [compact, design.accentColor, design.fontFamily, design.fontSize, design.pageMargin, design.showIcons, design.template, markdown]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_PAGE_KEY, String(framePage));
    } catch {}
  }, [framePage]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_ZOOM_KEY, String(zoom));
    } catch {}
  }, [zoom]);

  return (
    <div className={`preview-shell ${compact ? 'is-compact' : ''}`}>
      <div className="preview-page pdf-frame-wrap" style={{ borderTopColor: design.accentColor }}>
        {url ? (
          <iframe
            key={`${url}-${framePage}-${zoomPercent}`}
            className="pdf-frame"
            title="Vista previa PDF"
            src={`${url}#page=${framePage}&zoom=${zoomPercent}&toolbar=0&navpanes=0`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            {error || 'Generando preview PDF...'}
          </div>
        )}
      </div>
      <div className="preview-controls" hidden={compact}>
        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Pagina anterior" disabled={page <= 1}>
          <ChevronLeft size={15} />
        </button>
        <span>Page {page}{totalPages ? ` / ${totalPages}` : ''}</span>
        <button type="button" onClick={() => setPage((value) => (totalPages ? Math.min(totalPages, value + 1) : value + 1))} aria-label="Pagina siguiente" disabled={totalPages ? page >= totalPages : false}>
          <ChevronRight size={15} />
        </button>
        <span className="ml-auto inline-flex items-center gap-2">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} aria-label="Reducir zoom" disabled={zoom <= 0.5}><Minus size={13} /></button>
          {zoomPercent}%
          <button type="button" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.1).toFixed(2))))} aria-label="Aumentar zoom" disabled={zoom >= 2}><ZoomIn size={13} /></button>
        </span>
      </div>
    </div>
  );
}

const PREVIEW_PAGE_KEY = 'cv_studio_preview_page';
const PREVIEW_ZOOM_KEY = 'cv_studio_preview_zoom';

function readStoredPreviewPage() {
  try {
    const page = Number(localStorage.getItem(PREVIEW_PAGE_KEY));
    return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  } catch {
    return 1;
  }
}

function readStoredPreviewZoom() {
  try {
    const zoom = Number(localStorage.getItem(PREVIEW_ZOOM_KEY));
    return Number.isFinite(zoom) ? Math.min(2, Math.max(0.5, zoom)) : 1;
  } catch {
    return 1;
  }
}

async function getPdfPageCount(blob: Blob) {
  try {
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    const matches = text.match(/\/Type\s*\/Page\b/g);
    return matches?.length || null;
  } catch {
    return null;
  }
}

function SuggestionThumbnails({ design, onChange }: { design: DesignSettings; onChange: (design: Partial<DesignSettings>) => void }) {
  return (
    <div className="suggestion-list">
      {visualTemplates.map((template, index) => (
        <button
          className={`suggestion-thumb ${design.template === template.value ? 'is-active' : ''}`}
          type="button"
          key={template.value}
          onClick={() => onChange({ template: template.value })}
          aria-label={`Usar plantilla ${template.label}`}
        >
          <div className={`thumb-card theme-${index}`}>
            <div className="thumb-title" />
            <div className="thumb-line wide" />
            <div className="thumb-line" />
            <div className="thumb-block" />
            <div className="thumb-line wide" />
            <div className="thumb-line" />
          </div>
        </button>
      ))}
    </div>
  );
}

function DesignPanel({ design, onChange }: { design: DesignSettings; onChange: (design: Partial<DesignSettings>) => void }) {
  return (
    <div className="mt-4 space-y-4">
      <label className="block">
        <span className="dark-label">Plantilla PDF</span>
        <select className="dark-field mt-1" value={design.template} onChange={(event) => onChange({ template: event.target.value as DesignSettings['template'] })}>
          {visualTemplates.map((template) => <option value={template.value} key={template.value}>{template.label}</option>)}
        </select>
      </label>

      <div>
        <span className="dark-label">Color de acento</span>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {accentColors.map((color) => (
            <button
              className={`h-8 cursor-pointer rounded-md border transition ${design.accentColor === color ? 'border-brand ring-2 ring-blue-300/40 dark:border-cyan-300 dark:ring-cyan-300/30' : 'border-slate-300 dark:border-white/15'}`}
              key={color}
              type="button"
              aria-label={`Usar color ${color}`}
              style={{ backgroundColor: color }}
              onClick={() => onChange({ accentColor: color })}
            />
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <Palette size={14} className="text-slate-500 dark:text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Color libre</span>
          <input className="ml-auto h-7 w-10 cursor-pointer border-0 bg-transparent" type="color" value={design.accentColor} onChange={(event) => onChange({ accentColor: event.target.value })} aria-label="Elegir color libre" />
        </label>
      </div>

      <label className="block">
        <span className="dark-label">Fuente PDF</span>
        <select className="dark-field mt-1" value={design.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value as DesignSettings['fontFamily'] })}>
          {fontFamilies.map((font) => <option value={font.value} key={font.value}>{font.label}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="dark-label">Texto</span>
          <select className="dark-field mt-1" value={design.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })}>
            {fontSizes.map((size) => <option value={size.value} key={size.value}>{size.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="dark-label">Margen</span>
          <select className="dark-field mt-1" value={design.pageMargin} onChange={(event) => onChange({ pageMargin: Number(event.target.value) })}>
            {pageMargins.map((margin) => <option value={margin.value} key={margin.value}>{margin.label}</option>)}
          </select>
        </label>
      </div>

      <label className="flex items-center justify-between rounded-md border border-line bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
        <span>
          <span className="block text-sm font-semibold text-slate-900 dark:text-white">Iconos de marca</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Se aplican al PDF cuando la plantilla los soporta.</span>
        </span>
        <input className="h-4 w-4" type="checkbox" checked={design.showIcons} onChange={(event) => onChange({ showIcons: event.target.checked })} />
      </label>
    </div>
  );
}

function QualityPanel({ markdown }: { markdown: string }) {
  const quality = useMemo(() => getDetailedQualitySignals(markdown), [markdown]);
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-md border border-line bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
        <p className="dark-label">Score</p>
        <div className="mt-1 flex items-end gap-2 text-slate-900 dark:text-white">
          <span className="text-3xl font-semibold">{quality.score}</span>
          <span className="pb-1 text-sm text-slate-500 dark:text-slate-400">/ 100</span>
        </div>
      </div>
      {quality.checks.map((check) => (
        <div className="flex items-center gap-3 rounded-md border border-line bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5" key={check.label}>
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${check.passed ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'}`}>
            {check.passed ? <Check size={15} /> : <AlertCircle size={15} />}
          </span>
          <span>
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{check.label}</span>
            <span className="block text-xs leading-5 text-slate-500 dark:text-slate-400">{check.description}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function getDetailedQualitySignals(markdown: string) {
  const checks = [
    {
      label: 'Correo electronico',
      passed: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(markdown),
      weight: 15,
      description: 'Los reclutadores necesitan una via directa de contacto.'
    },
    {
      label: 'Telefono',
      passed: /[\+\d][\d\s\-()]{7,20}\d/.test(markdown),
      weight: 15,
      description: 'Un numero claro mejora la respuesta en procesos rapidos.'
    },
    {
      label: 'Presencia digital',
      passed: /(linkedin\.com|github\.com|portfolio|behance|dribbble|gitlab)/i.test(markdown),
      weight: 15,
      description: 'LinkedIn, GitHub o portfolio refuerzan credibilidad.'
    },
    {
      label: 'Experiencia profesional',
      passed: /#+.*(experiencia|experience|trabajo|work)/i.test(markdown),
      weight: 20,
      description: 'La experiencia debe estar marcada como seccion facil de escanear.'
    },
    {
      label: 'Educacion',
      passed: /#+.*(educacion|education|estudios|formacion)/i.test(markdown.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
      weight: 10,
      description: 'Incluye formacion academica o certificaciones relevantes.'
    },
    {
      label: 'Verbos de accion',
      passed: /(desarrolle|lidere|implemente|gestione|mejore|aumente|cree|optimice|logre|disene|coordine|developed|led|implemented|managed|improved|increased|created|optimized|achieved|designed|coordinated)/i.test(markdown.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
      weight: 15,
      description: 'Los logros suenan mas fuertes con acciones concretas.'
    },
    {
      label: 'Longitud adecuada',
      passed: markdown.trim().length > 500 && markdown.trim().length < 4000,
      weight: 10,
      description: 'Busca suficiente detalle sin convertir el CV en una novela.'
    }
  ];

  return {
    score: checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0),
    checks
  };
}

function SideMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-md border border-line bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
