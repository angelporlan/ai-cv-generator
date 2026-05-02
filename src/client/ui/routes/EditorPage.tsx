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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, type CvStatus, type CvSummary } from '../../api/client';
import { getUsageCopy } from '../../domain/aiActions';
import { fromArtifactDto } from '../../domain/aiArtifacts';
import { accentColors, fontFamilies, fontSizes, pageMargins, visualTemplates, type DesignSettings } from '../../domain/design';
import { getQualitySignals, parseMarkdown, serializeParsedCv } from '../../domain/editor';
import { statusLabels, statusOrder } from '../../domain/tracker';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { AiPanel } from '../components/AiPanel';
import { AiDialog, LinkedInDialog } from '../components/dialogs';
import { getErrorMessage, useSession } from '../hooks';

export function EditorPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { markdown, setMarkdown, selectedCvId, setSelectedCvId, editorMode, setEditorMode, rightPanel, setRightPanel, design, setDesign, aiArtifacts, clearAiArtifacts } = useWorkspaceStore();
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const introLines = useMemo(() => getIntroLines(markdown, parsed), [markdown, parsed]);
  const navigatorGroups = useMemo(() => getNavigatorGroups(parsed), [parsed]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const usage = session.data?.usage;
  const authenticated = Boolean(session.data?.authenticated);
  const stats = useMemo(() => getEditorStats(markdown), [markdown]);
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

  const handleExampleLoad = () => {
    const file = contentTemplate.replace('.md', '-example.md');
    loadTemplate.mutate(file);
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
      setNotice('Cambia a Markdown para aplicar formato sobre seleccion');
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

    const nextOpen = !referenceOpen;
    setReferenceOpen(nextOpen);
    if (nextOpen && !referenceMarkdown) {
      const firstId = savedCvs.data?.items[0]?.id;
      if (firstId) loadReference.mutate(firstId);
    }
  };

  return (
    <div className="editor-shell">
      <aside className="editor-nav">
        <h2 className="px-4 pt-4 text-sm font-semibold text-white">Section Navigator</h2>
        <div className="mt-4 space-y-1 px-2">
          {navigatorGroups.map((item, index) => (
            <button className={`editor-nav-item ${/experiencia|experience/i.test(item) ? 'is-active' : ''}`} type="button" key={`${item}-${index}`}>
              <span>{item}</span>
              {index < 5 ? <ChevronDown size={13} /> : null}
            </button>
          ))}
        </div>
      </aside>

      <section className="editor-board">
        <div className="studio-topbar">
          <div className="min-w-0">
            <input
              className="studio-title-input"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              aria-label="Nombre del CV"
            />
            <p className="mt-1 text-xs text-slate-400">{notice || (authenticated ? 'Borrador local cargado' : 'Editando en local')}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
            <button className="studio-button ghost" type="button" onClick={toggleReference}>
              <PanelRightOpen size={14} />
              Comparar
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
          <div className="mx-4 mt-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
            Puedes editar en local. Entra para guardar biblioteca, descargar PDF y usar IA.
          </div>
        ) : null}

        <div className={`editor-canvas ${referenceOpen ? 'has-reference' : ''}`}>
          <div className="editor-column">
            <div className="document-panel">
              <SectionHeader icon={<List size={14} />} title="Resumen Profesional" />
              <div className="format-toolbar" aria-label="Herramientas de formato">
                <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('bold')} aria-label="Negrita"><Bold size={14} /></button>
                <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('italic')} aria-label="Cursiva"><Italic size={14} /></button>
                <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('underline')} aria-label="Subrayado"><Underline size={14} /></button>
                <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('link')} aria-label="Enlace"><Link size={14} /></button>
                <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('list')} aria-label="Lista"><List size={14} /></button>
                <button className="tool-icon" type="button" onClick={() => applyMarkdownFormat('ordered')} aria-label="Lista numerada"><ListOrdered size={14} /></button>
                <button className="tool-icon" type="button" onClick={handleExampleLoad} aria-label="Cargar ejemplo"><MoreHorizontal size={14} /></button>
                <button className="tool-icon" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Importar Markdown"><FileInput size={14} /></button>
              </div>
              <input ref={fileInputRef} hidden type="file" accept=".md,text/markdown,text/plain" onChange={(event) => handleFileImport(event.target.files?.[0])} />
              <div className="contact-block">
                {introLines.map((line, index) => <p key={`${line}-${index}`}>⇔ {line}</p>)}
              </div>
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
                <VisualEditor markdown={markdown} onChange={setMarkdown} />
              )}
              <div className="editor-stats">
                <span>{stats.characters.toLocaleString('es')} caracteres</span>
                <span>{stats.lines.toLocaleString('es')} lineas</span>
                <span>{stats.words.toLocaleString('es')} palabras</span>
              </div>
            </div>
          </div>

          {referenceOpen ? (
            <ReferencePane
              cvs={savedCvs.data?.items || []}
              selectedId={referenceCvId}
              markdown={referenceMarkdown}
              mode={referenceMode}
              loading={loadReference.isPending}
              onModeChange={setReferenceMode}
              onSelect={(id) => loadReference.mutate(Number(id))}
              onClose={() => setReferenceOpen(false)}
            />
          ) : null}

          <aside className="preview-column">
            <CvPreview markdown={markdown} design={design} />
          </aside>
        </div>
      </section>

      <aside className="suggestions-panel">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Design Suggestions</h2>
          <button className="tool-icon" type="button" aria-label="Cerrar sugerencias"><X size={14} /></button>
        </div>
        <SuggestionThumbnails design={design} onChange={setDesign} />
        <div className="border-t border-white/10 p-4">
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

      {aiOpen ? <AiDialog markdown={markdown} usage={usage} authenticated={authenticated} onApply={setMarkdown} onClose={() => setAiOpen(false)} /> : null}
      {linkedinOpen ? <LinkedInDialog onApply={setMarkdown} onClose={() => setLinkedinOpen(false)} /> : null}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="section-header">
      <div className="flex items-center gap-2">{icon}<span>{title}</span></div>
      <ChevronDown size={14} />
    </div>
  );
}

