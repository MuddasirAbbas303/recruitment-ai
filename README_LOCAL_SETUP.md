# Recruitment AI: Complete Local Setup Guide

This guide explains how to run Recruitment AI on your own computer. It is
written for someone who has never used Docker, a terminal, an environment file,
or developer tools before.

You do **not** need to install Node.js, pnpm, or PostgreSQL when you use the
Docker setup in this guide. Docker puts those tools inside isolated containers
for you.

Take your time. Complete each numbered section in order. If something does not
work, use the troubleshooting steps directly below that section before moving
on.

---

## 1. What this application does

Recruitment AI is a local recruitment workspace. It helps a recruiter organize
candidate information and compare people with a role.

- **Candidate Sourcing** helps you search your saved candidates or open a
  Google search for public LinkedIn profile results.
- **CV Matching** lets you select PDF or DOCX resumes and compare them with job
  requirements.
- **Candidate Database** stores candidates that you explicitly choose to save.
- **AI scoring** can compare professional candidate information with job
  requirements. You can choose Groq or OpenAI. The built-in mock mode contacts
  neither provider.
- **Google / LinkedIn search** creates a Google X-Ray search. This is a normal
  Google search that asks Google to show public LinkedIn profile pages.
- **Chrome extension** reads only the visible results on the current Google
  search page and sends the profiles you select back to Recruitment AI.
- **Excel export** downloads the current or selected candidate results as an
  `.xlsx` spreadsheet.
- **Outreach drafting** prepares email, LinkedIn message, and LinkedIn
  connection-note text. You review and send the text yourself.
- **Interview invitations** prepare an email message and a calendar file. You
  explicitly decide when to mark a saved candidate as invited.

Recruitment AI does not automatically hire, reject, contact, or save a person.
The recruiter remains in control.

### If this section is unclear

You do not need to understand how the features are built. The important point
is that everything runs on your computer, and the later sections show exactly
what to click.

---

## 2. What you need before starting

You need:

1. A Mac or Windows computer on which you are allowed to install applications.
2. A working internet connection. Docker must download software the first time.
3. Google Chrome.
4. Docker Desktop.
5. The Recruitment AI project folder or access to its repository.
6. Optionally, a Groq or OpenAI API key if you want real AI requests.

You can run the application without an AI-provider key by using:

```text
USE_MOCK_AI=true
```

Mock AI produces predictable test results. It is the safest setting for your
first setup.

You do **not** need these programs on your computer for the Docker setup:

- Node.js
- pnpm
- PostgreSQL
- nginx

Docker includes them inside the application containers.

### Troubleshooting this section

- If this is a work computer, ask your administrator whether you may install
  Chrome and Docker Desktop.
- If the computer has very little free space, make at least several gigabytes
  available before continuing. Docker images can be large.
- If you do not have a Groq or OpenAI key, continue with mock mode. Do not stop
  the setup.

---

## 3. Download and install Google Chrome

Chrome is needed to open Recruitment AI and load the local Recruitment AI
extension.

Download Chrome only from the official page:

