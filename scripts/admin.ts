import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { query, tx, close } from '../server/db';
import { config } from '../server/config/index';
const rl = createInterface({ input: stdin, output: stdout });
try {
  const email = (
    config.adminEmailBootstrap || (await rl.question('Email of your verified customer account: '))
  )
    .trim()
    .toLowerCase();
  const user = (await query('SELECT id,email,email_verified FROM users WHERE email=$1', [email])).rows[0];
  if (!user?.email_verified) throw new Error('Register through Okpora and verify this email first.');
  const answer = await rl.question(`Promote ${email} to super administrator? Type PROMOTE: `);
  if (answer !== 'PROMOTE') throw new Error('Cancelled.');
  await tx(async (db) => {
    await db.query("UPDATE users SET role='super_admin' WHERE id=$1", [user.id]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
    await db.query(
      "INSERT INTO audit_logs(admin_id,action,object_type,object_id) VALUES($1,'Promoted by database owner CLI','user',$1)",
      [user.id],
    );
  });
  console.log('Administrator created. Sign in again through the normal login page.');
} finally {
  rl.close();
  await close();
}
