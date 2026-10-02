# Supabase activation

The frontend is configured for the Raisoni Nexus Supabase project. Run these SQL files in the Supabase Dashboard under **SQL Editor**, in this order:

1. Run `database/schema.sql` from the project root. It creates the tables and Auth profile trigger, backfills profiles for existing Auth users, and records downloads.
2. Run `database/seed.sql` to add the nine catalog branches, semesters 1–8, the Information Technology branch, and the requested Semester 2 subjects for CSE AIML, CSE AI, COE, and IT. It is safe to run more than once.
3. Run `supabase/rls.sql`. It replaces the recursive profile policy with a role-check function, enables row-level security, and creates the Storage bucket policies.

The existing live project currently reports `infinite recursion detected in policy for relation "profiles"` until the updated RLS SQL is applied.

## Auth URL configuration

In **Authentication → URL Configuration**, set the production site URL and add the development and production URLs to the redirect allow list. Include the recovery paths, for example:

- `http://127.0.0.1:8001/**`
- `http://127.0.0.1:8004/**`
- `http://localhost:8001/**`
- `http://localhost:8004/**`
- `https://YOUR-VERCEL-DOMAIN/**`

If using the earlier local server port, add `http://127.0.0.1:8000/**` as well.

## Signup limits and email delivery

The project code and database schema do not impose a student account-count limit. Supabase Auth applies signup rate limits outside this repository. Its documented defaults include 30 signup/sign-in requests per 5 minutes per IP and 2 emails per hour with the built-in email provider. Check **Authentication → Rate Limits** in the Supabase Dashboard if signups return a rate-limit error. For higher verification-email volume, configure a custom SMTP provider under **Authentication → SMTP Settings**; do not put SMTP credentials in frontend files.

The registration form maps Supabase Auth error codes to student-safe messages. If an error is not one of the recognized rate-limit codes, use the Supabase Auth logs to identify the actual server-side cause.

## Google student sign-in

1. Create a **Web application** OAuth client in Google Cloud Console.
2. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the OAuth client ID and client secret.
3. Copy the callback URL shown by Supabase and add it to the Google OAuth client's **Authorized redirect URIs**.
4. Add the local login routes and your production login route to Supabase's redirect allow list. For example:
	- `http://127.0.0.1:8003/login.html`
	- `http://127.0.0.1:8004/login.html`
	- `http://localhost:8003/login.html`
	- `http://localhost:8004/login.html`
	- `https://YOUR-VERCEL-DOMAIN/login.html`

The Google button uses Supabase OAuth and returns to `login.html`. Keep the Google client secret in Supabase provider settings; never add it to frontend files.

## Admin account

1. Create an account through the student sign-up page or Supabase Authentication. New profiles receive the `student` role automatically.
2. Promote the intended administrator from the SQL Editor, replacing the email:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) = lower('admin@example.com');
```

3. Sign in at `/admin/login.html`.

## Import subjects

Open **Admin → Subjects** and download the CSV template. Fill the `subject_name` cells with the official course names and, where available, enter the subject code and description. Keep the `branch_short_name` and `semester_number` values from the template unchanged. Importing validates branch/semester values and skips subjects that already exist for the same branch and semester.

Do not set the role through user metadata and never put a Supabase service-role key in frontend code. Only the public/publishable key belongs in `assets/js/supabase-config.js`.
