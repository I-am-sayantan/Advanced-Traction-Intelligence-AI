const API_URL = process.env.REACT_APP_BACKEND_URL;

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

export async function apiFetch<T = any>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export async function apiUpload<T = any>(path: string, file: File): Promise<T> {
  const url = `${API_URL}${path}`;
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}
