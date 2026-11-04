# Nextmove

Standalone job search and application tracking with Next.js. No ChatGPT, Codex, Sites, or cloud login is required to run it.

## Run locally

Install Node.js 22.13+ and run `npm ci` once. Double-click **Start-Nextmove.cmd**, or run `npm run local`, to open **http://127.0.0.1:5187**. Stop with **Stop-Nextmove.cmd** or `npm run local:stop`.

The Windows launchers use `.runtime/node.exe` when present, otherwise an installed Node.js. The server runs independently of an editor or desktop app and listens only on 127.0.0.1. The first start builds the app. After source changes, stop it, run `npm run build:local`, and start again. Logs are in `.local-runtime/`.

Imported jobs, tracking, notes, filters, and application-note templates work offline while the local server is running. Live job feeds and optional AI calls require internet. Fonts are system fonts.

## Data

Stages: Saved, Preparing, Applied, Not Interested, Heard From, Interviewed, No Dice.

Browser storage holds jobs, notes, preferences, your introduction, and your reviewed resume profile. A remembered OpenAI key is stored separately in that browser. Use the same URL each time: localhost and 127.0.0.1 have separate browser storage. The app does not retain raw resumes or save keys in server files.

Export/import backup includes the imported catalog, tracked jobs, preferences, and introduction. It excludes the API key and extracted resume profile. Back up before clearing browser data or switching addresses/devices. There is no account or cross-device synchronization.

## Import a shortlist

With Python and openpyxl installed:

```sh
python -m pip install openpyxl
python scripts/import-shortlist.py /path/to/shortlist.xlsx
```

The importer supports the Job shortlist, Data entry, and Not shortlisted worksheets. It preserves pay units, conditions, verification dates, URLs, notes, and supplied statuses. Not started becomes Saved; excluded entries become Not Interested. Application dates are not invented.

The output is `.local-runtime/imported-jobs.json`, excluded from git. Reload the local app to apply it. This replaces job data once while preserving preferences, profile, resume, and key. The previous workspace is retained in browser storage at `nextmove.workspace.v1.before-job-import`. Later status and note changes survive refresh/restart.

With an imported catalog, Refresh retains the catalog instead of refilling it with live feeds. Use the Worksheet selector to show Data Entry separately. Without an import, the app fetches Remotive and Arbeitnow. These are limited sources, not an exhaustive job search. Add any other job by URL.

## Optional AI and applications

Enter your OpenAI API key in My checklist. Resume analysis and ranking call the OpenAI API through this app's backend using your key. There is no ChatGPT integration or session. Calls occur only when you choose Analyze resume or AI rank matches; API charges apply separately.

Upload PDF, DOCX, TXT, or Markdown and review the extracted facts before using them. Ranking compares up to 40 jobs. The API uses structured output with `store:false`; application code does not log credentials and treats uploaded text as untrusted data.

The app prepares an editable application note and tracks status. You complete submission on the employer's website. There is no unattended application or background automation.

## Vercel

Import this repository with the **Next.js** preset, root directory `.`, and build command `npm run build`. Use the default output directory. Do not set `NEXTMOVE_LOCAL` or `NEXT_PUBLIC_LOCAL_APP` on Vercel. Windows launchers are local only. `npm run build` checks the hosted build; `npm run build:local` builds the local app.

Restrictions:

- **Separate data:** the Vercel address gets its own browser storage. Export a backup locally and import it there; re-enter your key and resume profile if needed. Cross-device sync would require authentication and a database.
- **Private imports stay local:** imported spreadsheet data is excluded from git and the deployment. Bring it to your own hosted browser with the app's backup import.
- **Upload size:** Vercel Function request/response bodies are limited to 4.5 MB. Base64 adds overhead, so the hosted UI allows resumes up to 3 MB; local mode allows 5 MB.
- **Execution:** Hobby functions allow up to 300 seconds. The AI route is configured for 120 seconds, with a 90-second OpenAI request timeout. This app does not run a persistent background worker.
- **Access:** this app has no login. Anyone can open an unprotected deployment, but each browser has its own data and key. Configure suitable deployment protection or add authentication if hosting privately. Do not add a shared server API key without authentication and usage controls.
- **Plan:** Hobby is limited to personal, non-commercial use and usage quotas. OpenAI charges are separate.

Sources: [Vercel Function limits](https://vercel.com/docs/functions/limitations), [Vercel Hobby plan](https://vercel.com/docs/plans/hobby).

## Development

`npm run dev` starts local development. `npm test` checks filters, backups, import persistence, and mocked AI requests. No paid API requests are made by tests. Run `npx tsc --noEmit` for type checking.

Keep runtime binaries, imported jobs, browser backups, resumes, credentials, logs, and generated builds outside git.