function getIntroLines(markdown: string, parsed: ReturnType<typeof parseMarkdown>) {
  const beforeSections: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('# ')) continue;
    if (line.startsWith('## ')) break;
    beforeSections.push(line.replace(/^[-*]\s*/, '').trim());
  }

  const fallback = [parsed.title, parsed.subtitle].filter(Boolean);
  return Array.from(new Set(beforeSections.length ? beforeSections : fallback)).slice(0, 7);
}

function getNavigatorGroups(parsed: ReturnType<typeof parseMarkdown>) {
  const defaults = ['Resumen Profesional', 'Experiencia', 'Educacion', 'Habilidades'];
  const titles = parsed.sections.map((section) => section.title).filter(Boolean);
  return Array.from(new Set([...titles, ...defaults])).slice(0, 7);
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

function AiArtifactsPanel({ artifacts, onApply, onClear }: {
  artifacts: ReturnType<typeof useWorkspaceStore.getState>['aiArtifacts'];
  onApply: (markdown: string) => void;
  onClear: () => void;
}) {
  if (!artifacts.length) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-white/15 bg-white/5 p-3 text-xs leading-5 text-slate-400">
        Los resultados de IA apareceran aqui para recuperarlos durante la sesion.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Artefactos IA</p>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white" type="button" onClick={onClear}>
          <Trash2 size={13} /> Limpiar
        </button>
      </div>
      {artifacts.slice(0, 4).map((artifact) => (
        <div className="rounded-md border border-white/10 bg-white/5 p-3" key={artifact.id}>
          <p className="text-sm font-semibold text-white">{artifact.title}</p>
          <p className="mt-1 text-xs text-slate-400">{artifact.model}</p>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-300">{artifact.content}</p>
          <button className="studio-button ghost mt-3 h-8 text-xs" type="button" onClick={() => onApply(artifact.content)}>Aplicar</button>
        </div>
      ))}
    </div>
  );
}

