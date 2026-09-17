# Create the first administrator securely

There is no default password, public admin registration, or obvious Admin Login link.

1. Connect the database and Resend and deploy Okpora.
2. Visit the ordinary `/register` page. Create your account with your name, email and a password of at least 12 characters.
3. Open the email confirmation link and select **Confirm my email**. Email delivery is processed by the scheduled worker, typically on the next minute.
4. In the downloaded project's root folder, configure the ignored `.env` with your database connection. Run:

   ```sh
   npm run admin:create
   ```

5. Enter the exact verified email. Check it carefully. Type `PROMOTE` when asked.
6. The script promotes that verified account to `super_admin`, invalidates its old sessions and writes an audit event.
7. Sign in through `/login`. The backend returns the saved role and the app opens the private admin dashboard.

If you prefer your provider's SQL editor, run the following only as the database owner, replacing the email:

```sql
BEGIN;
UPDATE okpora.users SET role='super_admin'
WHERE email='your-verified-email@example.com' AND email_verified=true;
DELETE FROM okpora.sessions
WHERE user_id IN (SELECT id FROM okpora.users WHERE email='your-verified-email@example.com');
INSERT INTO okpora.audit_logs(admin_id,action,object_type,object_id)
SELECT id,'Promoted by database owner SQL','user',id::text
FROM okpora.users WHERE email='your-verified-email@example.com' AND role='super_admin';
COMMIT;
```

Confirm exactly one intended account was updated. If zero rows changed, verify that email through the app first.

Additional staff should register normally. A super administrator can change their role or disable access under **Customers → View customer**. Only a super administrator can issue refunds or change access. Disabling or changing a user's role revokes all their sessions. Never share one administrator password between staff.
