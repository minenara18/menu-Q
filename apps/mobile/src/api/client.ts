import { getBaseUrl } from '../stores/device';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
}

/** Thin fetch wrapper: one place to translate network failures into UI errors. */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const base = getBaseUrl();
  if (!base) {
    throw new ApiError('Alamat server belum diatur di Pengaturan Perangkat.', 0);
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Server tidak dapat dijangkau. Periksa alamat server dan koneksi.', 0);
  }

  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    const message = payload?.message ?? `Permintaan gagal (${response.status})`;
    throw new ApiError(Array.isArray(message) ? message.join(', ') : message, response.status);
  }
  return payload;
}
