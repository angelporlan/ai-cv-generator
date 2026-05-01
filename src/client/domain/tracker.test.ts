import { describe, expect, it } from 'vitest';
import { getJobTrackerSummary, getTrackerSummary, groupCvsByStatus, groupJobsByStatus, statusOrder } from './tracker';
import type { CvSummary, JobApplication } from '../api/client';

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

function job(id: number, status: JobApplication['status']): JobApplication {
  return {
    id: String(id),
    cvId: null,
    status,
    company: `Company ${id}`,
    role: `Role ${id}`,
    jobUrl: '',
    salary: '',
    contact: '',
    notes: '',
    deadlineDate: null,
    createdAt: '',
    updatedAt: ''
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

  it('groups richer job applications by status', () => {
    const columns = groupJobsByStatus([job(1, 'applied'), job(2, 'offer')]);
    expect(columns.find((column) => column.status === 'applied')?.items[0].company).toBe('Company 1');
    expect(columns.find((column) => column.status === 'offer')?.items[0].role).toBe('Role 2');
  });

  it('summarizes richer job applications', () => {
    expect(getJobTrackerSummary([
      job(1, 'applied'),
      job(2, 'interview'),
      job(3, 'archived')
    ])).toEqual({
      total: 3,
      active: 2,
      interviews: 1,
      offers: 0
    });
  });
});
