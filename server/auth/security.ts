import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query, type DB } from '../db';
import { config } from '../config/index';
import { fail } from '../http';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const result = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${result.toString('hex')}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [, salt, key] = encoded.split(':');
  if (!salt || !key) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
export const sessionCookie = (value: string, age?: number) =>
  `okpora_session=${value}; HttpOnly; Path=/; SameSite=Lax${config.production ? '; Secure' : ''}${age !== undefined ? `; Max-Age=${age}` : ''}`;
export const cookieToken = (req: Request) =>
  req.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('okpora_session='))
    ?.split('=')[1] || '';
export type User = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  email_verified: boolean;
  csrf_token: string;
};
export async function currentUser(req: Request): Promise<User | null> {
  const raw = cookieToken(req);
  if (!raw) return null;
  const { rows } = await query(
    `SELECT u.id,u.name,u.email,u.phone,u.role,u.email_verified,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled`,
    [hash(raw)],
  );
  return rows[0] || null;
}
export async function requireUser(req: Request, admin = false) {
  const user = await currentUser(req);
  if (!user) fail(401, 'Please sign in to continue.');
  if (admin && !['admin', 'super_admin'].includes(user!.role))
    fail(403, 'You do not have access to this page.');
  return user!;
}
export function checkOrigin(req: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (
    ![
      config.siteUrl,
      ...(!config.production ? ['http://localhost:5173', 'http://terminal.local:4173'] : []),
    ].includes(origin || '')
  )
    fail(403, 'Request origin is not allowed.');
}
export function checkCsrf(req: Request, user: User) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.get('x-csrf-token') !== user.csrf_token)
    fail(403, 'Your session changed. Refresh and try again.');
}
export async function rateLimit(key: string, limit = 60, seconds = 60) {
  const { rows } = await query(
    `INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.hits+1 END,reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.reset_at END RETURNING hits`,
    [hash(key), seconds],
  );
  if (rows[0].hits > limit) fail(429, 'Too many attempts. Please try again later.');
}
export async function newSession(db: DB, userId: string, remember: boolean) {
  const raw = token(),
    csrf = token();
  const age = remember ? 30 * 86400 : 12 * 3600;
  await db.query(
    `INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')`,
    [hash(raw), userId, csrf, age],
  );
  return { csrf, cookie: sessionCookie(raw, remember ? age : undefined) };
}
