import type {
  ApiStatus,
  ComponentMatch,
  Document,
  ExtractedField,
  Finding,
  Project,
  ProcessingJob,
  ProjectSummary,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers:
      options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...options.headers }
        : options.headers,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      // ignore - no JSON body
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) }
}

export const api = {
  status: () => request<ApiStatus>('/api/status'),

  authMe: () => request<{ authenticated: boolean; auth_enabled: boolean }>('/api/auth/me'),
  authLogin: (password: string) =>
    request<{ authenticated: boolean; auth_enabled: boolean }>('/api/auth/login', json({ password })),
  authLogout: () => request<{ authenticated: boolean }>('/api/auth/logout', { method: 'POST' }),

  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, description?: string) =>
    request<Project>('/api/projects', json({ name, description })),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  projectSummary: (id: string) => request<ProjectSummary>(`/api/projects/${id}/summary`),
  updateProject: (id: string, body: Partial<Pick<Project, 'name' | 'description' | 'require_maintenance_release_for_status_sheets'>>) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (id: string) => request<{ deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  listDocuments: (projectId: string) => request<Document[]>(`/api/projects/${projectId}/documents`),
  uploadDocument: (projectId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Document>(`/api/projects/${projectId}/documents`, { method: 'POST', body: form })
  },
  getDocument: (id: string) => request<Document>(`/api/documents/${id}`),
  documentFileUrl: (id: string) => `/api/documents/${id}/file`,
  updateDocumentCategory: (id: string, document_category: string) =>
    request<Document>(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ document_category }) }),
  deleteDocument: (id: string) => request<{ deleted: boolean }>(`/api/documents/${id}`, { method: 'DELETE' }),

  createJob: (documentId: string, body: { mode: string; page_start: number; page_end: number; force?: boolean }) =>
    request<ProcessingJob>(`/api/documents/${documentId}/jobs`, json(body)),
  listJobs: (documentId: string) => request<ProcessingJob[]>(`/api/documents/${documentId}/jobs`),
  getJob: (id: string) => request<ProcessingJob>(`/api/jobs/${id}`),
  cancelJob: (id: string) => request<ProcessingJob>(`/api/jobs/${id}/cancel`, { method: 'POST' }),

  listFields: (documentId: string) => request<ExtractedField[]>(`/api/documents/${documentId}/fields`),
  correctField: (id: string, corrected_value: string | null, corrected_note?: string) =>
    request<ExtractedField>(`/api/fields/${id}/correct`, {
      method: 'PATCH',
      body: JSON.stringify({ corrected_value, corrected_note }),
    }),
  confirmField: (id: string) => request<ExtractedField>(`/api/fields/${id}/confirm`, { method: 'PATCH' }),
  flagFieldUnreadable: (id: string, corrected_note?: string) =>
    request<ExtractedField>(`/api/fields/${id}/flag-unreadable`, {
      method: 'PATCH',
      body: JSON.stringify({ corrected_note }),
    }),

  listMatches: (projectId: string) => request<ComponentMatch[]>(`/api/projects/${projectId}/matches`),
  decideMatch: (id: string, status: 'confirmed' | 'rejected', reviewer_note?: string) =>
    request<ComponentMatch>(`/api/matches/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewer_note }) }),

  listFindings: (projectId: string, filters?: { status?: string; severity?: string; rule_id?: string }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.severity) params.set('severity', filters.severity)
    if (filters?.rule_id) params.set('rule_id', filters.rule_id)
    const qs = params.toString()
    return request<Finding[]>(`/api/projects/${projectId}/findings${qs ? `?${qs}` : ''}`)
  },
  getFinding: (id: string) => request<Finding>(`/api/findings/${id}`),
  decideFinding: (id: string, status: string, reviewer_note?: string) =>
    request<Finding>(`/api/findings/${id}`, { method: 'PATCH', body: JSON.stringify({ status, reviewer_note }) }),
  rerunRules: (projectId: string) =>
    request<{ id: string; rule_ids_executed: string[]; rule_ids_skipped: string[]; findings_created: number }>(
      `/api/projects/${projectId}/rules/run`,
      { method: 'POST' },
    ),

  exportCsvUrl: (projectId: string) => `/api/projects/${projectId}/export.csv`,
  exportPdfUrl: (projectId: string, includeDismissed: boolean) =>
    `/api/projects/${projectId}/export.pdf?include_dismissed=${includeDismissed}`,
}
