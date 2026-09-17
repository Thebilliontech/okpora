import { z } from 'zod';
import { query, tx } from '../db';
import { body, email, fail, json } from '../http';
import { config, missingConfig } from '../config/index';
import {
  passwordHash,
  passwordMatches,
  newSession,
  hash,
  token,
  cookieToken,
  sessionCookie,
  rateLimit,
  requireUser,
  checkCsrf,
} from './security';
import { queueEmail } from '../email/index';
const password = z.string().min(12, 'Use at least 12 characters.').max(128);
export async function authRoutes(req: Request, path: string) {
  if (req.method !== 'POST') return null;
  if (path === '/auth/register') {
    const input = await body(
      req,
      z.object({
        name: z.string().trim().min(2).max(150),
        email,
        phone: z.string().max(30).default(''),
        password,
      }),
    );
    await rateLimit('register:' + input.email, 3, 3600);
    if (missingConfig('email').length)
      fail(503, 'Registration is temporarily unavailable. Please try again later.');
    const encoded = await passwordHash(input.password);
    const verification = token();
    await tx(async (db) => {
      const exists = (await db.query('SELECT id FROM users WHERE email=$1', [input.email])).rows[0];
      if (exists) return;
      const user = (
        await db.query('INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id', [
          input.name,
          input.email,
          input.phone,
          encoded,
        ])
      ).rows[0];
      await db.query(
        `INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'verify',now()+interval '24 hours')`,
        [hash(verification), user.id],
      );
      await queueEmail(
        db,
        'verify-' + verification,
        input.email,
        'Confirm your Okpora email',
        `Hi ${input.name},\n\nConfirm your email to start shopping:\n${config.siteUrl}/verify-email?token=${verification}\n\nThis link expires in 24 hours.`,
      );
    });
    return json(
      {
        message:
          'If this email can be registered, a confirmation link will arrive shortly. Already registered? Sign in or reset your password.',
      },
      201,
    );
  }
  if (path === '/auth/login') {
    const input = await body(
      req,
      z.object({ email, password: z.string().max(128), remember: z.boolean().default(false) }),
    );
    await rateLimit('login:' + input.email, 10, 900);
    const u = (await query('SELECT * FROM users WHERE email=$1', [input.email])).rows[0];
    const dummy = 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64);
    const valid = await passwordMatches(input.password, u?.password_hash || dummy);
    if (!u || !valid || u.disabled) fail(401, 'Email or password is incorrect.');
    if (!u.email_verified) fail(403, 'Please confirm your email before signing in.');
    const session = await newSession({ query }, u.id, input.remember);
    return json(
      {
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          email_verified: u.email_verified,
        },
        csrf: session.csrf,
      },
      200,
      { 'Set-Cookie': session.cookie },
    );
  }
  if (path === '/auth/logout') {
    const user = await requireUser(req);
    checkCsrf(req, user);
    await query('DELETE FROM sessions WHERE token_hash=$1', [hash(cookieToken(req))]);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if (path === '/auth/forgot' || path === '/auth/resend-verification') {
    const input = await body(req, z.object({ email }));
    await rateLimit(path + input.email, 3, 3600);
    if (missingConfig('email').length) fail(503, 'Email delivery is temporarily unavailable.');
    const u = (
      await query('SELECT id,email,email_verified FROM users WHERE email=$1 AND NOT disabled', [input.email])
    ).rows[0];
    const verify = path.endsWith('resend-verification');
    if (u && (!verify || !u.email_verified)) {
      const raw = token();
      await tx(async (db) => {
        await db.query('DELETE FROM auth_tokens WHERE user_id=$1 AND purpose=$2', [
          u.id,
          verify ? 'verify' : 'reset',
        ]);
        await db.query(
          `INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')`,
          [hash(raw), u.id, verify ? 'verify' : 'reset'],
        );
        await queueEmail(
          db,
          'auth-' + raw,
          u.email,
          verify ? 'Confirm your Okpora email' : 'Reset your Okpora password',
          `Open this link within one hour:\n${config.siteUrl}/${verify ? 'verify-email' : 'reset-password'}?token=${raw}\n\nIf you did not request this, you can ignore this email.`,
        );
      });
    }
    return json({ message: 'If your account is eligible, an email will arrive shortly.' });
  }
  if (path === '/auth/reset' || path === '/auth/verify') {
    const reset = path.endsWith('reset');
    const input = await body(
      req,
      z.object({ token: z.string().length(64), password: reset ? password : z.string().optional() }),
    );
    const encoded = reset ? await passwordHash(input.password!) : '';
    await tx(async (db) => {
      const t = (
        await db.query(
          `DELETE FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id`,
          [hash(input.token), reset ? 'reset' : 'verify'],
        )
      ).rows[0];
      if (!t) fail(400, 'This link is invalid or expired. Request a new one.');
      if (reset) {
        await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [t.user_id, encoded]);
        await db.query('DELETE FROM sessions WHERE user_id=$1', [t.user_id]);
      } else await db.query('UPDATE users SET email_verified=true WHERE id=$1', [t.user_id]);
    });
    return json({
      message: reset ? 'Password updated. Please sign in.' : 'Email confirmed. You can now sign in.',
    });
  }
  if (path === '/auth/password') {
    const user = await requireUser(req);
    checkCsrf(req, user);
    const input = await body(req, z.object({ current_password: z.string().max(128), password }));
    await rateLimit('password:' + user.id, 5, 900);
    const u = (await query('SELECT password_hash FROM users WHERE id=$1', [user.id])).rows[0];
    if (!(await passwordMatches(input.current_password, u.password_hash)))
      fail(400, 'Current password is incorrect.');
    await tx(async (db) => {
      await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        user.id,
        await passwordHash(input.password),
      ]);
      await db.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
    });
    return json({ message: 'Password updated. Please sign in again.' }, 200, {
      'Set-Cookie': sessionCookie('', 0),
    });
  }
  return null;
}
