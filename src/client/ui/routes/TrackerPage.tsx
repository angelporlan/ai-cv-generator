import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, type CvStatus, type JobApplication } from '../../api/client';
import { getJobTrackerSummary, groupJobsByStatus, statusLabels, statusOrder } from '../../domain/tracker';
import { EmptyState, LoadingColumns, SideMetric } from '../components/common';
import { getErrorMessage, useSession } from '../hooks';

export function TrackerPage() {
  const session = useSession();
  const authenticated = Boolean(session.data?.authenticated);
  const queryClient = useQueryClient();
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<CvStatus>('draft');
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.listJobs({}),
    enabled: authenticated
  });
  const columns = useMemo(() => groupJobsByStatus(query.data?.items || []), [query.data]);
  const summary = useMemo(() => getJobTrackerSummary(query.data?.items || []), [query.data]);
  const createJob = useMutation({
    mutationFn: () => api.createJob({ company, role, status, jobUrl, notes }),
    onSuccess: () => {
      setCompany('');
      setRole('');
      setJobUrl('');
      setNotes('');
      setStatus('draft');
      setNotice('Candidatura creada');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });
  const updateJob = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<JobApplication> }) => api.updateJob(id, input),
    onSuccess: () => {
      setNotice('Candidatura actualizada');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });
  const deleteJob = useMutation({
    mutationFn: (id: string) => api.deleteJob(id),
    onSuccess: () => {
      setNotice('Candidatura eliminada');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setNotice(getErrorMessage(error))
  });

  return (
    <section className="panel">
      <div className="border-b border-line pb-4">
        <p className="eyebrow">Tracker</p>
        <h1 className="text-2xl font-semibold">Seguimiento de candidaturas</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Una vista tranquila para ordenar oportunidades sin convertir la app en un CRM pesado.</p>
      </div>
      {!authenticated ? (
        <EmptyState
          title="Entra para activar el tracker"
          copy="El tablero se construye a partir de tus CVs guardados y sus estados de candidatura."
        />
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-line bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_150px_auto]">
              <input className="field h-10" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Empresa" />
              <input className="field h-10" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Rol" />
              <select className="field h-10" value={status} onChange={(event) => setStatus(event.target.value as CvStatus)}>
                {statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}
              </select>
              <button className="button-primary" type="button" disabled={!company.trim() || !role.trim() || createJob.isPending} onClick={() => createJob.mutate()}>
                <Plus size={16} /> Añadir
              </button>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_2fr]">
              <input className="field h-10" value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} placeholder="URL de la oferta" />
              <input className="field h-10" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas rapidas" />
            </div>
            {notice ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{notice}</p> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SideMetric label="Total" value={String(summary.total)} />
            <SideMetric label="Activas" value={String(summary.active)} tone="good" />
            <SideMetric label="Entrevistas" value={String(summary.interviews)} />
            <SideMetric label="Ofertas" value={String(summary.offers)} tone="good" />
          </div>
          <div className="mt-4 grid gap-3 overflow-x-auto lg:grid-cols-6">
            {query.isLoading ? <LoadingColumns /> : null}
            {!query.isLoading && columns.map((column) => (
              <div className="min-h-96 min-w-56 rounded-lg border border-line bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950" key={column.status}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{column.label}</h2>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">{column.items.length}</span>
                </div>
                <div className="space-y-2">
                  {column.items.map((job) => (
                    <div className="rounded-lg border border-line bg-white p-3 dark:border-slate-800 dark:bg-slate-900" key={job.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{job.company}</p>
                          <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">{job.role}</p>
                        </div>
                        <button
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-300"
                          type="button"
                          aria-label="Eliminar candidatura"
                          disabled={deleteJob.isPending}
                          onClick={() => deleteJob.mutate(job.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{job.notes || job.contact || 'Candidatura sin notas'}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          className="field h-8 flex-1 py-1 text-xs"
                          value={job.status}
                          disabled={updateJob.isPending}
                          onChange={(event) => updateJob.mutate({ id: job.id, input: { status: event.target.value as CvStatus } })}
                        >
                          {statusOrder.map((item) => <option value={item} key={item}>{statusLabels[item]}</option>)}
                        </select>
                        {job.jobUrl ? (
                          <a
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                            href={job.jobUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Abrir oferta"
                          >
                            <ExternalLink size={14} />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {!column.items.length ? <p className="rounded-lg border border-dashed border-line bg-white p-3 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">Sin candidaturas</p> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