function ReferencePane({ cvs, selectedId, markdown, mode, loading, onModeChange, onSelect, onClose }: {
  cvs: CvSummary[];
  selectedId: string;
  markdown: string;
  mode: 'markdown' | 'visual';
  loading: boolean;
  onModeChange: (mode: 'markdown' | 'visual') => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="reference-column">
      <div className="reference-head">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-slate-500">Referencia</p>
          <select className="dark-field mt-1" value={selectedId} onChange={(event) => onSelect(event.target.value)} aria-label="CV de referencia">
            <option value="">Selecciona CV</option>
            {cvs.map((cv) => <option value={cv.id} key={cv.id}>{cv.name}</option>)}
          </select>
        </div>
        <button className="tool-icon" type="button" onClick={onClose} aria-label="Cerrar comparacion"><X size={14} /></button>
      </div>
      <div className="mode-toggle mx-3 mt-3">
        <button className={mode === 'markdown' ? 'is-active' : ''} type="button" onClick={() => onModeChange('markdown')}>Markdown</button>
        <button className={mode === 'visual' ? 'is-active' : ''} type="button" onClick={() => onModeChange('visual')}>Visual</button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-400"><Loader2 className="animate-spin" size={15} /> Cargando referencia</div>
      ) : mode === 'markdown' ? (
        <textarea className="reference-textarea" value={markdown} readOnly aria-label="Markdown del CV de referencia" />
      ) : (
        <div className="reference-visual">
          <CvPreview markdown={markdown || '# Sin referencia'} design={{ ...defaultPreviewDesign }} compact />
        </div>
      )}
    </aside>
  );
}

function VisualEditor({ markdown, onChange }: { markdown: string; onChange: (markdown: string) => void }) {
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const update = (next: typeof parsed) => onChange(serializeParsedCv(next));
  const updateSection = (sectionIndex: number, patch: Partial<typeof parsed.sections[number]>) => {
    update({ ...parsed, sections: parsed.sections.map((section, index) => index === sectionIndex ? { ...section, ...patch } : section) });
  };
  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    const target = sectionIndex + direction;
    if (target < 0 || target >= parsed.sections.length) return;
    const sections = [...parsed.sections];
    const [section] = sections.splice(sectionIndex, 1);
    sections.splice(target, 0, section);
    update({ ...parsed, sections });
  };

  return (
    <div className="space-y-4">
      <div className="editable-section">
        <SectionHeader icon={<FileText size={14} />} title="Identidad" />
        <input className="section-title-input" value={parsed.title} onChange={(event) => update({ ...parsed, title: event.target.value })} aria-label="Nombre principal" />
        <textarea className="section-body-input" value={parsed.subtitle} onChange={(event) => update({ ...parsed, subtitle: event.target.value })} aria-label="Resumen o contacto inicial" />
      </div>
      {parsed.sections.map((section, sectionIndex) => (
        <EditableSection
          key={`${section.title}-${sectionIndex}`}
          canMoveUp={sectionIndex > 0}
          canMoveDown={sectionIndex < parsed.sections.length - 1}
          title={section.title}
          value={section.items.join('\n')}
          onTitleChange={(title) => updateSection(sectionIndex, { title })}
          onItemsChange={(items) => updateSection(sectionIndex, { items })}
          onMove={(direction) => moveSection(sectionIndex, direction)}
          onRemove={() => update({ ...parsed, sections: parsed.sections.filter((_, index) => index !== sectionIndex) })}
        />
      ))}
      <button
        className="studio-button ghost mx-4 mb-4"
        type="button"
        onClick={() => update({ ...parsed, sections: [...parsed.sections, { title: 'Nueva seccion', items: ['Nuevo bloque'] }] })}
      >
        <Plus size={14} /> Anadir seccion
      </button>
    </div>
  );
}

