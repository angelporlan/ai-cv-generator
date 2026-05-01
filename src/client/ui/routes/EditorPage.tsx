import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, BriefcaseBusiness, Check, ChevronRight, Download, Gauge, Library, Loader2, Save, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, type CvStatus } from '../../api/client';
import { fromArtifactDto } from '../../domain/aiArtifacts';
import { getUsageCopy } from '../../domain/aiActions';
import { accentColors, fontFamilies, fontSizes, pageMargins, visualTemplates, type DesignSettings } from '../../domain/design';
import { getQualitySignals, parseMarkdown, serializeParsedCv } from '../../domain/editor';
import { statusLabels, statusOrder } from '../../domain/tracker';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { AiPanel } from '../components/AiPanel';
import { Segmented, SideMetric } from '../components/common';
import { AiDialog, LinkedInDialog } from '../components/dialogs';
import { getErrorMessage, useSession } from '../hooks';

export function EditorPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { markdown, setMarkdown, selectedCvId, setSelectedCvId, editorMode, setEditorMode, rightPanel, setRightPanel, design, setDesign, aiArtifacts, clearAiArtifacts } = useWorkspaceStore();
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const quality = useMemo(() => getQualitySignals(markdown), [markdown]);
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [saveName, setSaveName] = useState(parsed.title);
  const [status, setStatus] = useState<CvStatus>('draft');
  const usage = session.data?.usage;
  const authenticated = Boolean(session.data?.authenticated);
  const remoteArtifacts = useQuery({
    queryKey: ['ai-artifacts'],
    queryFn: api.listAiArtifacts,
    enabled: authenticated
  });
  const visibleArtifacts = remoteArtifacts.data?.items.map(fromArtifactDto) || aiArtifacts;

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
      setNotice('CV guardado');
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
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'auth_required') setNotice('Entra para descargar PDF');
      else setNotice(getErrorMessage(error));
    }
  });

  return (
    <div className="workspace-grid">
      <aside className="panel hidden xl:block xl:sticky xl:top-20 xl:self-start">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Flujo</p>
            <h2 className="panel-heading">Candidatura</h2>
          </div>
          <Gauge size={18} />
        </div>
        <div className="mt-5 space-y-3">
          <SideMetric label="Calidad" value={`${quality.score}%`} tone={quality.score >= 75 ? 'good' : 'warn'} />
          <SideMetric label="Estado" value={statusLabels[status]} />
          <SideMetric label="IA" value={getUsageCopy(usage)} />
        </div>
        <div className="mt-6 space-y-2">
          <button className="side-action" type="button" onClick={() => setAiOpen(true)}>
            <Wand2 size={16} /> Asistente IA <ChevronRight size={15} />
          </button>
          <button className="side-action" type="button" onClick={() => setLinkedinOpen(true)}>
            <BriefcaseBusiness size={16} /> Importar LinkedIn <ChevronRight size={15} />
          </button>
          <button className="side-action" type="button" onClick={() => navigate('/library')}>
            <Library size={16} /> Abrir biblioteca <ChevronRight size={15} />
          </button>
        </div>
      </aside>

      <section className="panel min-h-[calc(100vh-6rem)]">
        <div className="flex flex-col gap-4 border-b border-line pb-4">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Workspace</p>
            <input
              className="mt-1 w-full bg-transparent text-2xl font-semibold tracking-normal outline-none"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              aria-label="Nombre del CV"
            />
          </div>
          <div className="toolbar-row">
            <div className="toolbar-group">
              <select className="field h-10 w-full sm:w-40" value={status} onChange={(event) => setStatus(event.target.value as CvStatus)}>
                {statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}
              </select>
              <Segmented
                value={editorMode}
                options={[
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'visual', label: 'Visual' }
                ]}
                onChange={(value) => setEditorMode(value as 'markdown' | 'visual')}
              />
            </div>
            <div className="toolbar-group justify-end">
              <button className="button-secondary" type="button" onClick={() => saveCv.mutate()} disabled={saveCv.isPending || !authenticated}>
                {saveCv.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar
              </button>
              <button className="button-primary" type="button" onClick={() => downloadPdf.mutate()} disabled={downloadPdf.isPending}>
                {downloadPdf.isPending ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                Descargar PDF
              </button>
            </div>
          </div>
        </div>

        {!authenticated ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Puedes editar en local. Entra para guardar biblioteca, descargar PDF y usar IA.
          </div>
        ) : null}
        {notice ? <div className="mt-4 rounded-lg border border-line bg-slate-50 px-4 py-3 text-sm text-slate-700">{notice}</div> : null}

        <div className="mt-4">
          {editorMode === 'markdown' ? (
            <textarea
              className="editor-textarea"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              spellCheck={false}
              aria-label="Editor markdown del CV"
            />
          ) : (
            <VisualEditor markdown={markdown} onChange={setMarkdown} />
          )}
        </div>
      </section>

      <aside className="panel min-h-[calc(100vh-6rem)] xl:sticky xl:top-20 xl:self-start">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <p className="eyebrow">Panel contextual</p>
            <h2 className="panel-heading">Vista y calidad</h2>
          </div>
          <Segmented
            value={rightPanel}
            options={[
              { value: 'preview', label: 'Preview' },
              { value: 'quality', label: 'Check' },
              { value: 'design', label: 'Diseño' },
              { value: 'ai', label: 'IA' }
            ]}
            onChange={(value) => setRightPanel(value as 'preview' | 'quality' | 'design' | 'ai')}
          />
        </div>
        {rightPanel === 'preview' ? <CvPreview markdown={markdown} design={design} /> : null}
        {rightPanel === 'quality' ? <QualityPanel markdown={markdown} /> : null}
        {rightPanel === 'design' ? <DesignPanel design={design} onChange={setDesign} /> : null}
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
      </aside>

      {aiOpen ? <AiDialog markdown={markdown} usage={usage} authenticated={authenticated} onApply={setMarkdown} onClose={() => setAiOpen(false)} /> : null}
      {linkedinOpen ? <LinkedInDialog onApply={setMarkdown} onClose={() => setLinkedinOpen(false)} /> : null}
    </div>
  );
}

