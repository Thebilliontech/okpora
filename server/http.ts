import { z } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
export async function body<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  if (!req.headers.get('content-type')?.includes('application/json')) fail(415, 'Use JSON for this request.');
  const text = await req.text();
  if (text.length > 200000) fail(413, 'Request is too large.');
  try {
    return schema.parse(JSON.parse(text));
  } catch (e) {
    if (e instanceof z.ZodError)
      fail(400, e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '));
    return fail(400, 'Invalid JSON request.');
  }
}
export const uuid = z.string().uuid();
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const safeUrl = z
  .string()
  .max(1500)
  .refine(
    (v) => !v || (v.startsWith('/') && !v.startsWith('//')) || /^https:\/\//.test(v),
    'Use an HTTPS image or a local path.',
  );
export const paging = (url: URL) => ({
  page: Math.max(1, Math.min(10000, Number(url.searchParams.get('page')) || 1)),
  limit: Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 24)),
});
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function csv(rows: Record<string, unknown>[]) {
  const keys = Array.from(new Set(rows.flatMap(Object.keys)));
  const cell = (v: unknown) => {
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [keys.map(cell).join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\r\n');
}