function EditableSection({ title, value, canMoveUp, canMoveDown, onTitleChange, onItemsChange, onMove, onRemove }: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  title: string;
  value: string;
  onTitleChange: (title: string) => void;
  onItemsChange: (items: string[]) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="editable-section">
      <div className="section-header">
        <div className="flex min-w-0 items-center gap-2"><FileText size={14} /><span className="truncate">{title || 'Seccion sin titulo'}</span></div>
        <div className="flex items-center gap-1">
          <button className="tool-icon" type="button" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Subir seccion"><ArrowUp size={13} /></button>
          <button className="tool-icon" type="button" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Bajar seccion"><ArrowDown size={13} /></button>
          <button className="tool-icon" type="button" onClick={onRemove} aria-label="Eliminar seccion"><Trash2 size={13} /></button>
        </div>
      </div>
      <input className="section-title-input" value={title} onChange={(event) => onTitleChange(event.target.value)} aria-label="Titulo de seccion" />
      <textarea
        className="section-body-input"
        value={value}
        onChange={(event) => onItemsChange(event.target.value.split(/\r?\n/).filter(Boolean))}
        aria-label={`Contenido de ${title}`}
      />
    </div>
  );
}

function CvPreview({ markdown, design, compact = false }: { markdown: string; design: DesignSettings; compact?: boolean }) {
  const [url, setUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

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
          objectUrl = URL.createObjectURL(blob);
          setUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return objectUrl;
          });
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

  return (
    <div className={`preview-shell ${compact ? 'is-compact' : ''}`}>
      <div className="preview-label">Preview</div>
      <div className="preview-page pdf-frame-wrap" style={{ borderTopColor: design.accentColor }}>
        {url ? (
          <iframe
            className="pdf-frame"
            title="Vista previa PDF"
            src={`${url}#page=${page}&zoom=${Math.round(zoom * 100)}&toolbar=0&navpanes=0`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            {error || 'Generando preview PDF...'}
          </div>
        )}
      </div>
      <div className="preview-controls" hidden={compact}>
        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Pagina anterior"><ChevronLeft size={15} /></button>
        <span>Page {page}</span>
        <button type="button" onClick={() => setPage((value) => value + 1)} aria-label="Pagina siguiente"><ChevronRight size={15} /></button>
        <span className="ml-auto inline-flex items-center gap-2">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} aria-label="Reducir zoom"><Minus size={13} /></button>
          {Math.round(zoom * 100)}%
          <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))} aria-label="Aumentar zoom"><ZoomIn size={13} /></button>
        </span>
      </div>
    </div>
  );
}

function SuggestionThumbnails({ design, onChange }: { design: DesignSettings; onChange: (design: Partial<DesignSettings>) => void }) {
  return (
    <div className="suggestion-list">
      {visualTemplates.slice(0, 4).map((template, index) => (
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
              className={`h-8 cursor-pointer rounded-md border transition ${design.accentColor === color ? 'border-cyan-300 ring-2 ring-cyan-300/30' : 'border-white/15'}`}
              key={color}
              type="button"
              aria-label={`Usar color ${color}`}
              style={{ backgroundColor: color }}
              onClick={() => onChange({ accentColor: color })}
            />
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2">
          <Palette size={14} className="text-slate-400" />
          <span className="text-xs text-slate-400">Color libre</span>
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

      <label className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 p-3">
        <span>
          <span className="block text-sm font-semibold text-white">Iconos de marca</span>
          <span className="block text-xs text-slate-400">Se aplican al PDF cuando la plantilla los soporta.</span>
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
      <div className="rounded-md border border-white/10 bg-white/5 p-4">
        <p className="dark-label">Score</p>
        <div className="mt-1 flex items-end gap-2 text-white">
          <span className="text-3xl font-semibold">{quality.score}</span>
          <span className="pb-1 text-sm text-slate-400">/ 100</span>
        </div>
      </div>
      {quality.checks.map((check) => (
        <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-3" key={check.label}>
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${check.passed ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
            {check.passed ? <Check size={15} /> : <AlertCircle size={15} />}
          </span>
          <span>
            <span className="block text-sm font-medium text-slate-200">{check.label}</span>
            <span className="block text-xs leading-5 text-slate-400">{check.description}</span>
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
  const toneClass = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white';
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
