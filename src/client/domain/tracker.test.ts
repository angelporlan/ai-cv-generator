import { describe, expect, it } from 'vitest';
import { getTrackerSummary, groupCvsByStatus, statusOrder } from './tracker';
import type { CvSummary } from '../api/client';

function cv(id: number, status: CvSummary['status']): CvSummary {
  return {
    id,
    status,
    name: `CV ${id}`,
    description: '',
    jobUrl: '',
    lastUsedDate: null,
    template: 'harvard'
  };
}

describe('tracker domain', () => {
  it('groups CVs into stable tracker columns', () => {
    const columns = groupCvsByStatus([cv(1, 'draft'), cv(2, 'interview'), cv(3, 'draft')]);

    expect(columns.map((column) => column.status)).toEqual(statusOrder);
    expect(columns.find((column) => column.status === 'draft')?.items).toHaveLength(2);
    expect(columns.find((column) => column.status === 'interview')?.items).toHaveLength(1);
  });

  it('summarizes active applications', () => {
    const summary = getTrackerSummary([
      cv(1, 'draft'),
      cv(2, 'interview'),
      cv(3, 'offer'),
      cv(4, 'rejected'),
      cv(5, 'archived')
    ]);

    expect(summary).toEqual({
      total: 5,
      active: 3,
      interviews: 1,
      offers: 1
    });
  });
});
