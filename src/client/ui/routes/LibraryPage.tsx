import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Cv, type CvStatus, type CvSummary } from '../../api/client';
import type { VisualTemplate } from '../../domain/design';
import { statusLabels, statusOrder } from '../../domain/tracker';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { EmptyState, LoadingCards, Modal } from '../components/common';
import { getErrorMessage, useSession } from '../hooks';

type LibraryDraft = {
  name: string;
  status: CvStatus;
  description: string;
  jobUrl: string;
  lastUsedDate: string;
  template: string;
};

export function LibraryPage() {
  const session = useSession();
  const authenticated = Boolean(session.data?.authenticated);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { markdown, selectedCvId, setMarkdown, setSelectedCvId, setDesign } = useWorkspaceStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Cv | null>(null);
  const [draft, setDraft] = useState<LibraryDraft | null>(null);
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CvSummary | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const query = useQuery({
    queryKey: ['cvs', deferredSearch, status],
    queryFn: () => api.listCvs({ search: deferredSearch, status }),
    enabled: authenticated
  });

  const items = query.data?.items || [];
  const selectedCv = useMemo(
    () => items.find((cv) => cv.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      setSelectedDetail(null);
      setDraft(null);
      return;
    }

    const nextSelected = selectedCv && items.some((cv) => cv.id === selectedCv.id) ? selectedCv : items[0];
    if (nextSelected && nextSelected.id !== selectedId) {
      setSelectedId(nextSelected.id);
    }
  }, [items, selectedCv, selectedId]);

  useEffect(() => {
    if (!selectedCv) {
      setSelectedDetail(null);
      setDraft(null);
      return;
    }

    setDraft(createDraft(selectedCv));
  }, [selectedCv]);

  const viewCv = useMutation({
    mutationFn: (id: number) => api.getCv(id),
    onSuccess: (payload) => {
      setSelectedDetail(payload.cv);
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  useEffect(() => {
    if (!selectedCv || selectedDetail?.id === selectedCv.id) return;
    viewCv.mutate(selectedCv.id);
  }, [selectedCv, selectedDetail, viewCv]);

  const loadCv = useMutation({
    mutationFn: (id: number) => api.getCv(id),
    onSuccess: (payload) => {
      setSelectedDetail(payload.cv);
      setMarkdown(payload.cv.content);
      setSelectedCvId(payload.cv.id);
      if (payload.cv.template) {
        setDesign({ template: payload.cv.template as VisualTemplate });
      }
      setNotice(`CV "${payload.cv.name}" cargado en el editor`);
      navigate('/');
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  const updateCv = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<Cv> }) => api.updateCv(id, input),
    onSuccess: async (payload) => {
      setNotice('CV actualizado');
      setDraft(createDraft(payload.cv));
      await queryClient.invalidateQueries({ queryKey: ['cvs'] });
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  const createVersion = useMutation({
    mutationFn: ({ input }: { input: Partial<Cv> }) => api.createCv(input),
    onSuccess: async (payload) => {
      setNotice(`Nueva versión creada: ${payload.cv.name}`);
      await queryClient.invalidateQueries({ queryKey: ['cvs'] });
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  const deleteCv = useMutation({
    mutationFn: (id: number) => api.deleteCv(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      if (deleteTarget?.id === selectedId) {
        setSelectedId(null);
        setDraft(null);
      }
      setNotice('CV eliminado');
      await queryClient.invalidateQueries({ queryKey: ['cvs'] });
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  const currentContent = selectedCv
    ? selectedDetail?.id === selectedCv.id
      ? selectedDetail.content
      : selectedCvId === selectedCv.id
        ? markdown
        : ''
    : '';

  const handleSaveMetadata = () => {
    if (!selectedCv || !draft) return;
    updateCv.mutate({
      id: selectedCv.id,
      input: {
        name: draft.name.trim() || selectedCv.name,
        status: draft.status,
        description: draft.description.trim(),
        jobUrl: draft.jobUrl.trim(),
        lastUsedDate: draft.lastUsedDate || null,
        template: draft.template,
        content: currentContent
      }
    });
  };

  const handleSaveCurrentDraft = () => {
    if (!selectedCv || !draft) return;
    updateCv.mutate({
      id: selectedCv.id,
      input: {
        name: draft.name.trim() || selectedCv.name,
        status: draft.status,
        description: draft.description.trim(),
        jobUrl: draft.jobUrl.trim(),
        lastUsedDate: draft.lastUsedDate || null,
        template: draft.template,
        content: markdown
      }
    });
  };

  const handleSaveVersion = () => {
    if (!selectedCv || !draft) return;
    createVersion.mutate({
      input: {
        name: uniqueCopyName(draft.name.trim() || selectedCv.name, items),
        status: draft.status,
        description: draft.description.trim(),
        jobUrl: draft.jobUrl.trim(),
        lastUsedDate: draft.lastUsedDate || null,
        template: draft.template,
        content: currentContent
      }
    });
  };

  return (
    <section className="panel">
      <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Biblioteca</p>
          <h1 className="text-2xl font-semibold">CVs guardados</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Gestiona versiones, metadata y el contenido activo de tus CVs desde un solo lugar.</p>
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

      {!authenticated ? (
        <EmptyState
          title="Entra para ver tu biblioteca"
          copy="Tus CVs guardados viven en tu cuenta. Puedes seguir editando en local desde el editor."
          actionLabel="Ir al editor"
          onAction={() => navigate('/')}
        />
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            {notice ? (
              <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-100">
                {notice}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {query.isLoading ? <LoadingCards /> : null}
              {query.data?.items.map((cv) => (
                <LibraryCard
                  key={cv.id}
                  cv={cv}
                  active={selectedCv?.id === cv.id}
                  onSelect={() => {
                    setSelectedId(cv.id);
                    viewCv.mutate(cv.id);
                  }}
                  onOpenEditor={() => loadCv.mutate(cv.id)}
                  onDelete={() => setDeleteTarget(cv)}
                />
              ))}
              {!query.isLoading && !items.length ? (
                <EmptyState title="Sin CVs guardados" copy="Guarda tu primer CV desde el editor para verlo aqui." />
              ) : null}
            </div>
          </div>

          <aside className="rounded-xl border border-line bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {selectedCv && draft ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">Detalle</p>
                    <h2 className="truncate text-xl font-semibold">{selectedCv.name}</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedCv.description || 'Sin descripcion'}</p>
                  </div>
                  <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{statusLabels[selectedCv.status]}</span>
                </div>

                <div className="grid gap-3">
                  <label className="block">
                    <span className="label">Nombre</span>
                    <input className="field mt-1" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Estado</span>
                    <select className="field mt-1" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CvStatus })}>
                      {statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Descripción</span>
                    <textarea className="field mt-1 min-h-24" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">URL de oferta</span>
                    <input className="field mt-1" value={draft.jobUrl} onChange={(event) => setDraft({ ...draft, jobUrl: event.target.value })} placeholder="https://..." />
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <ExternalLink size={13} className="shrink-0" />
                      {draft.jobUrl ? (
                        <a className="truncate font-semibold text-slate-700 hover:text-ink dark:text-slate-200 dark:hover:text-white" href={draft.jobUrl} target="_blank" rel="noreferrer">
                          {getJobSourceLabel(draft.jobUrl)}
                        </a>
                      ) : (
                        <span>enlace a la oferta</span>
                      )}
                    </div>
                  </label>
                  <label className="block">
                    <span className="label">Fecha de uso</span>
                    <input className="field mt-1" type="date" value={draft.lastUsedDate} onChange={(event) => setDraft({ ...draft, lastUsedDate: event.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Plantilla</span>
                    <select className="field mt-1" value={draft.template} onChange={(event) => setDraft({ ...draft, template: event.target.value })}>
                      {visualTemplateOptions.map((template) => <option value={template.value} key={template.value}>{template.label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="space-y-2 rounded-lg border border-line bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Contenido</p>
                    <button className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-ink dark:text-slate-300 dark:hover:text-white" type="button" onClick={() => loadCv.mutate(selectedCv.id)} disabled={loadCv.isPending}>
                      <RefreshCcw size={13} /> Abrir en editor
                    </button>
                  </div>
                    <p className="text-xs leading-5 text-slate-500 line-clamp-5 dark:text-slate-400">{currentContent || 'Sin contenido cargado'}</p>
                  </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="button-secondary" type="button" onClick={handleSaveMetadata} disabled={updateCv.isPending}>
                    {updateCv.isPending ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                    Guardar cambios
                  </button>
                  <button className="button-secondary" type="button" onClick={handleSaveCurrentDraft} disabled={updateCv.isPending || selectedCvId !== selectedCv.id}>
                    <FileDown size={15} />
                    Actualizar con borrador
                  </button>
                  <button className="button-primary sm:col-span-2" type="button" onClick={handleSaveVersion} disabled={createVersion.isPending}>
                    {createVersion.isPending ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                    Guardar nueva versión
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="button-secondary" type="button" onClick={() => loadCv.mutate(selectedCv.id)} disabled={loadCv.isPending}>
                    <FileText size={15} />
                    Abrir en editor
                  </button>
                  <button className="button-secondary" type="button" onClick={() => setDeleteTarget(selectedCv)}>
                    <Trash2 size={15} />
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center text-center">
                <div className="max-w-sm">
                  <p className="text-lg font-semibold">Selecciona un CV</p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Abre una tarjeta para editar metadata, abrir el contenido o guardar una nueva versión.</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {deleteTarget ? (
        <Modal
          title="Eliminar CV"
          onClose={() => setDeleteTarget(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Vas a eliminar <strong>{deleteTarget.name}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button className="button-secondary" type="button" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button className="button-primary" type="button" disabled={deleteCv.isPending} onClick={() => deleteCv.mutate(deleteTarget.id)}>
                {deleteCv.isPending ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                Eliminar
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function LibraryCard({
  cv,
  active,
  onSelect,
  onOpenEditor,
  onDelete
}: {
  cv: CvSummary;
  active: boolean;
  onSelect: () => void;
  onOpenEditor: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`card-button flex h-full flex-col gap-4 text-left ${active ? 'border-slate-400 shadow-calm dark:border-cyan-400/60' : ''}`}>
      <button className="text-left" type="button" onClick={onSelect}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{cv.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{cv.description || 'Sin descripcion'}</p>
          </div>
          <span className="rounded-full border border-line bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">{statusLabels[cv.status]}</span>
        </div>
        <div className="mt-4 grid gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p className="flex items-center gap-2">
            <ExternalLink size={13} />
            {cv.jobUrl ? (
              <a className="font-semibold text-slate-700 hover:text-ink dark:text-slate-200 dark:hover:text-white" href={cv.jobUrl} target="_blank" rel="noreferrer">
                {getJobSourceLabel(cv.jobUrl)}
              </a>
            ) : (
              <span>Sin oferta asociada</span>
            )}
          </p>
          <p>Ultimo uso: {formatDate(cv.lastUsedDate)}</p>
        </div>
      </button>
      <div className="mt-auto flex flex-wrap gap-2">
        <button className="button-secondary flex-1" type="button" onClick={onSelect}>
          <PencilLine size={15} />
          Editar
        </button>
        <button className="button-secondary flex-1" type="button" onClick={onOpenEditor}>
          <ArrowRight size={15} />
          Abrir
        </button>
        <button className="icon-button shrink-0" type="button" onClick={onDelete} aria-label={`Eliminar ${cv.name}`}>
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function createDraft(cv: CvSummary): LibraryDraft {
  return {
    name: cv.name,
    status: cv.status,
    description: cv.description || '',
    jobUrl: cv.jobUrl || '',
    lastUsedDate: toDateInputValue(cv.lastUsedDate),
    template: cv.template || 'harvard'
  };
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(date);
}

const visualTemplateOptions: Array<{ value: string; label: string }> = [
  { value: 'harvard', label: 'Clasico' },
  { value: 'modern', label: 'Moderno' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'creative', label: 'Creativo' },
  { value: 'swiss', label: 'Swiss' }
];

function uniqueCopyName(baseName: string, items: CvSummary[]) {
  const names = new Set(items.map((item) => item.name.trim().toLowerCase()));
  if (!names.has(baseName.trim().toLowerCase())) {
    return baseName;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseName} v${index}`;
    if (!names.has(candidate.trim().toLowerCase())) {
      return candidate;
    }
  }

  return `${baseName} copy`;
}

function getJobSourceLabel(jobUrl: string) {
  const normalized = jobUrl.toLowerCase();
  if (normalized.includes('linkedin.com')) return 'LinkedIn';
  if (normalized.includes('infojobs')) return 'InfoJobs';
  if (normalized.includes('indeed.com')) return 'Indeed';
  if (normalized.includes('glassdoor.com')) return 'Glassdoor';
  if (normalized.includes('computrabajo.com')) return 'Computrabajo';
  if (normalized.includes('jobtoday.com')) return 'Job Today';
  if (normalized.includes('lever.co')) return 'Lever';
  if (normalized.includes('greenhouse.io')) return 'Greenhouse';
  if (normalized.includes('teamtailor.com')) return 'Teamtailor';

  try {
    const host = new URL(jobUrl).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('linkedin.com')) return 'LinkedIn';
    if (host.includes('infojobs')) return 'InfoJobs';
    if (host.includes('indeed.com')) return 'Indeed';
    if (host.includes('glassdoor.com')) return 'Glassdoor';
    if (host.includes('computrabajo.com')) return 'Computrabajo';
    if (host.includes('jobtoday.com')) return 'Job Today';
    if (host.includes('lever.co')) return 'Lever';
    if (host.includes('greenhouse.io')) return 'Greenhouse';
    if (host.includes('teamtailor.com')) return 'Teamtailor';
  } catch {
    return 'enlace a la oferta';
  }

  return 'enlace a la oferta';
}