[https://www.google.com/chrome/](https://www.google.com/chrome/)

### Mac

1. Open Safari.
2. Enter `https://www.google.com/chrome/` in the address bar.
3. Click **Download Chrome**.
4. If Chrome asks which Mac type you have, follow the Apple Silicon versus
   Intel check in Section 4.
5. Open the downloaded `.dmg` file. It is usually in **Downloads**.
6. Drag the Chrome icon into the **Applications** folder shown in the installer
   window.
7. Open **Finder**.
8. Click **Applications** in the left sidebar.
9. Double-click **Google Chrome**.
10. If macOS asks whether you are sure, click **Open**.

Chrome is installed correctly if a Chrome window opens and you can enter a web
address.

### Windows

1. Open Microsoft Edge.
2. Enter `https://www.google.com/chrome/` in the address bar.
3. Click **Download Chrome**.
4. Open the downloaded installer, usually named `ChromeSetup.exe`.
5. If Windows asks for permission, click **Yes**.
6. Wait while Chrome downloads and installs.
7. Open the **Start** menu.
8. Type `Chrome`.
9. Click **Google Chrome**.

Chrome is installed correctly if a Chrome window opens and you can enter a web
address.

### Troubleshooting Chrome installation

- If the download does not start, reload the official Chrome page and try
  again.
- On Mac, if Chrome is still inside Downloads, make sure you dragged it into
  **Applications**.
- On Windows, if you cannot run the installer, ask the computer administrator
  for installation permission.
- If Chrome opens but has no internet access, check Wi-Fi or your wired network
  before continuing.

---

## 4. Install Docker Desktop

Docker Desktop runs three isolated parts of Recruitment AI:

1. `web` — the page you see in Chrome.
2. `api` — the application logic.
3. `postgres` — the database that stores saved candidates.

Download Docker Desktop from:

[https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)

### Mac: check whether the Mac uses Apple Silicon or Intel

Docker provides different downloads for the two Mac processor types.

1. Click the Apple menu in the top-left corner of the screen.
2. Click **About This Mac**.
3. Look for **Chip** or **Processor**.
4. If it says Apple M1, M2, M3, M4, or another Apple chip, choose the **Apple
   Silicon** Docker download.
5. If it says Intel, choose the **Intel** Docker download.

### Mac: install Docker Desktop

1. Download the correct Docker Desktop version.
2. Open the downloaded `.dmg` file.
3. Drag **Docker** into **Applications**.
4. Open **Finder**, then **Applications**.
5. Double-click **Docker**.
6. Accept the license or security prompts if shown.
7. Enter your Mac password if macOS asks for permission.
8. Wait for Docker Desktop to finish starting.

Look near the top-right of the Mac screen for the Docker whale icon. Open
Docker Desktop and wait until it says that the Docker engine is running. Do not
continue while Docker says **Starting** or **Stopped**.

### Windows: install Docker Desktop

1. Download Docker Desktop for Windows from the official Docker page.
2. Open `Docker Desktop Installer.exe`.
3. If Windows asks for permission, click **Yes**.
4. Leave the recommended options selected.
5. Finish the installation.
6. Restart Windows if the installer requests it.
7. Open the **Start** menu.
8. Search for `Docker Desktop`.
9. Click **Docker Desktop**.
10. Accept the license if shown.
11. Wait until Docker Desktop reports that Docker is running.

Docker on Windows may ask to install or update **WSL 2**. WSL means Windows
Subsystem for Linux. Docker uses it behind the scenes. Follow the Docker prompt,
allow the WSL installation or update, restart Windows if requested, and open
Docker Desktop again.

### Confirm Docker is running

You can confirm visually in Docker Desktop. Later, after opening a terminal,
you can also run:

```sh
docker --version
```

You should see a Docker version number rather than an error.

### Troubleshooting Docker Desktop

- If `docker --version` works but later commands say the daemon is unavailable,
  open Docker Desktop and wait until the engine is running.
- On Mac, make sure you installed the version for the correct chip.
- On Windows, complete every WSL prompt and restart the computer if requested.
- If Windows says virtualization is disabled, follow your computer
  manufacturer's instructions or ask an administrator to enable virtualization.
- If Docker Desktop is stuck on **Starting**, quit it completely, reopen it,
  and wait a few minutes.

---

## 5. Get the project onto the machine

You need a folder named `recruitment-ai`. When you open that folder, you should
see files such as `docker-compose.yml`, `.env.example`, and `package.json`.

### Option A: you received a ZIP file

1. Download the ZIP file.
2. Open **Downloads**.
3. Find the downloaded ZIP file.
4. Extract it:
   - On Mac, double-click the ZIP file.
   - On Windows, right-click it, click **Extract All**, choose a location, and
     click **Extract**.
5. Open the extracted folder.
6. If the ZIP created an extra outer folder, keep opening folders until you see
   `docker-compose.yml`.
7. Confirm the folder containing `docker-compose.yml` is the project root. It
   should normally be named `recruitment-ai`.
8. Move this folder to an easy location, such as **Documents**.

### Option B: you have Git installed

Git is a tool for downloading and updating source-code repositories. Do not use
this option if you do not already have Git.

Open a terminal as described in Section 6. Go to the folder where you want to
place the project, and run the following command after replacing
`<repository-url>` with the real repository address supplied to you:

```sh
git clone <repository-url>
```

For example, if the repository owner gives you an address beginning with
`https://github.com/`, use that complete address after `git clone`.

After cloning, a new `recruitment-ai` folder should appear.

### Troubleshooting getting the project

- If you cannot see `docker-compose.yml`, you are probably one folder too high
  or too low. Search inside the extracted folders.
- If `git` is reported as an unknown command, use the ZIP option or install Git
  separately.
- If Git asks for permission, sign-in, or repository access, contact the person
  who gave you the repository address.
- Do not put the project inside another application package. A normal Documents
  folder is easiest.

---

## 6. Open Terminal or PowerShell

A terminal is a window where you type short text instructions for your
computer.

### Mac

1. Press **Command + Space** to open Spotlight.
2. Type `Terminal`.
3. Click **Terminal**.
4. A window with a text prompt will open.

### Windows

1. Click the **Start** menu.
2. Type `PowerShell`.
3. Click **Windows PowerShell** or **PowerShell**.
4. A window with a text prompt will open.

You do not normally need to open PowerShell as Administrator for this guide.

### How to run a command

1. Click inside the terminal window.
2. Type or paste one command.
3. Press **Enter**.
4. Wait until the command finishes or a new prompt appears.

Do not type the ``` marks shown around examples in this guide. Those marks only
separate commands from normal text.

### Troubleshooting the terminal

- If pasted text does not appear on Mac, click the window and press
  **Command + V**.
- In PowerShell, paste with **Control + V** or right-click.
- If a command is still running, do not type the next command until it has
  finished unless this guide explicitly says to open a second terminal.

---

## 7. Navigate to the project folder

Before running project commands, the terminal must be inside the
`recruitment-ai` folder.

The command `cd` means “change directory,” which means “move into this folder.”

### Mac example

If the project is in your Documents folder, run:

```sh
cd ~/Documents/recruitment-ai
```

If a folder name contains spaces, put quotation marks around the complete path:

```sh
cd "$HOME/Documents/My Projects/recruitment-ai"
```

An easy Mac method is:

1. Type `cd `, including the space after `cd`.
2. Open Finder.
3. Drag the `recruitment-ai` folder from Finder into Terminal.
4. Terminal inserts the folder path.
5. Press **Enter**.

### Windows example

Replace `USERNAME` with your Windows account name:

```powershell
cd "C:\Users\USERNAME\Documents\recruitment-ai"
```

An easy Windows method is:

1. Open the `recruitment-ai` folder in File Explorer.
2. Click the address bar at the top.
3. Copy the complete folder path.
4. In PowerShell, type `cd `, including the space.
5. Paste the path inside quotation marks.
6. Press **Enter**.

### Confirm you are in the project root

On Mac, run:

```sh
ls
```

On Windows PowerShell, run:

```powershell
Get-ChildItem
```

You should see `docker-compose.yml`, `package.json`, `apps`, and other project
items. Every command marked **run from the project root** later in this guide
must be run from this folder.

### Troubleshooting folder navigation

- “No such file or directory” or “Cannot find path” means the path is wrong.
  Copy it again from Finder or File Explorer.
- Put quotation marks around paths containing spaces.
- If `docker-compose.yml` is not listed, use `cd` again to enter the correct
  folder.
- On Mac, `~` means your personal home folder. On Windows, use the complete
  `C:\Users\...` path.

---

## 8. Create the `.env` file

The `.env` file is a small private settings file. It tells Docker which database
name, password, and AI settings to use.

The project includes `.env.example`, which is a safe template. You copy the
template to a new file named `.env`, then edit your private values.

Make sure the terminal is in the project root.

### Mac or Linux

This command copies the template:

```sh
cp .env.example .env
```

To open the new file in TextEdit on Mac, run:

```sh
open -e .env
```

### Windows PowerShell

This command copies the template:

```powershell
Copy-Item .env.example .env
```

To open the new file in Notepad, run:

```powershell
notepad .env
```

### Enter the settings

Your `.env` file can look like this. These are placeholders, not real API
credentials:

```env
POSTGRES_DB=recruitment_ai
POSTGRES_USER=recruitment_user
POSTGRES_PASSWORD=choose-a-long-local-password
POSTGRES_PORT=5432

AI_PROVIDER=groq

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GROQ_SEARCH_MODEL=openai/gpt-oss-20b
GROQ_NORMALIZATION_MODEL=openai/gpt-oss-20b
GROQ_WEB_MAX_RESULTS=10

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6

USE_MOCK_AI=true

EXTERNAL_CANDIDATE_PROVIDER=mock
CORESIGNAL_API_KEY=
CHROME_EXTENSION_ORIGIN=
```

Replace `choose-a-long-local-password` with a password used only for this local
database. For a simple first setup, use letters, numbers, and hyphens. Do not
leave `POSTGRES_PASSWORD` empty because Docker Compose requires it.

Save the file:

- TextEdit: click **File**, then **Save**, or press **Command + S**.
- Notepad: click **File**, then **Save**, or press **Control + S**.

### What each setting means

- `POSTGRES_DB` is the database name. Keep `recruitment_ai`.
- `POSTGRES_USER` is the local database username. Keep `recruitment_user`.
- `POSTGRES_PASSWORD` protects the local database. You must choose a value.
- `POSTGRES_PORT` is the computer port used by PostgreSQL. Keep `5432` unless
  that port is already used.
- `AI_PROVIDER` selects the real AI service. Supported values are `groq` and
  `openai`. If this line is missing, the application uses Groq.
- `GROQ_API_KEY` is the optional private Groq key. Leave it empty in mock mode.
- `GROQ_MODEL` is the Groq model used for CV analysis, candidate scoring, and
  drafted messages. Keep the shown value.
- `GROQ_SEARCH_MODEL` is the Groq model configured for supported web-search
  features. Keep the shown value.
- `GROQ_NORMALIZATION_MODEL` turns supported search information into a standard
  candidate format. Keep the shown value.
- `GROQ_WEB_MAX_RESULTS` limits Groq web-search results. Keep `10`.
- `OPENAI_API_KEY` is the optional private OpenAI key. It is required only when
  `AI_PROVIDER=openai` and mock mode is off.
- `OPENAI_MODEL` is the OpenAI model used for AI work. Keep `gpt-5.6` unless
  your project administrator tells you to use another supported model.
- `USE_MOCK_AI=true` means the main scoring and drafting flows use predictable
  test responses and do not make real Groq or OpenAI requests.
- `USE_MOCK_AI=false` uses the service selected by `AI_PROVIDER`. Only the
  selected provider's API key is required.
- `EXTERNAL_CANDIDATE_PROVIDER=mock` keeps the backend external-provider
  abstraction in its safe development setting. The visible **Google /
  LinkedIn** option uses a normal Google browser tab and the Chrome extension.
- `CORESIGNAL_API_KEY` is for an optional provider that is not used by this
  beginner workflow. Leave it empty.
- `CHROME_EXTENSION_ORIGIN` allows your exact locally loaded Chrome extension
  to call the API. Leave it empty until Section 14.

### Troubleshooting `.env`

- If your editor saves `.env.txt`, rename it to exactly `.env`. On Windows,
  enable **View → Show → File name extensions** in File Explorer to see the
  complete name.
- Do not add spaces around `=`. Use `USE_MOCK_AI=true`, not
  `USE_MOCK_AI = true`.
- Do not put the settings inside a Word document.
- If Docker says `POSTGRES_PASSWORD` is missing, reopen `.env`, enter a value,
  save it, and try again.
- Keep `.env` in the same folder as `docker-compose.yml`.

---

## 9. Optional Groq or OpenAI setup

Skip this section for your first test if you want to use mock AI. Choose only
one real provider. You do not need both API keys.

### Option A: use Groq

1. Open Chrome.
2. Go to the Groq Console at
   [https://console.groq.com/](https://console.groq.com/).
3. Create an account or sign in.
4. Open the API keys area.
5. Create a new API key.
6. Copy the key once and store it somewhere private.
7. Open the root `.env` file created in Section 8.
8. Set the following lines and save the file:

```env
AI_PROVIDER=groq
GROQ_API_KEY=your-groq-key-here
GROQ_MODEL=openai/gpt-oss-20b
USE_MOCK_AI=false
```

You may leave `OPENAI_API_KEY` empty when Groq is selected.

### Option B: use OpenAI

1. Open Chrome.
2. Go to the OpenAI API platform at
   [https://platform.openai.com/](https://platform.openai.com/).
3. Sign in and open the API keys page.
4. Create a project API key.
5. Copy the key once and store it somewhere private.
6. Open the root `.env` file created in Section 8.
7. Set the following lines and save the file:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-key-here
OPENAI_MODEL=gpt-5.6
USE_MOCK_AI=false
```

You may leave `GROQ_API_KEY` empty when OpenAI is selected.

The example key text above is not a real credential. Never paste a real key
into this guide, a chat, a screenshot, a public issue, or source control. The
repository ignores the root `.env` file, but you should still treat it as a
password. Share `.env.example`, not `.env`.

After changing `AI_PROVIDER`, an API key, or `USE_MOCK_AI`, recreate the API
container so Docker reads the new settings:

```sh
docker compose up -d --force-recreate api
```

If code or Docker files changed too, rebuild it:

```sh
docker compose up -d --build api
```

### Troubleshooting AI-provider setup

- If the error names the wrong provider, check that `AI_PROVIDER` is exactly
  `groq` or `openai`, save `.env`, and recreate the API container.
- A Groq missing-key error means the selected provider needs
  `GROQ_API_KEY`. An OpenAI missing-key error means it needs
  `OPENAI_API_KEY`.
- If a key was accidentally shared, revoke it in that provider's console and
  create a new one.
- For quota, rate-limit, model, or timeout errors, do not retry repeatedly.
  Set `USE_MOCK_AI=true`, recreate the API container, and continue safely.

---

## 10. Start the application

First, open Docker Desktop and wait until Docker is running.

Then return to Terminal or PowerShell. Confirm you are in the project root—the
folder containing `docker-compose.yml`.

The following command tells Docker to build the application images and start
the database, API, and web page:

```sh
docker compose up --build
```

Press **Enter** once. The first startup can take several minutes because Docker
downloads Node.js 24, nginx, PostgreSQL 17, pnpm, and application packages.
Later startups are normally faster.

Docker starts services in a safe order:

1. PostgreSQL starts.
2. Docker waits until PostgreSQL is healthy.
3. The API runs Sequelize database migrations.
4. The API connects to the database and starts on port `3000`.
5. The web container starts nginx on port `5173`.

Normal output can include lines similar to:

```text
recruitment-ai-postgres ... healthy
recruitment-ai-api ... sequelize-cli db:migrate
recruitment-ai-api ... Database connected successfully
recruitment-ai-api ... API running on http://localhost:3000
recruitment-ai-web ... start worker processes
```

The exact wording and order may differ. Warnings about package updates are not
usually failures.

Keep this terminal open while using the app. Closing it or pressing
**Control + C** stops the foreground Compose session.

### Troubleshooting first startup

- If Docker says it cannot connect to the Docker daemon, open Docker Desktop
  and wait until it is running.
- If Docker says `POSTGRES_PASSWORD` is missing, complete Section 8.
- If downloading fails, check the internet connection and run the same command
  again.
- If a red error mentions port `5173`, `3000`, or `5432`, go to Section 26.
- If the command looks busy, wait. The first no-cache build can take several
  minutes.

---

## 11. Open the application

1. Leave the Docker terminal running.
2. Open Google Chrome.
3. Click the address bar.
4. Enter:

   ```text
   http://localhost:5173
   ```

5. Press **Enter**.

`localhost` means “this computer.” The application is not being opened from a
public website. Port `5173` identifies the Recruitment AI web container on your
computer.

You should see:

- the heading **Recruitment workspace**;
- tabs named **Candidate Sourcing** and **CV Matching**;
- **CV Matching** selected by default;
- a small **API Connected** message at the bottom.

### Troubleshooting opening the application

- If Chrome says the page cannot be reached, return to the Docker terminal and
  check for errors.
- Confirm the address begins with `http://`, not `https://`.
- Wait 10–20 seconds and refresh once if the containers just started.
- Run `docker compose ps` as explained in Section 27. All three services should
  be running; `postgres` and `api` should show healthy.

---

## 12. Verify the backend

This optional check confirms that the API and database connection work.

1. Open a new Chrome tab.
2. Enter:

   ```text
   http://localhost:3000/health
   ```

3. Press **Enter**.

You should see text similar to:

```json
{
  "status": "ok",
  "message": "Recruitment AI API is running",
  "database": "connected"
}
```

Seeing plain JSON text is normal. This page is a health check, not the main
application.

### Troubleshooting the health check

- If the page does not open, run `docker compose ps` and
  `docker compose logs api`.
- If the API container is not running, inspect PostgreSQL with
  `docker compose logs postgres` because the API waits for the database.
- The main application address is still `http://localhost:5173`, not the health
  address.

---

## 13. Install the Chrome extension

The extension is not placed inside Docker. You load it directly from the
project folder.

1. Open Google Chrome.
2. Click the address bar.
3. Enter:

   ```text
   chrome://extensions
   ```

4. Press **Enter**.
5. Find the **Developer mode** switch in the top-right corner.
6. Turn **Developer mode** on.
7. Click **Load unpacked** near the top-left.
8. A folder-selection window opens.
9. Navigate to your `recruitment-ai` project folder.
10. Open `apps`.
11. Select the `extension` folder itself. Do not select an individual file
    inside it.
12. Click **Select**, **Open**, or the equivalent button for your computer.
13. Confirm that **Recruitment AI LinkedIn Importer** appears on the extensions
    page.

The selected folder is:

```text
recruitment-ai/apps/extension
```

On Mac, the folder picker may make navigation easier if you press
**Command + Shift + G**, paste the complete folder path, and press **Enter**.

### Pin the extension to the Chrome toolbar

1. Open any normal Chrome tab.
2. Click the puzzle-piece icon near the top-right of Chrome.
3. Find **Recruitment AI LinkedIn Importer**.
4. Click the pin icon beside it.
5. The extension icon should now remain visible in the toolbar.

### Troubleshooting extension installation

- If **Load unpacked** is missing, turn on **Developer mode**.
- If Chrome reports a missing manifest, you selected the wrong folder. Select
  the folder containing `manifest.json` directly:
  `recruitment-ai/apps/extension`.
- If your organization blocks unpacked extensions, ask the Chrome or computer
  administrator for permission.
- After loading the extension, reload any Google results page that was already
  open.

---

## 14. Configure the Chrome extension origin

Chrome gives every locally loaded extension an ID. The API uses that ID to
allow only your extension to import candidates.

### Copy the extension ID

1. Open Chrome.
2. Enter `chrome://extensions`.
3. Find **Recruitment AI LinkedIn Importer**.
4. Look for **ID** on its card.
5. Copy the complete 32-character ID.

### Add the ID to `.env`

1. Open the root `.env` file from Section 8.
2. Find `CHROME_EXTENSION_ORIGIN=`.
3. Add `chrome-extension://` followed immediately by the copied ID.

It should look like:

```env
CHROME_EXTENSION_ORIGIN=chrome-extension://THE_EXTENSION_ID
```

A format-only example using a valid 32-character shape is:

```env
CHROME_EXTENSION_ORIGIN=chrome-extension://abcdefghijklmnopabcdefghijklmnop
```

Use your real extension ID, not the example. Do not add a trailing slash.

4. Save `.env`.

### Apply the changed environment setting

This command restarts the existing API process:

```sh
docker compose restart api
```

However, Docker normally keeps the old environment values during a simple
restart. To reliably load a changed `.env`, recreate the API container from the
project root:

```sh
docker compose up -d --force-recreate api
```

If you still have trouble, recreate the complete application:

```sh
docker compose down
```

Then start it again:

```sh
docker compose up --build
```

### Troubleshooting extension origin setup

- Copy only the extension ID, not the words around it.
- The complete value must begin with `chrome-extension://`.
- The API accepts an exact 32-character Chrome extension ID. Do not use the
  extension name.
- After recreating the API, reload the Google search page and reopen the
  extension popup.
- If imports still fail, use `docker compose logs api` and see Section 26.

---

## 15. Test Candidate Sourcing

This workflow opens a Google search. The extension reads only visible Google
results whose links contain a public LinkedIn `/in/` profile URL. It does not
log into LinkedIn or open profile pages automatically.

### Enter a search

1. Open `http://localhost:5173` in Chrome.
2. Click **Candidate Sourcing** at the top.
3. Click the **Search Candidates** sub-tab.
4. In **Role / Job Title**, enter a role such as `Backend Developer`.
5. In **Required Skills**, enter comma-separated skills, for example
   `Node.js, AWS`.
6. In **Preferred Skills**, enter optional skills, for example `Docker`.
7. In **Minimum Experience**, enter a number such as `3` if needed.
8. In **Maximum Experience**, enter a number such as `10` if needed.
9. In **Location**, enter a place such as `Latvia`.
10. In **Keywords**, enter optional comma-separated words.
11. In **Exclude Keywords**, enter words you do not want, such as
    `student, intern`.
12. Open **Search Source** and choose **Google / LinkedIn**.
13. Click **Search Candidates**.

Google opens in another tab. Recruitment AI remains open. The application
builds a Google X-Ray query similar to:

```text
site:linkedin.com/in ("Backend Developer" OR "Backend Engineer") ("Node.js") ("AWS") "Latvia"
```

### Import visible Google results

1. Stay on the Google results tab opened by Recruitment AI.
2. Wait until visible results appear.
3. Click the pinned Recruitment AI extension icon.
4. The popup first says **Scanning...**.
5. It then says **X profiles found** or **No LinkedIn profiles found**.
6. Tick the checkbox beside each profile you want.
7. To select every detected profile, click **Select All**.
8. To remove every selection, click **Clear**.
9. Click **Import Selected**.
10. Wait for **Import successful**.
11. Recruitment AI opens or comes back into focus automatically.
12. Imported candidates appear in the existing Search Candidates results
    table.

The temporary import session lasts 30 minutes. Importing does **not** save a
candidate to PostgreSQL.

### Understand the result table

- **Match** shows a percentage and recommendation when scoring information is
  available: Strong Match, Good Match, Potential Match, or Low Match.
- The current extension imports only visible Google result information and does
  not send your form criteria with the import. Therefore a newly imported row
  can correctly show **Score unavailable**. Database searches with criteria are
  scored using mock AI or the selected real provider, depending on `.env`.
- **New** means the candidate is temporary and has not been saved.
- **Saved** means a matching candidate already exists in the Candidate Database.
- **Save Candidate** saves one New candidate.
- **Save Selected** saves the checked New candidates.
- **Save All** saves every currently displayed New candidate.
- **Notes** lets you type recruiter notes. Notes for a New candidate are kept
  with the temporary result and are included if you save that candidate. Notes
  on a Saved candidate are persisted when the field loses focus.
- **Enrich** is available only for an unsaved Google/LinkedIn import with a
  LinkedIn URL. It searches supported public professional sources such as
  GitHub or portfolio pages. It does not scrape the LinkedIn page. Public-web
  enrichment requires real AI mode and a working key for the selected provider.
- **Enrich Selected** processes up to five selected eligible candidates.
- **View Profile** opens the available public LinkedIn URL in a new tab.
- **Email** opens the outreach panel only when an email address is available.
- **LinkedIn Message** and **Connect** open editable drafting panels when a
  LinkedIn URL is available.
- **Activity** appears for saved candidates and opens their recorded history.
- **Invite to Interview** is enabled only for a saved candidate with an email
  address.
- **Export Selected** downloads checked candidates.
- **Export Results** downloads all currently displayed candidates.

### Database and Both source modes

- Choose **Database** to search only saved candidates. The application searches
  the local database and applies match scoring.
- Choose **Both** to search the local database and also open the Google /
  LinkedIn search tab. The database result table appears in Recruitment AI;
  importing extension results later replaces the current result set rather
  than merging unrelated searches.

### Troubleshooting Candidate Sourcing

- The extension supports the exact `https://www.google.com/search...` page
  pattern. If you manually navigate to another Google country domain, start the
  search again from Recruitment AI.
- If the extension says the page is unsupported, make sure the active tab is a
  Google results page opened by the app, then reload the page.
- If no profiles are found, scroll until public LinkedIn `/in/` results are
  visible, reopen the extension, or make the search less restrictive.
- If **Email** is disabled, the visible Google result did not provide an email.
  The application does not invent one.
- If **Invite to Interview** is disabled, save the candidate first and confirm
  that the candidate has an email address.
- If **Enrich** fails in mock mode, remember that provider-backed public web
  search is intentionally unavailable until real AI mode is enabled.

---

## 16. Test Candidate Database

The Candidate Database contains only candidates that have been explicitly
saved.

1. Open Recruitment AI.
2. Click **Candidate Sourcing**.
3. Click **Candidate Database**.
4. Click **Show All Candidates** to reload the complete saved list.

You can narrow the list with:

- **Search** — searches name, title, company, location, and email.
- **Role / Title** — finds part of a current title.
- **Skills** — enter comma-separated skills. A candidate must have all entered
  skills.
- **Location** — finds part of a location.
- **Company** — finds part of a current company.
- **Minimum Experience** — keeps candidates at or above that number of years.
- **Maximum Experience** — keeps candidates at or below that number of years.
- **Source** — limits results by their saved source.
- **Status** — limits results to SAVED, SHORTLISTED, CONTACTED, RESPONDED,
  INTERVIEW, REJECTED, or HIRED.

After entering filters, click **Apply Filters**. Click **Clear Filters** or
**Show All Candidates** to remove filters and reload all candidates.

### Manage a saved candidate

1. Change the **Status** dropdown in the candidate row to update the status.
2. Click **Edit Notes** to open a notes box.
3. Edit the text.
4. Click **Save** to keep it or **Cancel** to discard the edit.
5. Click **Activity** to see outreach, status-change, and interview activity,
   newest first.
6. Click **View Profile** when a LinkedIn URL exists.
7. The Candidate Database **Email** link opens the computer's email app
   directly. AI email drafting is available from Search Candidates results.
8. LinkedIn Message and Connect remain disabled in the Candidate Database
   view; use Search Candidates for those drafting panels.

### Troubleshooting Candidate Database

- **No candidates saved yet** means you must first save a candidate from Search
  Candidates.
- **No candidates match these filters** means saved candidates exist, but the
  current filters exclude them. Click **Show All Candidates**.
- If a status or note does not stay after refreshing, check `API Connected` and
  inspect `docker compose logs api`.
- A dash (`-`) means that information is unavailable; it is not an error.

---

## 17. Test CV Matching

CV Matching accepts up to 20 resumes in one request. Each file must be a PDF or
DOCX and no larger than 10 MB.

1. Open Recruitment AI.
2. Click **CV Matching**.
3. Enter a **Job Title**. This field is required.
4. Enter a meaningful **Job Description**. This field is required.
5. Enter comma-separated **Required Skills**, for example
   `Node.js, PostgreSQL, AWS`.
6. Enter comma-separated **Preferred Skills**, for example `Docker, Redis`.
7. Enter **Minimum Experience** as a number of years.
8. Enter the job **Location**.
9. In **Resume Upload**, click **Choose resumes**.
10. Select one or more `.pdf` or `.docx` files. You can hold Command on Mac or
    Control on Windows while selecting multiple files.
11. Confirm the selected filenames and sizes appear.
12. If you selected the wrong file, click its **Remove** button.
13. Click **Analyze Resumes**.
14. The button says **Analyzing resumes...** while processing.

With `USE_MOCK_AI=true`, text is still extracted from the real files, but the
analysis result is predictable mock data. With `USE_MOCK_AI=false`, extracted
resume text and job requirements are sent to the selected provider for
analysis.

Successful candidates appear from highest overall score to lowest. Click
**View Analysis** to see required-skills score, preferred-skills score,
experience score, matched skills, missing skills, strengths, concerns, and the
summary. Click **Hide Analysis** to collapse it.

If one resume is unreadable, it appears under **Failed to analyze** without
preventing other valid resumes from completing.

Uploaded files are temporary. The API deletes each temporary file after
processing, including when parsing fails. The application does not save the CV
file or extracted CV text in PostgreSQL.

### Troubleshooting CV Matching

- If **Analyze Resumes** is disabled, enter both Job Title and Job Description
  and select at least one resume.
- `.doc` is not accepted. Save the document as `.docx`.
- A scanned PDF made only of images may have no extractable text. Use a PDF with
  selectable text or a DOCX file.
- If a file is larger than 10 MB, create a smaller copy before uploading.
- If more than 20 files are selected, reduce the selection.
- If nginx reports a request problem, use `docker compose logs web` and
  `docker compose logs api`.

---

## 18. Excel export

Excel export is available in Search Candidates after results are visible.

### Export selected candidates

1. Tick the checkbox beside each candidate you want.
2. Click **Export Selected**.
3. Wait while the button says **Exporting...**.
4. Chrome downloads an `.xlsx` file.

### Export every displayed result

1. Leave all current results visible in their desired order.
2. Click **Export Results**.
3. Chrome downloads all displayed rows in the same order.

The file is normally placed in your computer's **Downloads** folder. Its name
looks like `recruitment-candidates-YYYY-MM-DD.xlsx`.

You can open it with:

- Microsoft Excel;
- Apple Numbers on Mac;
- LibreOffice Calc;
- another program that supports `.xlsx` files.

The workbook is generated in memory and is not permanently stored on the API
server.

### Troubleshooting Excel export

- **Export Selected** stays disabled until at least one checkbox is selected.
- If Chrome blocks a download, click the download warning near the address bar
  and allow the download from `localhost`.
- If the file opens with a warning, confirm its name ends in `.xlsx` and try a
  current version of Excel, Numbers, or LibreOffice.
- Use `docker compose logs api` if the app shows an export error.

---

## 19. Email outreach

AI email drafting is available from the Search Candidates results table when a
candidate has an email address.

1. Click **Email** in the candidate row.
2. The Candidate Outreach panel shows the candidate name and email.
3. Click **Generate with AI**.
4. Wait for **Outreach generated**.
5. Read the subject and message carefully.
6. Edit either field as needed. The recruiter is responsible for the final
   wording.
7. Click **Open in Email App**.
8. Your default email program opens a draft addressed to the candidate.
9. Review the draft again and manually send it from the email program.
10. Return to Recruitment AI.
11. If the candidate is saved and you actually sent the email, click
    **Mark as Sent**.

Opening the email app does not send anything and does not create activity.
Generating a draft also does not create activity. Only the explicit
**Mark as Sent** click records `EMAIL_SENT` and can move an early candidate
status to CONTACTED.

### Troubleshooting email outreach

- If **Email** is disabled, the candidate has no email address.
- If no email program opens, configure a default email application in macOS,
  Windows, or Chrome.
- If AI generation fails in real mode, check `AI_PROVIDER`, the selected
  provider's key/model, and the API logs.
- **Mark as Sent** is disabled for unsaved candidates. Save the candidate first.

---

## 20. LinkedIn outreach

LinkedIn drafting is available from Search Candidates when a LinkedIn profile
URL exists.

### LinkedIn direct message

1. Click **LinkedIn Message**.
2. Click **Generate with AI**.
3. Read and edit the generated message.
4. Click **Copy Message**.
5. Wait for the temporary **Copied** message.
6. Click **Open LinkedIn Profile**.
7. LinkedIn opens in a new tab.
8. Manually paste, review, and send the message on LinkedIn.
9. Return to Recruitment AI.
10. For a saved candidate, click **Mark as Sent** only after you actually sent
    it.

### LinkedIn connection request

1. Click **Connect**.
2. Click **Generate with AI**.
3. Review the connection note.
4. Keep it at or below the displayed 250-character limit.
5. Click **Copy Message**.
6. Click **Open LinkedIn Profile**.
7. Manually create the connection request and paste the note.
8. Return and click **Mark as Sent** only if the request was really sent.

Recruitment AI never logs into LinkedIn, clicks LinkedIn's Send or Connect
buttons, or reads LinkedIn cookies. It only prepares text and opens the public
profile URL.

### Troubleshooting LinkedIn outreach

- If the buttons are disabled, the candidate has no LinkedIn URL.
- If **Copy Message** is disabled, generate or type a message first.
- For Connect, shorten text longer than 250 characters. The app does not
  silently cut recruiter-edited text.
- If LinkedIn shows a login or auth wall, sign in manually if you choose. The
  application cannot bypass it.
- **Mark as Sent** requires a saved candidate.

---

## 21. Interview invitations

Interview invitations are available for saved candidates that have an email
address. The action appears in Search Candidates and Candidate Database.

1. Click **Invite to Interview**.
2. Confirm the read-only candidate name and email.
3. Review the default title, `Interview - Candidate Name`, and edit it if
   needed.
4. Choose a future **Date**.
5. Choose a **Time**.
6. Check **Timezone**. The app tries to use the browser's local timezone, such
   as `Europe/Riga`.
7. Select 30, 45, 60, or 90 minutes under **Duration**.
8. Select **Video Call**, **Phone**, or **On-site**.
9. Enter a **Meeting Link / Location** if available.
10. Add optional notes.
11. Click **Generate Invitation with AI**.
12. Review and edit the generated subject and message.
13. Click **Open in Email App** to create an email draft. This does not send it.
14. Click **Download Calendar Invite** if you want a calendar file.
15. Send the email manually.
16. Return to Recruitment AI and click **Mark as Invited** only after you want
    to record the invitation.

An `.ics` file is a standard calendar-invitation file. Opening it in Apple
Calendar, Outlook, or another calendar application creates a calendar event
draft containing the start time, end time, title, description, and location.
Recruitment AI does not connect directly to Google Calendar or Outlook.

Generating text, opening the email app, and downloading the `.ics` file do not
create candidate activity. **Mark as Invited** creates the
`INTERVIEW_INVITED` activity and changes the candidate status to INTERVIEW,
unless the candidate is already HIRED.

### Troubleshooting interview invitations

- The button is disabled until the candidate is saved and has an email.
- All of title, future date, time, timezone, and duration are required.
- Past interview times are rejected.
- If the `.ics` download is blocked, allow downloads from `localhost` in
  Chrome.
- If the time looks wrong, check the Timezone field before generating or
  downloading.

---

## 22. Stop the application

Open a terminal in the project root. If the foreground Docker logs are still
open, press **Control + C** once and wait for the prompt.

Then run:

```sh
docker compose down
```

This stops and removes the running application containers and network. It does
not remove the PostgreSQL named volume, so saved candidate data remains.

### Troubleshooting stopping

- If Docker says no resources were found, the application may already be
  stopped.
- If a container takes a few seconds to stop, wait until the command finishes.
- Do not add `-v` unless you intentionally want to delete saved database data.

---

## 23. Start it again later

1. Open Docker Desktop and wait until it is running.
2. Open Terminal or PowerShell.
3. Use `cd` to enter the project root.
4. Start the existing images:

```sh
docker compose up
```

Keep that terminal open while using the app.

Use a rebuild after source-code changes, Dockerfile changes, dependency changes,
or after downloading a new version:

```sh
docker compose up --build
```

### Troubleshooting restarting later

- If `docker compose up` says an image is missing, use
  `docker compose up --build`.
- If `.env` changed, recreate the affected containers; the simplest reliable
  method is `docker compose down` followed by `docker compose up --build`.
- Saved candidate data should return because it lives in the named volume.

---

## 24. Reset everything

> **WARNING:** The next command permanently deletes the PostgreSQL Docker
> volume and all saved candidate data, candidate notes, statuses, and activity
> history stored in that volume. This cannot be undone unless you have a
> separate backup.

Run this only when you deliberately want a completely empty local database:

```sh
docker compose down -v
```

The next `docker compose up --build` creates a new empty PostgreSQL volume and
runs all migrations again.

### Troubleshooting reset behavior

- If candidates still appear after a reset, confirm you ran the command from
  the correct project folder and that it reported removing the volume.
- If you did not intend to delete data, stop immediately. Do not run this
  command “just to troubleshoot.” Use logs first.

---

## 25. Update the application

### If you use Git

1. Stop Recruitment AI with `docker compose down`.
2. Open a terminal in the project root.
3. Download repository updates:

```sh
git pull
```

4. Rebuild and start the updated application:

```sh
docker compose up --build
```

Database migrations run automatically during API startup.

### If you use a ZIP file

1. Do not delete your current project until you understand the update package.
2. Download the new ZIP.
3. Extract it to a separate folder.
4. Preserve your private `.env` values.
5. Follow any update instructions supplied with that version.
6. Do not copy old `node_modules` or `dist` folders into the new version.
7. Run `docker compose up --build` from the updated project root.

The Docker named volume is managed separately from normal project files, but
always treat upgrades carefully when important data exists.

### Troubleshooting updates

- If `git pull` reports local changes, do not delete files blindly. Ask the
  repository maintainer how to preserve your changes.
- If the updated code does not appear, make sure you used `--build`.
- If migrations fail, inspect `docker compose logs api` before resetting data.

---

## 26. Common troubleshooting

Always run the commands below from the project root unless stated otherwise.

### Docker is not running

**Likely cause:** Docker Desktop is closed or still starting.

**Fix:**

1. Open Docker Desktop.
2. Wait until it says Docker is running.
3. Run:

```sh
docker compose up --build
```

### Port 5173 is already in use

**Likely cause:** Another web development server or another Recruitment AI
instance is using the frontend port.

**Fix:**

1. Stop other Recruitment AI containers:

```sh
docker compose down
```

2. Close other developer servers or applications using port 5173.
3. Start Recruitment AI again.

On Mac, this optional command shows the program using the port:

```sh
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

On Windows PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 5173 | Select-Object OwningProcess
```

### Port 3000 is already in use

**Likely cause:** A manually started API or another application is using the
backend port.

**Fix:** stop the other application, then run `docker compose up --build`
again.

Mac check:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Windows PowerShell check:

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

### Port 5432 is already in use

**Likely cause:** PostgreSQL is already installed and running directly on the
computer.

**Fix option 1:** stop the other PostgreSQL application.

**Fix option 2:** change only the host port in `.env`:

```env
POSTGRES_PORT=5433
```

Then run `docker compose down` followed by `docker compose up --build`. The API
still talks to PostgreSQL on its correct internal Docker port.

### The application page does not open

**Likely cause:** the web container is stopped, still starting, or port 5173 is
blocked.

**Fix:**

```sh
docker compose ps
```

Then inspect:

```sh
docker compose logs web
```

Confirm the address is exactly `http://localhost:5173`.

### API health fails

**Likely cause:** the API did not start or cannot connect to PostgreSQL.

**Fix:**

```sh
docker compose logs api
```

Then check PostgreSQL:

```sh
docker compose logs postgres
```

### PostgreSQL is unhealthy

**Likely causes:** a missing password, an existing volume created with a
different password, a port conflict, or damaged local Docker state.

**Fix:**

1. Confirm `POSTGRES_PASSWORD` is not empty in `.env`.
2. Check `docker compose logs postgres`.
3. If you changed the password after the database volume was first created,
   either restore the original password or deliberately reset the volume.
4. Use `docker compose down -v` only after accepting the permanent-data warning
   in Section 24.

### Migrations fail

**Likely cause:** PostgreSQL is unavailable or the database credentials do not
match the existing volume.

**Fix:** inspect API and PostgreSQL logs. If the API is running and you need to
retry the existing migration script, run:

```sh
docker compose exec api pnpm db:migrate
```

Do not use `sequelize.sync()` and do not edit migration records manually.

### AI provider API key is missing

**Likely cause:** `USE_MOCK_AI=false`, but the key for the selected
`AI_PROVIDER` is empty.

**Fix option 1:** if `AI_PROVIDER=groq`, add `GROQ_API_KEY`. If
`AI_PROVIDER=openai`, add `OPENAI_API_KEY`. You do not need the other key.

**Fix option 2:** use mock mode:

```env
USE_MOCK_AI=true
```

Then recreate the API container:

```sh
docker compose up -d --force-recreate api
```

### Groq or OpenAI API error

**Likely causes:** an invalid key, rate limit, quota problem, unsupported model,
or internet problem.

**Fix:**

1. Confirm `AI_PROVIDER` is `groq` or `openai`.
2. For Groq, confirm `GROQ_MODEL=openai/gpt-oss-20b` and check the key in
   Groq Console.
3. For OpenAI, confirm `OPENAI_MODEL=gpt-5.6` and check the selected project's
   API key and billing in the OpenAI platform.
4. Do not repeatedly retry rate-limit or quota errors.
5. Switch to mock mode while diagnosing.
6. Inspect `docker compose logs api`. The application does not print keys.

### Mock mode versus real mode is confusing

- `USE_MOCK_AI=true`: predictable scoring and drafting; neither Groq nor
  OpenAI is called. Public-web enrichment is unavailable in this mode.
- `USE_MOCK_AI=false`: real AI uses only the provider selected by
  `AI_PROVIDER`; only its key is required.
- Public-web **Enrich** uses the selected provider's supported web-search
  adapter. If that capability is unavailable, the imported candidate remains
  visible and unsaved.

After changing the setting, recreate the API container.

### Chrome extension is not visible

**Likely cause:** it is not loaded or not pinned.

**Fix:** open `chrome://extensions`, turn on Developer mode, load
`recruitment-ai/apps/extension`, then use the puzzle-piece menu to pin it.

### Extension says the page is unsupported

**Likely cause:** the active tab is not an exact supported Google search page.

**Fix:** start Google / LinkedIn search from Recruitment AI, remain on the
resulting `https://www.google.com/search...` tab, reload it, and reopen the
extension.

### Extension reports a CORS or import error

**Likely cause:** `CHROME_EXTENSION_ORIGIN` is missing, incorrect, or was not
loaded into the current API container.

**Fix:** copy the ID again, update `.env`, and run:

```sh
docker compose up -d --force-recreate api
```

Then confirm `http://localhost:3000/health` works.

### Google opens but no LinkedIn profiles are found

**Likely cause:** no visible result has a `linkedin.com/in/` link, the query is
too restrictive, or Google changed the visible result markup.

**Fix:** remove some skills or exclusions, search again, confirm LinkedIn
profile results are visibly present, reload the page, and reopen the extension.
The extension does not scan additional result pages automatically.

### Imported candidates do not appear

**Likely causes:** import failed, the API is unavailable, or the temporary
30-minute session expired.

**Fix:**

1. Confirm the extension says **Import successful**.
2. Confirm Recruitment AI opens with an `importSession` value briefly in its
   address.
3. Check `http://localhost:3000/health`.
4. Re-import if more than 30 minutes passed.
5. Inspect `docker compose logs api`.

### Excel download fails

**Likely causes:** no candidates are selected, Chrome blocked the download, or
the API returned an error.

**Fix:** select rows, allow downloads from localhost, retry once, and inspect
`docker compose logs api`.

### CV upload fails

**Likely causes:** wrong file type, file larger than 10 MB, more than 20 files,
or unreadable content.

**Fix:** use real `.pdf` or `.docx` files, reduce file size/count, and check API
logs. A filename ending in `.pdf` is not enough if the file is not actually a
PDF.

### PDF or DOCX is reported as unsupported

- Use `.pdf`, not an image renamed to `.pdf`.
- Use modern `.docx`, not older `.doc`.
- Make sure the browser reports the correct file type.
- Try opening the file normally to confirm it is not corrupted.

### Browser cache problem

**Likely cause:** Chrome has an older frontend file cached.

Hard-refresh the page:

- Mac: press **Command + Shift + R**.
- Windows: press **Control + Shift + R**.

If needed, close the Recruitment AI tab, rebuild with
`docker compose up --build`, and reopen `http://localhost:5173`.

---

## 27. Docker troubleshooting commands

Run these from the project root.

### Show container status

```sh
docker compose ps
```

This shows whether `web`, `api`, and `postgres` are running. The API and
PostgreSQL services have health checks.

### Show combined logs

```sh
docker compose logs
```

This shows recent messages from all services.

### Show only API logs

```sh
docker compose logs api
```

Use this for database connection, migration, upload, AI-provider, export, or API
problems.

### Show only frontend/nginx logs

```sh
docker compose logs web
```

Use this when `http://localhost:5173` does not open or `/api` proxy requests
fail.

### Show only PostgreSQL logs

```sh
docker compose logs postgres
```

Use this when the database is unhealthy or authentication fails.

### Restart the API process

```sh
docker compose restart api
```

This is useful after a temporary API problem. It does not normally reload
changed `.env` values; recreate the container for environment changes.

### Restart the web container

```sh
docker compose restart web
```

Use this after a temporary nginx problem. Source changes still require a build.

### Stop containers without deleting database data

```sh
docker compose down
```

### Build and start everything

```sh
docker compose up --build
```

### Troubleshooting Docker commands

- “No configuration file provided” means the terminal is not in the project
  root.
- “Cannot connect to Docker daemon” means Docker Desktop is not running.
- Add `--no-color` to a logs command if copied log text contains strange color
  characters, for example `docker compose logs api --no-color`.

---

## 28. Data and privacy explanation

- Uploaded CV files are stored only temporarily while the API reads them.
- Temporary CV files are deleted after processing, including failed parsing.
- Extracted CV text is not saved in PostgreSQL.
- Candidate Database records are persistent.
- Candidate notes, statuses, and recorded activities are persistent for saved
  candidates.
- PostgreSQL data lives in the Docker named volume
  `recruitment-ai_postgres_data` under Docker's control.
- `docker compose down` keeps that volume.
- `docker compose down -v` permanently removes it.
- With real AI mode enabled, relevant job, resume, candidate, or drafting data
  is sent only to the provider selected by `AI_PROVIDER` for the requested
  operation.
- Never share `GROQ_API_KEY`, `OPENAI_API_KEY`, or the root `.env` file.
- Google/LinkedIn imports remain temporary until the recruiter clicks a Save
  action.
- The Chrome extension reads only visible results on the current supported
  Google page. It does not read LinkedIn cookies or scrape LinkedIn pages.
- The recruiter controls when candidates are saved and when outreach or an
  interview is marked as sent/invited.

### Privacy troubleshooting

- If you do not want candidate data sent to a real provider, keep
  `USE_MOCK_AI=true`. Provider-backed public enrichment is unavailable in mock
  mode.
- If a key is exposed, revoke it immediately in the relevant provider console.
- Before using real candidate data, follow your organization's privacy,
  retention, and recruiting policies.

---

## 29. Folder overview

These are the important project locations:

- `apps/web` — the React page displayed in Chrome. Docker builds it and nginx
  serves it.
- `apps/api` — the Express API, database connection, candidate services, AI
  services, uploads, exports, and startup logic.
- `apps/extension` — the unpacked Manifest V3 Chrome extension. Load this folder
  directly in Chrome; Docker does not containerize it.
- `apps/api/migrations` — ordered database-change files. The API container runs
  pending migrations before starting.
- `docs` — product, architecture, and planning documentation when present.
- `docker-compose.yml` — describes the `web`, `api`, and `postgres` services,
  ports, environment values, health checks, and database volume.
- `.env` — your private local configuration. You create this file and must not
  share it.
- `.env.example` — the safe configuration template stored with the project.

Other generated folders such as `node_modules` and `apps/web/dist` are not
needed from the host when using Docker and are not copied into images.

### Folder troubleshooting

- If you cannot find `.env.example`, enable hidden-file display because names
  beginning with a dot can be hidden.
- Always select `apps/extension`, not the entire repository, when loading the
  Chrome extension.
- Always run Docker Compose commands from the folder containing
  `docker-compose.yml`.

---

## 30. Quick Start cheat sheet

Use this only after the first-time setup is complete.

### Start

Run from the project root:

```sh
docker compose up
```

### Open

```text
http://localhost:5173
```

### Stop

Run from the project root:

```sh
docker compose down
```

### Rebuild after code or dependency changes

Run from the project root:

```sh
docker compose up --build
```

---

## 31. Full first-time checklist

Use this checklist before deciding that setup is finished:

- [ ] Chrome installed
- [ ] Docker Desktop installed
- [ ] Docker running
- [ ] Project downloaded
- [ ] Terminal or PowerShell opened
- [ ] Terminal is in the `recruitment-ai` project root
- [ ] `.env` created from `.env.example`
- [ ] PostgreSQL password set
- [ ] Groq/OpenAI configured or mock mode enabled
- [ ] `docker compose up --build` succeeded
- [ ] PostgreSQL container is healthy
- [ ] API health page opens
- [ ] Recruitment AI opens at `http://localhost:5173`
- [ ] **API Connected** appears
- [ ] Extension loaded from `apps/extension`
- [ ] Extension pinned in Chrome
- [ ] Extension ID configured in `.env`
- [ ] API container recreated after extension-origin configuration
- [ ] Candidate Sourcing tested
- [ ] Candidate Database tested
- [ ] CV Matching tested
- [ ] Excel export tested
- [ ] Outreach drafting reviewed without automatic sending
- [ ] Interview invitation workflow reviewed

If every relevant box is checked, the local Recruitment AI setup is complete.
