import { appConfig } from '../config/appConfig';
let csrf = '';
export const setCsrf = (value: string) => {
  csrf = value;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(appConfig.apiBase + path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal,
    });
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Unable to connect. Check your connection and try again.', 0);
  }
  const content = response.headers.get('content-type') || '';
  if (!content.includes('application/json'))
    throw new ApiError('The store service is unavailable. Please try again later.', 503);
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong.', response.status);
  return data;
}
