# Nextmove

Job search and application tracking with Next.js. Runs independently of ChatGPT, Codex, or Sites. Optional résumé analysis uses your own OpenAI API key.

## Storage

- **Local, without cloud configuration:** SQLite at `.local-runtime/workspace.sqlite`. Every browser using this local server sees the same data. Stored jobs, notes, filters, and tracking work without an account or internet.
- **Supabase configured:** Postgres with email/password sign-in. Local and Vercel copies connected to the same project share your account's workspace. Each account can only access its own data.
- **Vercel without Supabase:** a database setup screen. Existing browser data remains available for export.

Jobs, imports, all seven statuses, notes, follow-up dates, filters, application profile, and reviewed résumé profile are stored atomically. The database is authoritative. A browser draft protects unsaved edits during failed requests and is removed after saving. Drafts are scoped to the signed-in user. The interface reports save failures and conflicts. It checks for changes from other devices every 15 seconds and on focus, only when there are no unsaved edits.

Revision checks prevent stale devices from overwriting newer data. When a conflict occurs, export the unsaved edits, then load the database copy. No automatic overwrite or merge occurs. Backups include the reviewed résumé profile but exclude the OpenAI key and original résumé file. A remembered key stays in that browser, never in either database.

## Run locally

Install Node.js 22.13+ and run `npm ci` once. Double-click **Start-Nextmove.cmd** or run `npm run local`. Open **http://127.0.0.1:5187**. Stop with **Stop-Nextmove.cmd** or `npm run local:stop`.

The launchers prefer `.runtime/node.exe` when present, otherwise installed Node.js. The server runs independently of an editor, listening only on loopback. First start builds the app. After source changes, stop, run `npm run build:local`, and start again. Logs, imports, SQLite, and journal files are in `.local-runtime/`, excluded from git. For a file-level SQLite backup, stop the server first; Export backup also works while running.

The local database endpoint is disabled on hosting and rejects non-loopback hosts and cross-origin requests. It is intended for a one-user local server. Use Supabase for hosting and device synchronization.

To use cloud storage locally, configure the same Supabase project in `.env.local` before building. Leave the variables unset for fully local SQLite. Live feeds and AI require internet in either mode.

## Configure Supabase and Vercel

1. Create or select a Supabase project. Review the plan before creating paid resources.
2. Run `supabase/migrations/202611040001_workspaces.sql` in its SQL editor, or apply through your normal migration workflow. It creates the workspace table, row-level read access, and a save function. Anonymous access and direct client table writes are denied. Saves derive ownership from the authenticated JWT and check revisions atomically.
3. In **Authentication → Users**, add your email/password user and confirm its email. Disable public sign-ups for a personal app. The interface provides sign-in and password reset, without public registration.
4. In Authentication URL configuration, set Site URL to your Vercel app address. Allow that address and any local address you use (such as `http://127.0.0.1:5187`) for password reset redirects. Configure email delivery if the project's built-in email service cannot send to your address.
5. Add these build-time variables to Vercel and, optionally, `.env.local`:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
   ```

   Use the **publishable key**. Never put a service_role key, secret key, database password, or OpenAI key in a NEXT_PUBLIC variable. No service-role secret is needed by this application. Keep real configuration out of git.
6. Deploy with the **Next.js** preset, root `.`, build command `npm run build`, default output directory. Do not set `NEXTMOVE_LOCAL` or `NEXT_PUBLIC_LOCAL_APP` on Vercel. Redeploy after changing public variables.
7. Sign in from the browser holding your previous data. Choose **Import existing data** to copy jobs and statuses, including Applied, into the database. The old browser data is retained. Other browsers can sign in to the same account to retrieve the workspace.

If data is on another address or browser, export it there and import the JSON after signing in here. If database and browser data both exist, migration replaces the database workspace only when explicitly chosen. Export both first if you need to combine them. New accounts have separate workspaces.

**Apply the SQL migration and configure both variables before activating this version on Vercel.** Source code alone does not provision or connect a database.

Sources: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Next.js setup](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs).

## Import jobs

Click **Import jobs**, choose a Nextmove JSON file, review its counts, and select **Replace jobs and import**. Jobs and supplied statuses replace the catalogue and tracking. Profile, filters, résumé, and the device key are retained. Wait until database status says saved before closing. Later visits and other signed-in devices use the imported catalogue.

Convert a workbook with Python and openpyxl:

```sh
python -m pip install openpyxl
python scripts/import-shortlist.py /path/to/shortlist.xlsx
```

Job shortlist, Data entry, and Not shortlisted are supported. Pay units, conditions, verification dates, URLs, notes, and supplied statuses are preserved. Applied stays Applied. Not started becomes Saved; excluded entries become Not Interested. Application dates are not invented.

Output goes to `.local-runtime/imported-jobs.json`. An empty local database offers it as a first-run import. It is never automatically reapplied after migration, so later changes survive refresh/restart. Import again explicitly to replace jobs. Use the Worksheet selector for Data Entry.

Full backup import replaces jobs, filters, and profile; new backups also contain the reviewed résumé profile. Private imports, backups, credentials, and résumés stay out of the public repository.

## AI, applications, and limits

Enter your OpenAI key in My checklist. Résumé analysis and ranking call OpenAI through this app only when clicked, using `store:false`. Charges are separate. Application code does not retain original uploads. Review extracted facts before use. Ranking compares up to 40 jobs.

The app prepares editable application notes and tracks status. Submission happens on the employer's website. There is no unattended application or background worker. Follow-up dates do not send reminders.

Vercel Function bodies are limited to 4.5 MB; hosted résumé uploads allow 3 MB to leave room for base64 (local: 5 MB). The AI route allows 120 seconds with a 90-second upstream timeout. Workspace data goes directly to Supabase's authenticated API and is capped by this app at 8 MB. Provider quotas still apply. Vercel Hobby is for personal, non-commercial use. Sources: [Function limits](https://vercel.com/docs/functions/limitations), [Hobby plan](https://vercel.com/docs/plans/hobby).

Without an imported catalogue, listings come from Remotive and Arbeitnow. These are limited feeds, not an exhaustive search. Add any other job by URL.

## Development

`npm run dev` starts local development. `npm run build` builds for hosting; `npm run build:local` builds the standalone app. `npx tsc --noEmit` checks types.

`npm test` checks filters, imports, backups, and mocked AI, then verifies persistence and concurrency with actual SQLite and local PGlite PostgreSQL. PostgreSQL tests run the shipped migration and check anonymous denial, two-user isolation, blocked direct writes, and stale revisions. These tests do not claim hosted provisioning, sign-in, or email delivery have been verified.
