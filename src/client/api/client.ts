export type ApiErrorCode = 'auth_required' | 'subscription_required' | 'validation_error' | 'network_error' | 'server_error';

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  payload: unknown;

  constructor(message: string, code: ApiErrorCode, status: number, payload: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

export type User = {
  id: number;
  email: string;
};

export type Billing = {
  isActive: boolean;
  plan: 'free' | 'pro' | string;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
};

export type Usage = {
  used: number;
  limit: number;
  remaining: number | null;
  canUseAi: boolean;
  subscriptionStatus: string;
  billing: Billing;
  lastAction?: string | null;
  lastUsedAt?: string | null;
};

export type SessionPayload = {
  ok: boolean;
  authenticated: boolean;
  user?: User;
  usage?: Usage;
  state?: Record<string, string>;
};

export type CvStatus = 'draft' | 'applied' | 'interview' | 'offer' | 'rejected' | 'archived';

export type CvSummary = {
  id: number;
  name: string;
  status: CvStatus;
  description: string;
  jobUrl: string;
  lastUsedDate: string | null;
  template: string;
  updatedAt?: string;
  createdAt?: string;
};

export type Cv = CvSummary & {
  content: string;
};

export type CvListResponse = {
  ok: true;
  items: CvSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type AiActionPayload = {
  markdown: string;
  jobDescription?: string;
  model?: string;
  action: string;
};

export type AiActionResponse = {
  ok: true;
  markdown: string;
  model: string;
  usage: Usage;
};

export type AiArtifactDto = {
  id: string;
  action: string;
  title: string;
  content: string;
  model: string;
  createdAt: string;
};

export type JobApplication = {
  id: string;
  cvId: string | null;
  company: string;
  role: string;
  status: CvStatus;
  jobUrl: string;
  salary: string;
  contact: string;
  notes: string;
  deadlineDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  raw?: boolean;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: HeadersInit = {};
  let body: BodyInit | undefined;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'include',
      headers,
      body
    });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Network error', 'network_error', 0);
  }

  if (options.raw) {
    if (!response.ok) {
      throw new ApiError(response.statusText || 'Request failed', 'server_error', response.status);
    }
    return response as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const objectPayload = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
    const message = String(objectPayload.error || response.statusText || 'Request failed');
    const code: ApiErrorCode = objectPayload.requiresAuth
      ? 'auth_required'
      : objectPayload.requiresSubscription
        ? 'subscription_required'
        : response.status === 400
          ? 'validation_error'
          : 'server_error';
    throw new ApiError(message, code, response.status, payload);
  }

  return payload as T;
}

export const api = {
  getSession: () => request<SessionPayload>('/api/auth/session'),
  login: (email: string, password: string) => request<SessionPayload>('/api/auth/login', {
    method: 'POST',
    body: { email, password }
  }),
  register: (email: string, password: string) => request<SessionPayload>('/api/auth/register', {
    method: 'POST',
    body: { email, password }
  }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  getUsage: () => request<{ ok: true } & Usage>('/api/usage'),
  listCvs: (params: { page?: number; search?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    query.set('page', String(params.page || 1));
    query.set('limit', '80');
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    return request<CvListResponse>(`/api/cvs?${query.toString()}`);
  },
  getCv: (id: number) => request<{ ok: true; cv: Cv }>(`/api/cvs/${id}`),
  createCv: (input: Partial<Cv>) => request<{ ok: true; cv: Cv }>('/api/cvs', { method: 'POST', body: input }),
  updateCv: (id: number, input: Partial<Cv>) => request<{ ok: true; cv: Cv }>(`/api/cvs/${id}`, {
    method: 'PATCH',
    body: input
  }),
  deleteCv: (id: number) => request<{ ok: true }>(`/api/cvs/${id}`, { method: 'DELETE' }),
  loadSource: (file = 'cv.md') => request<string>(`/api/cv?file=${encodeURIComponent(file)}`),
  adaptCv: (payload: AiActionPayload) => request<AiActionResponse>('/api/adapt-cv', {
    method: 'POST',
    body: payload
  }),
  importLinkedIn: (linkedInText: string) => request<{ ok: true; markdown: string; model: string; usage: Usage }>(
    '/api/import-linkedin',
    { method: 'POST', body: { linkedInText } }
  ),
  listAiArtifacts: () => request<{ ok: true; items: AiArtifactDto[] }>('/api/ai-artifacts'),
  createAiArtifact: (input: Omit<AiArtifactDto, 'id' | 'createdAt'>) => request<{ ok: true; artifact: AiArtifactDto }>('/api/ai-artifacts', {
    method: 'POST',
    body: input
  }),
  clearAiArtifacts: () => request<{ ok: true }>('/api/ai-artifacts', { method: 'DELETE' }),
  listJobs: (params: { search?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<{ ok: true; items: JobApplication[] }>(`/api/jobs${suffix}`);
  },
  createJob: (input: Partial<JobApplication>) => request<{ ok: true; job: JobApplication }>('/api/jobs', {
    method: 'POST',
    body: input
  }),
  updateJob: (id: string, input: Partial<JobApplication>) => request<{ ok: true; job: JobApplication }>(`/api/jobs/${id}`, {
    method: 'PATCH',
    body: input
  }),
  deleteJob: (id: string) => request<{ ok: true }>(`/api/jobs/${id}`, { method: 'DELETE' }),
  previewPdf: (input: {
    markdown: string;
    download?: boolean;
    template?: string;
    accentColor?: string;
    fontFamily?: string;
    pageMargin?: number;
    showIcons?: boolean;
  }) => request<Response>('/api/preview.pdf', {
    method: 'POST',
    body: input,
    raw: true
  }),
  createCheckout: () => request<{ ok: true; url: string }>('/api/billing/checkout', { method: 'POST' }),
  createBillingPortal: () => request<{ ok: true; url: string }>('/api/billing/portal', { method: 'POST' })
};
