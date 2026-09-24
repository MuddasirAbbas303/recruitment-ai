# Recruitment AI LinkedIn Importer

This Manifest V3 Chrome extension scans the currently visible Google
search-results page. On a LinkedIn profile explicitly opened by the recruiter,
it can also read visible professional Experience entries and update the active
temporary Recruitment AI import session. It never saves candidates
automatically or accesses LinkedIn cookies or private APIs.

## Load locally in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load unpacked**.
4. Select `apps/extension`.
5. Reload any Google search-results page that was already open before the
   extension was installed.

After changing extension files, click **Reload** on this extension at
`chrome://extensions` before testing.

## Local API access

The extension sends imports to
`http://localhost:3000/api/candidates/import-search-results`. Start the
Recruitment AI API before importing.

For an explicit CORS allow-list entry, copy the extension ID shown on
`chrome://extensions` and set this in `apps/api/.env` before restarting the API:

```env
CHROME_EXTENSION_ORIGIN=chrome-extension://your-32-character-extension-id
```

No API key or other secret is included in the extension.

## Usage

1. Open a Google X-Ray search that targets `site:linkedin.com/in`.
2. Open the Recruitment AI extension.
3. Select visible profiles, or use **Select All**.
4. Click **Import Selected**.

Imported candidates are normalized, deduplicated, and checked against the
local candidate database. They are returned as unsaved candidates unless they
already exist; importing does not create database records. After a successful
import, the extension opens or focuses Recruitment AI and the imported profiles
appear in **Candidate Sourcing → Search Candidates**. Temporary import sessions
expire after 30 minutes.

To complete experience, open an imported candidate's LinkedIn profile, open
the extension, and click **Update Candidate Experience**. Only visible entries
with a job title, company, start date, and end date or Present are accepted.
