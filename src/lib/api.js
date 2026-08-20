/**
 * API client.
 *
 * Two things it does that a bare `fetch` wrapper would not:
 *
 *  1. **It always sends the site.** The backend refuses any request that does
 *     not say which database it means, and rightly so — Kolkata and Ahmedabad
 *     are different databases with different ItemIDs. Sending it here means no
 *     screen can forget.
 *  2. **It preserves the checks on a failure.** A 422 from an approve or post
 *     carries the specific validation codes that blocked it, and a UI that
 *     throws them away can only say "something went wrong".
 */

const BASE = import.meta.env.VITE_API_BASE || '';
const PREFIX = `${BASE}/api/supplier-portal`;

const TOKEN_KEY = 'sp.token';
const SITE_KEY = 'sp.site';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getSite() {
  return localStorage.getItem(SITE_KEY) || 'KOL';
}

export function setSite(site) {
  localStorage.setItem(SITE_KEY, site);
}

/** The plant a site implies. Both are shown in the UI, never merged. */
export function plantForSite(site = getSite()) {
  return site === 'AHM' ? 'AHMEDABAD' : 'KOLKATA';
}

/** An API failure that still carries the server's validation checks. */
export class ApiError extends Error {
  constructor(message, { status, checks, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.checks = checks || [];
    this.body = body;
  }
}

/**
 * True when a body came back from something other than the API.
 *
 * With `VITE_API_BASE` unset the app calls `/api/...` on its own static host,
 * where the SPA rewrite hands every unmatched path to index.html. The result is
 * a 200 carrying either the app's own HTML or, for a POST, nothing at all —
 * a "success" with no payload in it. Naming that here is the difference between
 * a message that points at the misconfiguration and a null dereference three
 * frames away.
 */
function notFromApi(text) {
  const head = String(text || '').trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

async function request(path, { method = 'GET', body, site, signal, raw = false, allowUnauthorized = false } = {}) {
  const headers = { 'X-SP-Site': site || getSite() };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${PREFIX}${path}`, {
      method,
      headers,
      signal,
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch (err) {
    // A rejected fetch is the browser refusing to make the request or failing
    // to reach it, and it says so in two words: "Load failed" in Safari,
    // "Failed to fetch" in Chrome. Neither names the host or the cause, and
    // both are indistinguishable from an application bug. Naming the URL turns
    // it into something a person can act on.
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(
      `Could not reach ${PREFIX}${path} (${err.message}). The backend may be down, `
      + 'still waking up, or refusing this origin — check that VITE_API_BASE points at it '
      + 'and that CORS allows this site.',
      { status: 0 },
    );
  }

  // An expired session should land the user on the sign-in screen rather than
  // showing a permission error they cannot act on. Signing in is the exception:
  // a 401 there means the credentials were wrong, and redirecting to the screen
  // the user is already looking at hides the server's reason for refusing them.
  if (response.status === 401 && !allowUnauthorized) {
    setToken(null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError('Your session has expired. Sign in again.', { status: 401 });
  }

  if (raw) return response;

  const text = await response.text();

  if ((response.ok && !text) || notFromApi(text)) {
    throw new ApiError(
      BASE
        ? `${PREFIX}${path} did not return API data. Check that ${BASE} is the backend origin and that it is running.`
        : 'The app is not pointed at a backend. Set VITE_API_BASE to the backend origin and redeploy — Vite reads it at build time.',
      { status: response.status },
    );
  }

  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }

  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status})`, {
      status: response.status,
      checks: payload?.checks,
      body: payload,
    });
  }

  return payload;
}

export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, body, opts) => request(path, { ...opts, method: 'DELETE', body }),
  raw: (path, opts) => request(path, { ...opts, raw: true }),
};

// ── Endpoint helpers ────────────────────────────────────────────────────────

