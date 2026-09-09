# Recruitment AI LinkedIn Importer

This Manifest V3 Chrome extension scans only the currently visible Google
search-results page. It detects visible public LinkedIn profile links, lets the
recruiter select results, and sends the selected result metadata to the local
Recruitment AI API. It does not open or scrape LinkedIn pages and does not save
candidates automatically.

## Load locally in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load unpacked**.
4. Select `apps/extension`.
5. Reload any Google search-results page that was already open before the
   extension was installed.

This first version works only on the current `https://www.google.com/search`
results page.

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
