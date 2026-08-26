const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

function getTokens() {
  return {
    accessToken: localStorage.getItem("toonai_access_token"),
    refreshToken: localStorage.getItem("toonai_refresh_token"),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("toonai_access_token", accessToken);
  localStorage.setItem("toonai_refresh_token", refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("toonai_access_token");
  localStorage.removeItem("toonai_refresh_token");
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken as string;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken } = getTokens();
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }
  return res;
}

export const api = {
  signup: (email: string, password: string, displayName?: string) =>
    apiFetch("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, displayName }) }),
  login: (email: string, password: string) =>
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  getBalance: () => apiFetch("/credits/balance").then((r) => r.json()),
  getProjects: () => apiFetch("/projects").then((r) => r.json()),
  getProject: (id: string) => apiFetch(`/projects/${id}`).then((r) => r.json()),
  createTextToVideo: (payload: unknown) =>
    apiFetch("/generate/text-to-video", { method: "POST", body: JSON.stringify(payload) }),
  getJob: (jobId: string) => apiFetch(`/generate/jobs/${jobId}`).then((r) => r.json()),
  getCreditProducts: () => apiFetch("/credits/products").then((r) => r.json()),
};
