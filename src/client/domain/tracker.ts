import type { CvStatus, CvSummary } from '../api/client';

export const statusLabels: Record<CvStatus, string> = {
  draft: 'Preparando',
  applied: 'Aplicado',
  interview: 'Entrevista',
  offer: 'Oferta',
  rejected: 'Descartado',
  archived: 'Archivado'
};

export const statusOrder: CvStatus[] = ['draft', 'applied', 'interview', 'offer', 'rejected', 'archived'];

export type TrackerColumn = {
  status: CvStatus;
  label: string;
  items: CvSummary[];
};

export function groupCvsByStatus(items: CvSummary[] = []): TrackerColumn[] {
  return statusOrder.map((status) => ({
    status,
    label: statusLabels[status],
    items: items.filter((item) => item.status === status)
  }));
}

export function getTrackerSummary(items: CvSummary[] = []) {
  const active = items.filter((item) => item.status !== 'archived' && item.status !== 'rejected').length;
  const interviews = items.filter((item) => item.status === 'interview').length;
  const offers = items.filter((item) => item.status === 'offer').length;

  return {
    total: items.length,
    active,
    interviews,
    offers
  };
}
