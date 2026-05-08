// In production, use relative /api path. In dev, use localhost:3001
const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

async function fetchApi(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Send cookies for JWT auth
    ...options,
  };

  const response = await fetch(url, config);

  // Handle 401 - redirect to login
  if (response.status === 401) {
    // Only redirect if we're not already on the login page and not checking /auth/me
    if (!endpoint.includes('/auth/me') && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    const error = await response.json().catch(() => ({ message: 'Authentication required' }));
    throw new Error(error.error || error.message || 'Authentication required');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.error || error.message || 'API request failed');
  }

  // Handle CSV download
  if (response.headers.get('content-type')?.includes('text/csv')) {
    return response.blob();
  }

  return response.json();
}

// ============================================================
// Auth
// ============================================================
export const loginUser = (username, password) => fetchApi('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password }),
});

export const logoutUser = () => fetchApi('/auth/logout', { method: 'POST' });

export const getCurrentUser = () => fetchApi('/auth/me');

export const changePassword = (current_password, new_password) => fetchApi('/auth/change-password', {
  method: 'PUT',
  body: JSON.stringify({ current_password, new_password }),
});

// ============================================================
// Users (admin only)
// ============================================================
export const getUsers = () => fetchApi('/users');

export const createUser = (data) => fetchApi('/users', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const updateUser = (id, data) => fetchApi(`/users/${id}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});

export const resetUserPassword = (id) => fetchApi(`/users/${id}/reset-password`, {
  method: 'PUT',
});

// ============================================================
// Leads
// ============================================================
export const getLeads = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return fetchApi(`/leads${query ? '?' + query : ''}`);
};

export const getLead = (id) => fetchApi(`/leads/${id}`);

export const createLead = (data) => fetchApi('/leads', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const updateLead = (id, data) => fetchApi(`/leads/${id}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});

export const deleteLead = (id) => fetchApi(`/leads/${id}`, {
  method: 'DELETE',
});

export const importLeads = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE}/leads/import`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Authentication required');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Import failed');
  }
  return response.json();
};

export const exportLeads = () => fetchApi('/leads/export/csv');

// Phase 3: Outreach Queue, Calls, Emails (Instantly), and Scraper APIs were
// removed along with their backend routes. Apollo email status now lives on
// leads.email_status; Phase 7 will rebuild Email Hub around Apollo.

// Stats
export const getStatsOverview = () => fetchApi('/stats/overview');
export const getStatsDaily = () => fetchApi('/stats/daily');

// Settings
export const getSettings = () => fetchApi('/settings');
export const updateSettings = (data) => fetchApi('/settings', {
  method: 'PUT',
  body: JSON.stringify(data),
});

// Recordings
export const uploadRecording = async (leadId, audioBlob, filename) => {
  const formData = new FormData();
  formData.append('lead_id', leadId);
  formData.append('audio', audioBlob, filename || `call_${leadId}_${Date.now()}.webm`);
  const response = await fetch(`${API_BASE}/recordings/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Authentication required');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Upload failed');
  }
  return response.json();
};

export const getRecording = (id) => fetchApi(`/recordings/${id}`);

export const getLeadRecordings = (leadId) => fetchApi(`/recordings/lead/${leadId}`);

export const getAllRecordings = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return fetchApi(`/recordings${query ? '?' + query : ''}`);
};

export const getRecordingStats = () => fetchApi('/recordings/stats/overview');

export const getRecordingTrends = () => fetchApi('/recordings/analysis/trends');

export const generateCoachingReport = () => fetchApi('/recordings/coaching', {
  method: 'POST',
});

export const applyAISuggestions = (recordingId) => fetchApi(`/recordings/${recordingId}/apply-suggestions`, {
  method: 'POST',
});

export const reanalyzeRecording = (recordingId) => fetchApi(`/recordings/${recordingId}/reanalyze`, {
  method: 'POST',
});

// Calendar
export const getCalendarEvents = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return fetchApi(`/calendar${query ? '?' + query : ''}`);
};

export const getCalendarEvent = (id) => fetchApi(`/calendar/${id}`);

export const createCalendarEvent = (data) => fetchApi('/calendar', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const updateCalendarEvent = (id, data) => fetchApi(`/calendar/${id}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});

export const completeCalendarEvent = (id) => fetchApi(`/calendar/${id}/complete`, {
  method: 'PUT',
});

export const cancelCalendarEvent = (id) => fetchApi(`/calendar/${id}/cancel`, {
  method: 'PUT',
});

export const getTodayEvents = () => fetchApi('/calendar/today');

export const getUpcomingEvents = () => fetchApi('/calendar/upcoming');

// Google Calendar
export const getGoogleCalendarAuthUrl = () => fetchApi('/calendar/google/auth');
export const getGoogleCalendarStatus = () => fetchApi('/calendar/google/status');
export const disconnectGoogleCalendar = () => fetchApi('/calendar/google/disconnect', { method: 'POST' });
export const getGoogleCalendars = () => fetchApi('/calendar/google/calendars');
export const syncAllToGoogle = () => fetchApi('/calendar/google/sync-all', { method: 'POST' });

// Rescore
export const rescoreAllLeads = () => fetchApi('/leads/rescore', { method: 'POST' });
export const scoreAllLeads = () => fetchApi('/leads/score-all', { method: 'POST' });

// ============================================================
// Apollo Enrichment
// ============================================================
export const enrichLead = (leadId) => fetchApi(`/apollo/enrich/${leadId}`, { method: 'POST' });

export const enrichBulk = (data) => fetchApi('/apollo/enrich-bulk', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const getEnrichBulkStatus = () => fetchApi('/apollo/enrich-bulk/status');

export const getApolloStatus = () => fetchApi('/apollo/status');

// ============================================================
// Apollo Sequences (Phase 5)
// ============================================================
export const getApolloSequences = () => fetchApi('/apollo/sequences');

export const pushToApolloSequence = (leadIds, sequenceId) => fetchApi('/apollo/push-sequence', {
  method: 'POST',
  body: JSON.stringify({ leadIds, sequenceId }),
});

// Phase 3: Instantly Campaign Push helpers were removed along with the
// /api/instantly backend routes. These stubs remain only for any legacy
// import sites still being migrated; the Pipeline page now uses Apollo.
export const getInstantlyCampaigns = async () => ({ data: [] });
export const pushToInstantly = async () => ({ pushed: 0, errors: [] });
export const pushFilteredToInstantly = async () => ({ pushed: 0, errors: [] });
export const syncInstantlyStatuses = async () => ({ synced: 0, updated: 0 });