function AiArtifactsPanel({ artifacts, onApply, onClear }: {
  artifacts: ReturnType<typeof useWorkspaceStore.getState>['aiArtifacts'];
  onApply: (markdown: string) => void;
  onClear: () => void;
}) {
  if (!artifacts.length) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm text-slate-500">
        Los resultados de IA apareceran aqui para que puedas recuperarlos durante la sesion.
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Artefactos IA</p>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900" type="button" onClick={onClear}>
          <Trash2 size={13} /> Limpiar
        </button>
      </div>
      {artifacts.slice(0, 4).map((artifact) => (
        <div className="rounded-lg border border-line bg-white p-3" key={artifact.id}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{artifact.title}</p>
              <p className="mt-1 text-xs text-slate-500">{artifact.model}</p>
            </div>
            <button className="button-secondary h-8 px-2 text-xs" type="button" onClick={() => onApply(artifact.content)}>Aplicar</button>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{artifact.content}</p>
        </div>
      ))}
    </div>
  );
}

function VisualEditor({ markdown, onChange }: { markdown: string; onChange: (markdown: string) => void }) {
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label">Titular</span>
        <input className="field mt-1" value={parsed.title} onChange={(event) => onChange(serializeParsedCv({ ...parsed, title: event.target.value }))} />
      </label>
      <label className="block">
        <span className="label">Resumen corto</span>
        <input className="field mt-1" value={parsed.subtitle} onChange={(event) => onChange(serializeParsedCv({ ...parsed, subtitle: event.target.value }))} />
      </label>
      <div className="grid gap-3">
        {parsed.sections.map((section, sectionIndex) => (
          <div className="rounded-lg border border-line bg-white p-4" key={`${section.title}-${sectionIndex}`}>
            <input
              className="mb-3 w-full bg-transparent text-sm font-semibold outline-none"
              value={section.title}
              onChange={(event) => {
                const sections = parsed.sections.map((item, index) => index === sectionIndex ? { ...item, title: event.target.value } : item);
                onChange(serializeParsedCv({ ...parsed, sections }));
              }}
            />
            <textarea
              className="field min-h-28 font-mono text-sm"
              value={section.items.join('\n')}
              onChange={(event) => {
                const items = event.target.value.split(/\r?\n/).filter(Boolean);
                const sections = parsed.sections.map((item, index) => index === sectionIndex ? { ...item, items } : item);
                onChange(serializeParsedCv({ ...parsed, sections }));
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CvPreview({ markdown, design }: { markdown: string; design: DesignSettings }) {
  const [mode, setMode] = useState<'simple' | 'pdf'>('simple');
  const [pdfUrl, setPdfUrl] = useState('');
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const previewPdf = useMutation({
    mutationFn: () => api.previewPdf({
      markdown,
      download: false,
      template: design.template,
      accentColor: design.accentColor,
      fontFamily: design.fontFamily,
      fontSize: design.fontSize,
      pageMargin: design.pageMargin,
      showIcons: design.showIcons
    }),
    onSuccess: async (response) => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const blob = await response.blob();
      setPdfUrl(URL.createObjectURL(blob));
      setMode('pdf');
    }
  });

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-slate-50 p-1">
        <button className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${mode === 'simple' ? 'bg-white shadow-sm' : 'text-slate-500'}`} type="button" onClick={() => setMode('simple')}>
          Simple
        </button>
        <button className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${mode === 'pdf' ? 'bg-white shadow-sm' : 'text-slate-500'}`} type="button" onClick={() => pdfUrl ? setMode('pdf') : previewPdf.mutate()}>
          {previewPdf.isPending ? 'Generando...' : 'PDF'}
        </button>
      </div>

      {mode === 'pdf' && pdfUrl ? (
        <iframe className="h-[720px] w-full rounded-lg border border-line bg-white" title="Vista previa PDF" src={pdfUrl} />
      ) : (
        <div className="rounded-lg border border-line bg-white p-7 shadow-sm" style={{ borderTop: `4px solid ${design.accentColor}`, fontSize: `${design.fontSize}px` }}>
          <h1 className="text-2xl font-semibold tracking-normal" style={{ color: design.accentColor }}>{parsed.title}</h1>
          {parsed.subtitle ? <p className="mt-2 text-sm leading-6 text-slate-600">{parsed.subtitle}</p> : null}
          <div className="mt-6 space-y-5">
            {parsed.sections.map((section) => (
              <section key={section.title}>
                <h2 className="border-b border-line pb-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: design.accentColor }}>{section.title}</h2>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                  {section.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DesignPanel({ design, onChange }: { design: DesignSettings; onChange: (design: Partial<DesignSettings>) => void }) {
  return (
    <div className="mt-4 space-y-5">
      <label className="block">
        <span className="label">Plantilla PDF</span>
        <select className="field mt-1" value={design.template} onChange={(event) => onChange({ template: event.target.value as DesignSettings['template'] })}>
          {visualTemplates.map((template) => <option value={template.value} key={template.value}>{template.label}</option>)}
        </select>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {visualTemplates.find((template) => template.value === design.template)?.description}
        </p>
      </label>

      <div>
        <span className="label">Color de acento</span>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {accentColors.map((color) => (
            <button
              className={`h-9 rounded-lg border transition ${design.accentColor === color ? 'border-slate-950 ring-2 ring-slate-200' : 'border-line'}`}
              key={color}
              type="button"
              aria-label={`Usar color ${color}`}
              style={{ backgroundColor: color }}
              onClick={() => onChange({ accentColor: color })}
            />
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Fuente PDF</span>
        <select className="field mt-1" value={design.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value as DesignSettings['fontFamily'] })}>
          {fontFamilies.map((font) => <option value={font.value} key={font.value}>{font.label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="label">Tamaño de texto</span>
        <select className="field mt-1" value={design.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })}>
          {fontSizes.map((size) => <option value={size.value} key={size.value}>{size.label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="label">Margen</span>
        <select className="field mt-1" value={design.pageMargin} onChange={(event) => onChange({ pageMargin: Number(event.target.value) })}>
          {pageMargins.map((margin) => <option value={margin.value} key={margin.value}>{margin.label}</option>)}
        </select>
      </label>

      <label className="flex items-center justify-between rounded-lg border border-line bg-white p-3">
        <span>
          <span className="block text-sm font-semibold">Iconos de marca</span>
          <span className="block text-xs text-slate-500">Se aplican al PDF cuando la plantilla los soporta.</span>
        </span>
        <input className="h-4 w-4" type="checkbox" checked={design.showIcons} onChange={(event) => onChange({ showIcons: event.target.checked })} />
      </label>
    </div>
  );
}

function QualityPanel({ markdown }: { markdown: string }) {
  const quality = useMemo(() => getQualitySignals(markdown), [markdown]);
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-line bg-slate-50 p-5">
        <p className="eyebrow">Score</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-4xl font-semibold">{quality.score}</span>
          <span className="pb-1 text-sm text-slate-500">/ 100</span>
        </div>
      </div>
      {quality.checks.map((check) => (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-3" key={check.label}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${check.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {check.passed ? <Check size={16} /> : <AlertCircle size={16} />}
          </span>
          <span className="text-sm font-medium">{check.label}</span>
        </div>
      ))}
    </div>
  );
}
