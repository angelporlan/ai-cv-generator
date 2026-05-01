import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Gauge,
  Library,
  Loader2,
  Lock,
  LogOut,
  PanelRight,
  Save,
  Search,
  Sparkles,
  User,
  Wand2
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError, api, type Cv, type CvStatus, type CvSummary, type Usage } from '../api/client';
import { canUseAi, shouldPromptUpgrade } from '../domain/access';
import { aiActions, getAiAction, getUsageCopy, type AiActionId } from '../domain/aiActions';
import { getQualitySignals, parseMarkdown, serializeParsedCv } from '../domain/editor';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const authSchema = z.object({
  email: z.string().email('Introduce un email valido'),
  password: z.string().min(8, 'Minimo 8 caracteres')
});

type AuthForm = z.infer<typeof authSchema>;

const statusLabels: Record<CvStatus, string> = {
  draft: 'Preparando',
  applied: 'Aplicado',
  interview: 'Entrevista',
  offer: 'Oferta',
  rejected: 'Descartado',
  archived: 'Archivado'
};

const statusOrder: CvStatus[] = ['draft', 'applied', 'interview', 'offer', 'rejected', 'archived'];

function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: api.getSession
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la accion';
}

function Shell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const usage = session.data?.usage;
  const authenticated = Boolean(session.data?.authenticated);
  const queryClient = useQueryClient();
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setAccountOpen(false);
    }
  });

  return (
    <div className="min-h-screen bg-mist text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
              <FileText size={19} />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-4">CV Studio Pro</span>
              <span className="block text-xs text-slate-500">quiet power for job search</span>
            </span>
          </NavLink>

          <nav className="ml-2 hidden items-center gap-1 rounded-lg border border-line bg-slate-50 p-1 md:flex">
            <TopLink to="/" icon={<PanelRight size={16} />} label="Editor" />
            <TopLink to="/library" icon={<Library size={16} />} label="CVs" />
            <TopLink to="/tracker" icon={<BriefcaseBusiness size={16} />} label="Tracker" />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
              {getUsageCopy(usage)}
            </span>
            <button className="icon-button" type="button" onClick={() => setAccountOpen(true)} aria-label="Cuenta">
              <User size={18} />
            </button>
            {authenticated ? (
              <button className="button-secondary hidden sm:inline-flex" type="button" onClick={() => logout.mutate()}>
                <LogOut size={16} /> Salir
              </button>
            ) : (
              <button className="button-primary" type="button" onClick={() => setAuthOpen(true)}>
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-4">{children}</main>
      {authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null}
      {accountOpen ? <AccountDialog usage={usage} authenticated={authenticated} onClose={() => setAccountOpen(false)} onLogin={() => setAuthOpen(true)} /> : null}
    </div>
  );
}

function TopLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-white text-ink shadow-sm' : 'text-slate-600 hover:bg-white hover:text-ink'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="*" element={<EditorPage />} />
      </Routes>
    </Shell>
  );
}

function EditorPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { markdown, setMarkdown, selectedCvId, setSelectedCvId, editorMode, setEditorMode, rightPanel, setRightPanel } = useWorkspaceStore();
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const quality = useMemo(() => getQualitySignals(markdown), [markdown]);
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [saveName, setSaveName] = useState(parsed.title);
  const [status, setStatus] = useState<CvStatus>('draft');
  const usage = session.data?.usage;
  const authenticated = Boolean(session.data?.authenticated);

  const saveCv = useMutation({
    mutationFn: async () => {
      const payload = {
        name: saveName || parsed.title || 'CV sin titulo',
        status,
        description: parsed.subtitle,
        content: markdown,
        template: 'harvard'
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
    mutationFn: () => api.previewPdf({ markdown, download: true, template: 'harvard' }),
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
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_420px]">
      <aside className="panel hidden xl:block">
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
        <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Workspace</p>
            <input
              className="w-full bg-transparent text-2xl font-semibold outline-none"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              aria-label="Nombre del CV"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="field h-10 w-40" value={status} onChange={(event) => setStatus(event.target.value as CvStatus)}>
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
            <button className="button-secondary" type="button" onClick={() => saveCv.mutate()} disabled={saveCv.isPending || !authenticated}>
              {saveCv.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Guardar
            </button>
            <button className="button-primary" type="button" onClick={() => downloadPdf.mutate()} disabled={downloadPdf.isPending}>
              {downloadPdf.isPending ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              PDF
            </button>
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
              className="min-h-[620px] w-full resize-y rounded-lg border border-line bg-slate-950 p-5 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-brand"
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

      <aside className="panel min-h-[calc(100vh-6rem)]">
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
              { value: 'ai', label: 'IA' }
            ]}
            onChange={(value) => setRightPanel(value as 'preview' | 'quality' | 'ai')}
          />
        </div>
        {rightPanel === 'preview' ? <CvPreview markdown={markdown} /> : null}
        {rightPanel === 'quality' ? <QualityPanel markdown={markdown} /> : null}
        {rightPanel === 'ai' ? <AiPanel inline markdown={markdown} usage={usage} authenticated={authenticated} onApply={setMarkdown} /> : null}
      </aside>

      {aiOpen ? <AiDialog markdown={markdown} usage={usage} authenticated={authenticated} onApply={setMarkdown} onClose={() => setAiOpen(false)} /> : null}
      {linkedinOpen ? <LinkedInDialog onApply={setMarkdown} onClose={() => setLinkedinOpen(false)} /> : null}
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

function CvPreview({ markdown }: { markdown: string }) {
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);

  return (
    <div className="mt-4 rounded-lg border border-line bg-white p-7 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-normal">{parsed.title}</h1>
      {parsed.subtitle ? <p className="mt-2 text-sm leading-6 text-slate-600">{parsed.subtitle}</p> : null}
      <div className="mt-6 space-y-5">
        {parsed.sections.map((section) => (
          <section key={section.title}>
            <h2 className="border-b border-line pb-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{section.title}</h2>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
              {section.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
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

function AiPanel({ markdown, usage, authenticated, onApply, inline = false }: {
  markdown: string;
  usage?: Usage | null;
  authenticated: boolean;
  onApply: (markdown: string) => void;
  inline?: boolean;
}) {
  const [actionId, setActionId] = useState<AiActionId>('adapt');
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const action = getAiAction(actionId);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.adaptCv({ markdown, action: actionId, jobDescription: input }),
    onSuccess: (payload) => {
      onApply(payload.markdown);
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setMessage('Resultado aplicado al editor');
    },
    onError: (error) => setMessage(getErrorMessage(error))
  });
  const locked = !canUseAi(authenticated, usage);

  return (
    <div className={inline ? 'mt-4 space-y-4' : 'space-y-4'}>
      <div className="grid grid-cols-2 gap-2">
        {aiActions.map((item) => (
          <button
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${item.id === actionId ? 'border-brand bg-blue-50 text-brand' : 'border-line bg-white hover:border-slate-300'}`}
            type="button"
            key={item.id}
            onClick={() => setActionId(item.id)}
          >
            <span className="block font-semibold">{item.shortLabel}</span>
            <span className="block text-xs text-slate-500">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-semibold">{action.label}</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{action.description}</p>
      </div>
      <label className="block">
        <span className="label">{action.inputLabel}</span>
        <textarea className="field mt-1 min-h-32" value={input} onChange={(event) => setInput(event.target.value)} placeholder={action.placeholder} />
      </label>
      {locked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {!authenticated ? 'Entra para usar IA.' : shouldPromptUpgrade(authenticated, usage) ? 'Has agotado los usos gratis.' : 'IA no disponible.'}
        </div>
      ) : null}
      {message ? <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm text-slate-700">{message}</div> : null}
      <button className="button-primary w-full" type="button" disabled={locked || mutation.isPending || (action.requiresInput && !input.trim())} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        Aplicar IA
      </button>
    </div>
  );
}

function LibraryPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const deferredSearch = search;
  const query = useQuery({
    queryKey: ['cvs', deferredSearch, status],
    queryFn: () => api.listCvs({ search: deferredSearch, status })
  });
  const navigate = useNavigate();
  const { setMarkdown, setSelectedCvId } = useWorkspaceStore();
  const loadCv = useMutation({
    mutationFn: (id: number) => api.getCv(id),
    onSuccess: (payload) => {
      setMarkdown(payload.cv.content);
      setSelectedCvId(payload.cv.id);
      navigate('/');
    }
  });

  return (
    <section className="panel">
      <div className="flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-center">
        <div className="flex-1">
          <p className="eyebrow">Biblioteca</p>
          <h1 className="text-2xl font-semibold">CVs guardados</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={17} />
            <input className="field h-10 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar CV" />
          </label>
          <select className="field h-10" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Todos</option>
            {statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {query.data?.items.map((cv) => (
          <CvCard key={cv.id} cv={cv} onOpen={() => loadCv.mutate(cv.id)} />
        ))}
        {!query.isLoading && !query.data?.items.length ? <EmptyState title="Sin CVs guardados" copy="Guarda tu primer CV desde el editor para verlo aqui." /> : null}
      </div>
    </section>
  );
}

function CvCard({ cv, onOpen }: { cv: CvSummary; onOpen: () => void }) {
  return (
    <button className="card-button text-left" type="button" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{cv.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{cv.description || 'Sin descripcion'}</p>
        </div>
        <span className="rounded-full border border-line bg-slate-50 px-2 py-1 text-xs text-slate-600">{statusLabels[cv.status]}</span>
      </div>
      <p className="mt-4 text-xs text-slate-500">{cv.jobUrl || 'Sin oferta asociada'}</p>
    </button>
  );
}

function TrackerPage() {
  const query = useQuery({ queryKey: ['cvs', 'tracker'], queryFn: () => api.listCvs({}) });
  const grouped = useMemo(() => {
    const map = new Map<CvStatus, CvSummary[]>();
    statusOrder.forEach((status) => map.set(status, []));
    query.data?.items.forEach((cv) => map.get(cv.status)?.push(cv));
    return map;
  }, [query.data]);

  return (
    <section className="panel">
      <div className="border-b border-line pb-4">
        <p className="eyebrow">Tracker</p>
        <h1 className="text-2xl font-semibold">Seguimiento de candidaturas</h1>
        <p className="mt-1 text-sm text-slate-600">Una vista tranquila para ordenar oportunidades sin convertir la app en un CRM pesado.</p>
      </div>
      <div className="mt-4 grid gap-3 overflow-x-auto lg:grid-cols-6">
        {statusOrder.map((status) => (
          <div className="min-h-96 min-w-56 rounded-lg border border-line bg-slate-50 p-3" key={status}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{statusLabels[status]}</h2>
              <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{grouped.get(status)?.length || 0}</span>
            </div>
            <div className="space-y-2">
              {grouped.get(status)?.map((cv) => (
                <div className="rounded-lg border border-line bg-white p-3" key={cv.id}>
                  <p className="text-sm font-semibold">{cv.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{cv.description || cv.jobUrl || 'Candidatura sin notas'}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const queryClient = useQueryClient();
  const form = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '' }
  });
  const mutation = useMutation({
    mutationFn: (input: AuthForm) => mode === 'login' ? api.login(input.email, input.password) : api.register(input.email, input.password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      onClose();
    }
  });

  return (
    <Modal title="Acceso a tu espacio" onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 rounded-lg border border-line bg-slate-50 p-1">
        <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-600'}`} type="button" onClick={() => setMode('login')}>Entrar</button>
        <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-600'}`} type="button" onClick={() => setMode('register')}>Crear cuenta</button>
      </div>
      <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <label className="block">
          <span className="label">Email</span>
          <input className="field mt-1" type="email" autoComplete="email" {...form.register('email')} />
          {form.formState.errors.email ? <span className="form-error">{form.formState.errors.email.message}</span> : null}
        </label>
        <label className="block">
          <span className="label">Contrasena</span>
          <input className="field mt-1" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...form.register('password')} />
          {form.formState.errors.password ? <span className="form-error">{form.formState.errors.password.message}</span> : null}
        </label>
        {mutation.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{getErrorMessage(mutation.error)}</div> : null}
        <button className="button-primary w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Lock size={16} />}
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
    </Modal>
  );
}

function AccountDialog({ usage, authenticated, onClose, onLogin }: {
  usage?: Usage | null;
  authenticated: boolean;
  onClose: () => void;
  onLogin: () => void;
}) {
  const checkout = useMutation({
    mutationFn: api.createCheckout,
    onSuccess: (payload) => { window.location.href = payload.url; }
  });
  const portal = useMutation({
    mutationFn: api.createBillingPortal,
    onSuccess: (payload) => { window.location.href = payload.url; }
  });

  return (
    <Modal title="Cuenta y plan" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-slate-50 p-4">
          <p className="eyebrow">Estado</p>
          <p className="mt-1 text-lg font-semibold">{authenticated ? usage?.billing?.isActive ? 'Plan Pro' : 'Plan gratis' : 'Sin sesion'}</p>
          <p className="mt-1 text-sm text-slate-600">{getUsageCopy(usage)}</p>
        </div>
        {!authenticated ? (
          <button className="button-primary w-full" type="button" onClick={() => { onClose(); onLogin(); }}>Entrar</button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="button-primary" type="button" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              <CreditCard size={16} /> Mejorar
            </button>
            <button className="button-secondary" type="button" onClick={() => portal.mutate()} disabled={portal.isPending}>
              Billing
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AiDialog(props: { markdown: string; usage?: Usage | null; authenticated: boolean; onApply: (markdown: string) => void; onClose: () => void }) {
  return (
    <Modal title="Asistente de IA" onClose={props.onClose}>
      <AiPanel {...props} />
    </Modal>
  );
}

function LinkedInDialog({ onApply, onClose }: { onApply: (markdown: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.importLinkedIn(text),
    onSuccess: (payload) => {
      onApply(payload.markdown);
      queryClient.invalidateQueries({ queryKey: ['session'] });
      onClose();
    }
  });

  return (
    <Modal title="Importar LinkedIn" onClose={onClose}>
      <label className="block">
        <span className="label">Texto del perfil</span>
        <textarea className="field mt-1 min-h-52" value={text} onChange={(event) => setText(event.target.value)} placeholder="Pega aqui el texto de tu perfil..." />
      </label>
      {mutation.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{getErrorMessage(mutation.error)}</div> : null}
      <button className="button-primary mt-4 w-full" type="button" disabled={!text.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        Procesar perfil
      </button>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-xl border border-line bg-white p-5 shadow-calm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-slate-50 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${value === option.value ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SideMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-ink';
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-slate-50 p-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{copy}</p>
    </div>
  );
}
