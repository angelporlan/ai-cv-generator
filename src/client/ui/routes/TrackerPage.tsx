import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../../api/client';
import { getTrackerSummary, groupCvsByStatus } from '../../domain/tracker';
import { EmptyState, LoadingColumns, SideMetric } from '../components/common';
import { useSession } from '../hooks';

export function TrackerPage() {
  const session = useSession();
  const authenticated = Boolean(session.data?.authenticated);
  const query = useQuery({
    queryKey: ['cvs', 'tracker'],
    queryFn: () => api.listCvs({}),
    enabled: authenticated
  });
  const columns = useMemo(() => groupCvsByStatus(query.data?.items || []), [query.data]);
  const summary = useMemo(() => getTrackerSummary(query.data?.items || []), [query.data]);

  return (
    <section className="panel">
      <div className="border-b border-line pb-4">
        <p className="eyebrow">Tracker</p>
        <h1 className="text-2xl font-semibold">Seguimiento de candidaturas</h1>
        <p className="mt-1 text-sm text-slate-600">Una vista tranquila para ordenar oportunidades sin convertir la app en un CRM pesado.</p>
      </div>
      {!authenticated ? (
        <EmptyState
          title="Entra para activar el tracker"
          copy="El tablero se construye a partir de tus CVs guardados y sus estados de candidatura."
        />
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SideMetric label="Total" value={String(summary.total)} />
            <SideMetric label="Activas" value={String(summary.active)} tone="good" />
            <SideMetric label="Entrevistas" value={String(summary.interviews)} />
            <SideMetric label="Ofertas" value={String(summary.offers)} tone="good" />
          </div>
          <div className="mt-4 grid gap-3 overflow-x-auto lg:grid-cols-6">
            {query.isLoading ? <LoadingColumns /> : null}
            {!query.isLoading && columns.map((column) => (
              <div className="min-h-96 min-w-56 rounded-lg border border-line bg-slate-50 p-3" key={column.status}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{column.label}</h2>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{column.items.length}</span>
                </div>
                <div className="space-y-2">
                  {column.items.map((cv) => (
                    <div className="rounded-lg border border-line bg-white p-3" key={cv.id}>
                      <p className="text-sm font-semibold">{cv.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{cv.description || cv.jobUrl || 'Candidatura sin notas'}</p>
                    </div>
                  ))}
                  {!column.items.length ? <p className="rounded-lg border border-dashed border-line bg-white p-3 text-xs text-slate-400">Sin candidaturas</p> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
