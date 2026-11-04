# Nextmove

A private job-search app with live listings, a preference checklist, resume-based AI search, saved jobs, and an application tracker.

## Use

1. Open My checklist and enter your OpenAI key. Remembering it saves it only in this browser, separately from backups.
2. Upload a PDF, DOCX, TXT, or Markdown resume (up to 5 MB), review the extracted profile, and choose Use this for my search.
3. Adjust role, work style, employment, location, and salary filters. Empty sections include all options.
4. AI rank matches compares up to 40 candidates selected by resume keyword relevance, with reasons and gaps.
5. Save jobs, add notes and follow-up dates, and move them between stages.
6. Prepare application creates an editable introduction. Continue to the original listing to submit; explicitly mark the job applied afterward.

Employer forms are not submitted automatically. Remotive supplies remote roles with a 24-hour delay; Arbeitnow mainly supplies European jobs. Feeds cache for six hours. Add any outside job by URL.

## Data

This Site is private. Jobs, notes, preferences, your reviewed resume profile, and an optional remembered API key live in this browser. The raw resume is not saved by the app. Export/import includes tracked jobs, preferences, and your introduction; it excludes the key and extracted resume profile. Browser storage is device-specific.

AI requests go through /api/ai to OpenAI Responses using gpt-5-mini, strict JSON schemas, and store:false. Keys are never persisted server-side or logged by application code. OpenAI retention policies and API charges apply. The endpoint validates inputs, limits file size and candidate counts, treats document text as untrusted data, rejects cross-origin requests, and returns errors without credentials. No paid request occurs until the user chooses analysis or ranking.

References: [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Remotive API](https://github.com/remotive-com/remote-jobs-api).

## Development

Requires Node 22.13+ and npm. Run npm ci, then npm run dev -- --port 5187. Run node scripts/verify.mjs for behavior and mocked AI endpoint checks, node node_modules/typescript/bin/tsc --noEmit for type checking, and npm run build for production. Preserve .openai/hosting.json when publishing. Sites helpers own source synchronization and packaging. Local tool state and fixtures are ignored.
