import { config } from '../config/index';
import { query, type DB } from '../db';
import { escapeHtml } from '../http';
export async function queueEmail(db: DB, key: string, to: string, subject: string, text: string) {
  await db.query(
    `INSERT INTO email_outbox(dedupe_key,recipient,subject,body) VALUES($1,$2,$3,$4) ON CONFLICT(dedupe_key) DO NOTHING`,
    [key, to, subject, text],
  );
}
export async function drainEmail(deadline = Date.now() + 20000) {
  if (!config.resendKey || !config.emailFrom) return { sent: 0, configured: false };
  let sent = 0;
  for (let i = 0; i < 10 && Date.now() < deadline - 5000; i++) {
    const { rows } = await query(
      `UPDATE email_outbox SET locked_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=(SELECT id FROM email_outbox WHERE status='pending' AND available_at<=now() AND (locked_until IS NULL OR locked_until<now()) AND attempts<10 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    );
    const mail = rows[0];
    if (!mail) break;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': mail.id,
        },
        body: JSON.stringify({
          from: config.emailFrom,
          to: mail.recipient,
          subject: mail.subject,
          text: mail.body,
          html: `<div style="font-family:Arial;line-height:1.7;max-width:600px;margin:auto"><h1 style="color:#153f32">Okpora</h1><div style="white-space:pre-wrap">${escapeHtml(mail.body)}</div></div>`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('email');
      await query(`UPDATE email_outbox SET status='sent',sent_at=now(),locked_until=null WHERE id=$1`, [
        mail.id,
      ]);
      sent++;
    } catch {
      await query(
        `UPDATE email_outbox SET available_at=now()+interval '5 minutes'*attempts,locked_until=null WHERE id=$1`,
        [mail.id],
      );
    }
  }
  return { sent, configured: true };
}
