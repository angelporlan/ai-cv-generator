import { useMutation, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type CvSummary } from '../../api/client';
import type { VisualTemplate } from '../../domain/design';
import { statusLabels, statusOrder } from '../../domain/tracker';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { EmptyState, LoadingCards } from '../components/common';
import { useSession } from '../hooks';

export function LibraryPage() {
  const session = useSession();
  const authenticated = Boolean(session.data?.authenticated);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const deferredSearch = useDeferredValue(search);
  const query = useQuery({
    queryKey: ['cvs', deferredSearch, status],
    queryFn: () => api.listCvs({ search: deferredSearch, status }),
    enabled: authenticated
  });
  const navigate = useNavigate();
  const { setMarkdown, setSelectedCvId, setDesign } = useWorkspaceStore();
  const loadCv = useMutation({
    mutationFn: (id: number) => api.getCv(id),
    onSuccess: (payload) => {
      setMarkdown(payload.cv.content);
      setSelectedCvId(payload.cv.id);
      if (payload.cv.template) {
        setDesign({ template: payload.cv.template as VisualTemplate });
      }
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
      {!authenticated ? (
        <EmptyState
          title="Entra para ver tu biblioteca"
          copy="Tus CVs guardados viven en tu cuenta. Puedes seguir editando en local desde el editor."
          actionLabel="Ir al editor"
          onAction={() => navigate('/')}
        />
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {query.isLoading ? <LoadingCards /> : null}
          {query.data?.items.map((cv) => (
            <CvCard key={cv.id} cv={cv} onOpen={() => loadCv.mutate(cv.id)} />
          ))}
          {!query.isLoading && !query.data?.items.length ? <EmptyState title="Sin CVs guardados" copy="Guarda tu primer CV desde el editor para verlo aqui." /> : null}
        </div>
      )}
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