export const auth = {
  login: (payload) => api.post('/auth/login', payload, { allowUnauthorized: true }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  setContext: (payload) => api.post('/auth/context', payload),
};

export const erp = {
  reference: () => api.get('/erp/reference'),
  warehouses: () => api.get('/erp/warehouses'),
  employeeLedgers: () => api.get('/erp/employee-ledgers'),
  chargeLedgers: () => api.get('/erp/charge-ledgers'),
  purchaseLedgers: () => api.get('/erp/purchase-ledgers'),
  supplierLedgers: () => api.get('/erp/supplier-ledgers'),
  users: () => api.get('/erp/users'),
};

export const suppliers = {
  list: () => api.get('/suppliers'),
  get: (id) => api.get(`/suppliers/${id}`),
  create: (payload) => api.post('/suppliers', payload),
  update: (id, payload) => api.patch(`/suppliers/${id}`, payload),
  /** Type-ahead over every supplier, for the confirmation screen. */
  search: (q) => api.get(`/suppliers/search${query({ q, limit: 20 })}`),
  /** Create a supplier for every ERP ledger that has none, and harvest GSTINs. */
  sync: () => api.post('/suppliers/reconcile', {}),
  /** Populate historicalItemGroupIds, which is what Tier 0 of matching narrows on. */
  refreshHistory: () => api.post('/suppliers/refresh-history', {}),
  merge: (payload) => api.post('/suppliers/merge', payload),
};

/**
 * Board rates, searched by grade and GSM band.
 *
 * Separate from `items` because board is not an item: a board quote names a
 * grade and a band, and one band covers many ItemIDs.
 */
export const boards = {
  grades: () => api.get('/boards/grades'),
  search: (params) => api.get(`/boards/search${query(params)}`),
};

export const quotes = {
  list: (params) => api.get(`/quotes${query(params)}`),
  get: (id) => api.get(`/quotes/${id}`),
  uploadUrl: (payload) => api.post('/quotes/upload-url', payload),
  register: (payload) => api.post('/quotes', payload),
  /**
   * Upload, extract and identify in one call, whatever the format.
   *
   * The file goes through the API rather than to storage on a presigned URL.
   * A browser PUT to the R2 endpoint is cross-origin and fails with a bare
   * "Load failed" until the bucket's CORS policy names this origin — a setting
   * that is easy to miss and whose failure mode says nothing.
   */
  upload: (formData) => api.post('/quotes/file', formData),
  extract: (id, hints) => api.post(`/quotes/${id}/extract`, hints || {}),
  /**
   * Confirm what the document was read as. `{}` accepts the proposal as it
   * stands, which is the common case — sending a field overrides it.
   */
  confirm: (id, payload) => api.patch(`/quotes/${id}/identification`, payload || {}),
  /** Re-match against the suppliers as they stand now, without re-extracting. */
  identify: (id) => api.post(`/quotes/${id}/identify`, {}),
  /**
   * Set the unit for a document whose rows print none, and re-normalise.
   * Board price lists omit it routinely — one answer settles every row.
   */
  setUom: (id, uom) => api.patch(`/quotes/${id}/uom`, { uom }),
  /** Discard a quote. Refused once its rates are written — reject those instead. */
  remove: (id, payload) => api.del(`/quotes/${id}`, payload),
  match: (id, payload) => api.post(`/quotes/${id}/match`, payload || {}),
  approve: (id, payload) => api.post(`/quotes/${id}/approve`, payload || {}),
  reject: (id, payload) => api.post(`/quotes/${id}/reject`, payload || {}),
  editLine: (id, lineId, payload) => api.patch(`/quotes/${id}/lines/${lineId}`, payload),
  setSupplierItem: (id, lineId, payload) =>
    api.post(`/quotes/${id}/lines/${lineId}/supplier-item`, payload),
};

export const items = {
  search: (q, params) => api.get(`/items/search${query({ q, ...params })}`),
  detail: (itemId, params) => api.get(`/items/${itemId}${query(params)}`),
  quotes: (itemId, params) => api.get(`/items/${itemId}/quotes${query(params)}`),
  classify: (itemId, payload) => api.put(`/items/${itemId}/classification`, payload),
};

export const mappings = {
  queue: (params) => api.get(`/mappings/queue${query(params)}`),
  entry: (id) => api.get(`/mappings/queue/${id}`),
  resolve: (id, payload) => api.post(`/mappings/queue/${id}/resolve`, payload),
  stats: () => api.get('/mappings/queue-stats'),
  list: (params) => api.get(`/mappings${query(params)}`),
  retire: (id, payload) => api.del(`/mappings/${id}`, payload),
};

export const reports = {
  refreshNeeded: (params) => api.get(`/reports/refresh-needed${query(params)}`),
  plantGaps: (params) => api.get(`/reports/plant-gaps${query(params)}`),
  leakage: (params) => api.get(`/reports/leakage${query(params)}`),
  spread: (params) => api.get(`/reports/spread${query(params)}`),
  singleSource: (params) => api.get(`/reports/single-source${query(params)}`),
  dataQuality: (params) => api.get(`/reports/data-quality${query(params)}`),
  masterDuplicates: (params) => api.get(`/reports/master-duplicates${query(params)}`),
  /** Every report exports; the purchase team lives in Excel. */
  csvUrl: (name, params) => `${PREFIX}/reports/${name}${query({ ...params, format: 'csv' })}`,
};

export const poCheck = {
  one: (transactionId, params) => api.get(`/po-check/${transactionId}${query(params)}`),
  sweep: (params) => api.get(`/po-check/sweep${query(params)}`),
  openAboveQuote: (params) => api.get(`/po-check/open-above-quote${query(params)}`),
};

export const receiving = {
  uploadUrl: (payload) => api.post('/receiving/upload-url', payload),
  list: (params) => api.get(`/receiving/document-sets${query(params)}`),
  get: (id) => api.get(`/receiving/document-sets/${id}`),
  create: (payload) => api.post('/receiving/document-sets', payload),
  extract: (id) => api.post(`/receiving/document-sets/${id}/extract`),
  match: (id) => api.post(`/receiving/document-sets/${id}/match`),
  update: (id, payload) => api.patch(`/receiving/document-sets/${id}`, payload),
  post: (id, payload, { dryRun } = {}) =>
    api.post(`/receiving/document-sets/${id}/post${dryRun ? '?dryRun=true' : ''}`, payload || {}),
};

/**
 * Download a CSV through the same auth the API uses.
 *
 * A plain link cannot carry the bearer token, so the file is fetched and
 * handed to the browser as a blob instead.
 */
export async function downloadCsv(name, params, filename) {
  const response = await api.raw(
    `/reports/${name}${query({ ...params, format: 'csv' })}`,
  );
  if (!response.ok) throw new ApiError(`Could not export ${name}`, { status: response.status });

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `${name}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function query(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
