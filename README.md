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
2. Apply all SQL files in `supabase/migrations` in filename order through the SQL editor or your normal migration workflow. They create the workspace table, row-level read access, and a save function. Anonymous access and direct client table writes are denied. Saves derive ownership from the authenticated JWT and check revisions atomically. The elevated helper lives in `nextmove_private`; keep that schema out of the Data API's exposed schemas. The public entry point runs with the caller's privileges.
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

## Search job boards with your résumé

Open Job Search in the sidebar to use its search form. Select a saved résumé beside the search field. Leave it blank to find matches for the skills and target roles in your reviewed résumé, or enter a role, skill, or location to narrow results. Comma-separated phrases are alternatives. Other checklist filters still apply; the explicit search replaces the checklist keyword field.

Click the Job Search button to run a new search. My Searches in the left sidebar is a history-only list of completed searches and up to 40 matching jobs per entry. Opening the history page or an entry never runs a search. Open a result to review the original listing or add it to your shortlist. Existing tracking and Applied statuses are retained. Each new search adds a separate dated record. History entries retain their original results; removing a search keeps tracked jobs. Up to 20 searches can be stored, with an explicit message when the limit is reached.

Choose a job board beside the résumé selector. **Remotive + Arbeitnow** imports matching listings into Nextmove, independently of the stored job catalogue. Feeds refresh up to every six hours. Remotive listings are delayed 24 hours; Arbeitnow focuses on Europe. Matching is based on résumé keywords, with the matching terms shown on each result. It is not an assessment of eligibility, and the feeds do not cover every job board. Résumé data is compared in the browser and is not sent to these feeds. No OpenAI key is needed for this search.

**Monster, LinkedIn, and Indeed** open a search on the selected board in a new tab. These are search links, not imported feeds or API integrations. The explicit query is used when supplied; otherwise the selected résumé's first nonempty target role (or first skill) becomes the query. The preview shows exactly which keywords and location will be sent. Remote-only preferences use Remote; otherwise the first selected location is used. Other filters can be adjusted on the destination board. No résumé file, summary, or contact information is sent. These boards may require sign-in.

Clicking Job Search records the board, résumé name, keywords, location, and timestamp in My Searches, with no invented jobs or result counts. Opening that history entry makes no request to any board. Its explicit external link opens current board results and also serves as a fallback if the original new tab was blocked. Use Add a job to save a listing URL from those boards. Existing feed snapshots and Applied statuses remain unchanged.

Saved searches sync with the workspace and are included in backups. Apply all SQL files in `supabase/migrations` in filename order before deploying; the saved-search migration preserves history when an older browser tab saves a workspace without the new field.

Sources: [Remotive API](https://github.com/remotive-com/remote-jobs-api), [Arbeitnow API](https://www.arbeitnow.com/blog/job-board-api).

## Résumé library and saved jobs

My Resumes supports up to 20 named profiles. Add or edit skills, target titles, experience level, and summary, or fill them from a file. The current single résumé is migrated to the first library entry without losing any profile details. Select a résumé in the top search bar; saved search snapshots show which résumé was used. Only the Job Search page can start a search; its button uses the current selection.

Résumé selection never changes stored-job filtering, sorting, application details, or tracking. Saved Jobs contains all imported and bookmarked jobs, with its own text search and status selector. The homepage focuses on job-board searches; progress counters and stored listings have moved off it. The interface uses a dark theme. Import controls are hidden; existing data and backup exports remain available.

## Import jobs

Import controls are currently hidden. The existing import format and migration tools are retained for data recovery. When the import flow is available, choose a Nextmove JSON file, review its counts, and select **Replace jobs and import**. Jobs and supplied statuses replace the catalogue and tracking. Profile, filters, résumé, and the device key are retained. Wait until database status says saved before closing. Later visits and other signed-in devices use the imported catalogue.

Convert a workbook with Python and openpyxl:

```sh
python -m pip install openpyxl
python scripts/import-shortlist.py /path/to/shortlist.xlsx
```

Job shortlist, Data entry, and Not shortlisted are supported. Pay units, conditions, verification dates, URLs, notes, and supplied statuses are preserved. Applied stays Applied. Not started becomes Saved; excluded entries become Not Interested. Application dates are not invented.

Output goes to `.local-runtime/imported-jobs.json`. An empty local database offers it as a first-run import. It is never automatically reapplied after migration, so later changes survive refresh/restart. Import again explicitly to replace jobs. Use the Worksheet selector for Data Entry.

Full backup import replaces jobs, filters, and profile; new backups also contain the résumé library, selection, and saved searches. Private imports, backups, credentials, and résumés stay out of the public repository.

## AI, applications, and limits

In My Resumes, upload a résumé and supply your OpenAI API key to extract its profile, or enter a profile manually without an API key. Analysis calls OpenAI only when clicked, using `store:false`; API charges apply. Review and edit extracted facts before saving. The app retains named profiles, not original files.

The app prepares editable application notes and tracks status. Submission happens on the employer's website. There is no unattended application or background worker. Follow-up dates do not send reminders.

Vercel Function bodies are limited to 4.5 MB; hosted résumé uploads allow 3 MB to leave room for base64 (local: 5 MB). The AI route allows 120 seconds with a 90-second upstream timeout. Workspace data goes directly to Supabase's authenticated API and is capped by this app at 8 MB. Provider quotas still apply. Vercel Hobby is for personal, non-commercial use. Sources: [Function limits](https://vercel.com/docs/functions/limitations), [Hobby plan](https://vercel.com/docs/plans/hobby).

Without an imported catalogue, listings come from Remotive and Arbeitnow. These are limited feeds, not an exhaustive search. Add any other job by URL.

## Development

`npm run dev` starts local development. `npm run build` builds for hosting; `npm run build:local` builds the standalone app. `npx tsc --noEmit` checks types.

`npm test` checks filters, imports, backups, and mocked AI, then verifies persistence and concurrency with actual SQLite and local PGlite PostgreSQL. PostgreSQL tests run the shipped migration and check anonymous denial, two-user isolation, blocked direct writes, and stale revisions. These tests do not claim hosted provisioning, sign-in, or email delivery have been verified.
