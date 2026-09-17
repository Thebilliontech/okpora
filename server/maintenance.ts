import { query, tx } from './db';
import { drainEmail, queueEmail } from './email/index';
import { verifyOrder } from './orders/service';
import { verifyRefund } from './payments/providers';
export async function maintenance() {
  const deadline = Date.now() + 25000;
  const pending = (
    await query(
      `SELECT id FROM orders WHERE payment_status IN ('pending','failed') AND created_at>now()-interval '7 days' AND provider_session IS NOT NULL ORDER BY updated_at LIMIT 10`,
    )
  ).rows;
  await Promise.all(
    pending.map(async (o) => {
      try {
        await verifyOrder(o.id);
      } catch {}
      await query('UPDATE orders SET updated_at=now() WHERE id=$1', [o.id]);
    }),
  );
  await tx(async (db) => {
    const expired = (
      await db.query(
        `UPDATE orders SET stock_state='released',payment_status='failed' WHERE stock_state='reserved' AND reserved_until<now() AND payment_status='pending' RETURNING id,number`,
      )
    ).rows;
    for (const o of expired) {
      await db.query(`UPDATE transactions SET status='failed' WHERE order_id=$1 AND kind='payment'`, [o.id]);
      await db.query(
        `INSERT INTO notifications(audience,title,body,order_id) VALUES('admin','Payment not confirmed',$1,$2)`,
        [
          o.number +
            ' checkout expired without a confirmed payment. Late confirmations will still be reconciled.',
          o.id,
        ],
      );
    }
  });
  const refunds = (
    await query(
      `SELECT r.*,o.provider,o.total,o.currency,o.number,o.user_id,p.provider_transaction FROM refund_requests r JOIN orders o ON o.id=r.order_id JOIN payments p ON p.order_id=o.id WHERE o.payment_status='refund_pending' AND r.provider_ref IS NOT NULL LIMIT 10`,
    )
  ).rows;
  await Promise.all(
    refunds.map(async (r) => {
      try {
        const status = await verifyRefund(r.provider, r.provider_ref, {
          transaction: r.provider_transaction,
          amount: r.total,
          currency: r.currency,
        });
        if (status === 'refunded')
          await tx(async (db) => {
            const locked = (
              await db.query('SELECT payment_status FROM orders WHERE id=$1 FOR UPDATE', [r.order_id])
            ).rows[0];
            if (locked.payment_status === 'refunded') return;
            await db.query(`UPDATE orders SET payment_status='refunded',status='refunded' WHERE id=$1`, [
              r.order_id,
            ]);
            await db.query(`UPDATE refund_requests SET status='refunded' WHERE order_id=$1`, [r.order_id]);
            await db.query(
              `INSERT INTO transactions(order_id,kind,reference,provider,amount,currency,status) VALUES($1,'refund',$2,$3,$4,$5,'refunded')`,
              [r.order_id, r.provider_ref, r.provider, r.total, r.currency],
            );
            await db.query(
              `INSERT INTO order_status_history(order_id,status,note) VALUES($1,'refunded','Refund verified with payment provider.')`,
              [r.order_id],
            );
            await db.query(
              `INSERT INTO notifications(user_id,audience,title,body,order_id) VALUES($1,'customer','Refund processed',$2,$3)`,
              [r.user_id, `Your refund for ${r.number} has been processed.`, r.order_id],
            );
            const u = (await db.query('SELECT email FROM users WHERE id=$1', [r.user_id])).rows[0];
            await queueEmail(
              db,
              'refund-' + r.order_id,
              u.email,
              'Okpora refund processed · ' + r.number,
              `Your ${r.currency} ${(r.total / 100).toFixed(2)} refund has been processed. Your payment provider determines when it reaches your account.`,
            );
          });
        else if (status === 'failed')
          await query("UPDATE refund_requests SET status='failed' WHERE order_id=$1", [r.order_id]);
      } catch {}
    }),
  );
  await query('DELETE FROM sessions WHERE expires_at<now()');
  await query('DELETE FROM auth_tokens WHERE expires_at<now()');
  await query("DELETE FROM rate_limits WHERE reset_at<now()-interval '1 day'");
  return drainEmail(deadline);
}
