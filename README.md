# Journal Intelligence Dashboard

<img width="2752" height="1536" alt="Gemini_Generated_Image_3b56l73b56l73b56-2" src="https://github.com/user-attachments/assets/78969733-d9c0-4a5e-95f7-3cb3cfec9cfb" />


> *I built this for myself - while going through it. Maybe it helps you too.*

---

> ⚠️ **VERY EARLY BETA** - This project is actively being developed. Things may break, APIs may change, and some features are still being wired up. That said, the core is solid and running in production. Use it, break it, open issues. Screenshots, setup guides, and full documentation are on the way.
>
> 📸 **Coming soon:** Screenshots of every page.

---

There's a certain kind of pain that's hard to explain to people. The kind where you're not sure if you're overreacting. Where you've been told your memory is wrong so many times you start to believe it. Where you look back at months or years of your life and wonder - was that real? Did that actually happen the way I remember?

I started journaling as a way to hold onto reality. To document things. To have a record that existed outside of my own head, one that couldn't be rewritten by someone else.

And then I thought - what if my journal could actually *talk back*? What if instead of just writing into a void, the things I was processing could be understood, tracked, reflected back at me in ways that helped me see the bigger picture?

That's what this is. A privacy-first, self-hosted journal intelligence system. Built by someone in the middle of it, for anyone else who needs it.

---

## What It Does

You write. The system listens - and thinks.

Journal entries come in as plain text files, straight from your iPhone via Shortcuts, or written directly in the browser. From there, AI extracts mood, emotional severity, key events, people mentioned, and recurring topics. But it doesn't stop at data. It builds a living picture of you over time.

---

## Features

### 📖 Timeline
Your entries, beautifully laid out. Mood scores visualized as a sparkline. Severity tracked over time. A **Living Master Summary** that sits at the top and evolves with every new entry - a constantly updated portrait of where you are and what you've been going through.

---

### ✎ Write & Import — Direct from the Browser
No iPhone required. The dashboard includes a full in-browser journal workspace accessible from the sidebar or the Write banner on the Timeline.

**Write mode** — A premium editorial workspace. Cormorant Garamond serif, ruled-line texture, deep amber palette. Just you and a blank page. Pick the date, write freely, hit Save. The full AI pipeline runs immediately — mood, severity, events, master summary update — identical to what happens when you upload from an iPhone Shortcut.

**Import mode** — Drag and drop `.txt` or `.html` files (Day One exports, Apple Journal exports, anything plain text) directly into the browser. Drop multiple files at once. Each one processes through the full pipeline sequentially. Status tracks per-file in real time — Queued, Processing, Saved, Duplicate, or Failed.

Both modes are JWT-authenticated and user-scoped. Everything lands on your Timeline with full AI extraction, just like Shortcut uploads.

---

### 🧠 Multi-Tone Reflections
This one is special. The system can reflect your last 14 days back at you in **six completely different voices**:

- **Therapist** - clinical, grounding, pattern-aware
- **Best Friend** - warm, honest, no BS
- **Coach** - direct, action-oriented, forward-focused
- **Mentor** - wisdom-forward, big picture thinking
- **Inner Critic** - the voice in your head, surfaced so you can examine it
- **Chaos Agent** *(18+)* - unfiltered, darkly funny, says the thing nobody else will

Each tone is cached. Switch between them instantly. It's like having a whole support team that actually knows your story.

---

### 〜 Nervous System Tracker
Mood and severity charts over time. Volatility scores. Stability metrics. A visual record of your emotional nervous system - what's dysregulating you, what's helping you stabilize, where the spikes are coming from.

---

### ⬡ Pattern Detection
The system watches for things you might not notice yourself - mood spikes, severity streaks, behavioral loops, emotional cycles. Both rule-based alerts and AI deep-analysis on demand. It doesn't just tell you something is wrong. It tells you *what the pattern looks like* and where it started.

---

### ◎ People & Topics
Every person and topic that shows up in your entries, tracked over time. See who or what is correlated with your worst days. See what actually makes things better. Frequency charts, timelines, relationship dynamics.

---

### ◷ Evidence Vault
Auto-populated from everything the AI extracts - statements, events, admissions, contradictions, observations. Plus manual bookmarks. If you're ever in a situation where you need documentation - for therapy, for legal purposes, for your own memory - it's all here, organized and exportable.

---

### ⊕ Contradiction Detection
If someone in your life says one thing and does another - or if they've said two completely different things at different times - the system finds it. Automatically surfaces contradictions across your entries with AI analysis of what the pattern suggests.

---

### ✦ Personalized Resources
This one I'm proud of. The system reads your onboarding profile, your active pattern alerts, and your 30-day emotional averages - and generates a **personalized resource hub** just for you. Not a generic list of hotlines. Actual ranked support categories with context blurbs explaining *why this applies to your specific situation*. Crisis resources surface automatically when severity warrants it, but quietly - never alarmist, always human.

---

### 🗺 Exit Plan - Your Own Private Workspace
If your journal signals that you might be navigating a major life transition - leaving a relationship, financial instability, housing uncertainty, safety concerns - the system offers to build you something most apps would never touch.

A **personalized, phased exit plan**. Your own private workspace.

It generates a step-by-step plan based entirely on your journal context - five phases from Safety & Documentation through to Stabilization. Each phase has tasks tailored to your situation, a "Today" section that surfaces only what's relevant right now, resource links tied directly to each task, and a private scratchpad that no AI ever reads.

As you journal more, the plan offers incremental updates - new signals, reprioritized tasks, updated resources. You control every change. Nothing gets applied without your say.

It's the thing I wish had existed when I needed it.

---

### ⊞ Clinical Export Packets
Generate PDF export packets in multiple formats - timeline summaries, evidence packets, nervous system reports, full case files with optional redaction. Built with WeasyPrint. Useful for therapy appointments, legal documentation, or just having a record you can hold in your hands.

---

### ⚙ Settings & Memory Profile
A full onboarding flow that builds a memory profile - your situation, relationship context, what you're navigating, your preferred AI tone. All of this gets injected into AI calls so every reflection, every plan, every resource recommendation is actually personalized to *you*.

Per-user AI provider settings. Bring your own Anthropic key, use OpenAI, or run it completely locally with Ollama or LM Studio - zero data leaving your machine.

---

## Privacy First. Always.

Your journal data never touches a third-party server. It lives in a SQLite database on infrastructure you control - either your own VPS or your local machine. The AI calls go to whichever provider you configure, or nowhere at all if you use a local model.

No telemetry. No analytics. No ads. No accounts on servers you don't own.

---

## Deploy Options

### VPS (access from anywhere)
```bash
git clone https://github.com/un1xr00t/journal-intelligence.git
cd journal-intelligence
sudo ./install_vps.sh --domain journal.yourdomain.com
sudo ./security_hardening.sh
```

### Local / Offline (never leaves your machine)
```bash
git clone https://github.com/un1xr00t/journal-intelligence.git
cd journal-intelligence
./install_local.sh
./start.sh
```

Then open `http://localhost:8000`, create your account, and follow the onboarding flow.

---

## Restarting the API

If you're on a VPS and need to restart the backend quickly, there's a convenience script included:

```bash
chmod +x frontend/restartAPI.sh
./frontend/restartAPI.sh
```

This kills any running uvicorn process, clears port 8000, and relaunches the API with the correct PYTHONPATH and worker config. Tail the log after to confirm it came up clean:

```bash
tail -20 logs/api.log
```

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Python / FastAPI |
| Frontend | React + Vite + Tailwind CSS |
| Database | SQLite (WAL mode) |
| AI | Anthropic / OpenAI / Ollama / LM Studio - per-user configurable |
| Auth | JWT + bcrypt + per-user API keys |
| PDF | WeasyPrint |
| Proxy | nginx (VPS) or localhost (local) |

---

## Configuration

> ⚠️ **If you see `/opt/journal-dashboard/` anywhere** in the scripts, config files, or cron examples — replace it with your actual install path. For example if you cloned to `/home/youruser/journal-intelligence/`, use that instead. This path appears in a few places and is specific to the reference VPS setup.

```bash
cp config/config.example.yaml config/config.yaml
nano config/config.yaml
```

Your `config.yaml` is gitignored and never committed. The install scripts auto-generate a JWT secret. Add your AI provider key during onboarding or in Settings - or skip it entirely and use a local model.

---

## Getting Entries In

<img width="904" height="672" alt="Screenshot From 2026-03-09 21-17-26" src="https://github.com/user-attachments/assets/af5c942d-25ee-4ab1-aa65-93c4f1c344a1" />
<img width="903" height="1008" alt="Screenshot From 2026-03-09 21-17-33" src="https://github.com/user-attachments/assets/0e4b3779-9ae8-4c19-93bf-3bbc80b2573d" />

There are two ways to add journal entries. Both run the exact same AI pipeline — mood extraction, severity scoring, key events, master summary update, pattern detection.

### Option 1 — Write or Import Directly in the Browser

Click **Write** in the sidebar or the banner on the Timeline page.

**To write a new entry:**
1. Choose the **✦ Write** tab
2. Select the date (defaults to today)
3. Write freely in the editor
4. Hit **✦ Save Entry** or press **⌘S**
5. The AI processes it immediately — mood, severity, and a summary appear on the success screen

**To import existing files:**
1. Choose the **⊞ Import** tab
2. Drag and drop `.txt` or `.html` files onto the zone, or click to browse
3. Drop as many as you want at once — the system queues and processes them sequentially
4. Watch per-file status update in real time as each one processes

---

### Option 2 — iPhone Shortcut

<img src="https://github.com/user-attachments/assets/c8d9344a-29ff-4086-9c3d-286f545f1c4d" width="350" alt="iPhone Shortcut setup" />

Upload directly from Apple Journal on your iPhone. Your personal API key is generated during onboarding and regeneratable anytime from **Settings → Account → API Key**.

#### Step 1 — Get Your API Key

1. Log into your Journal Intelligence dashboard
2. Go to **Settings** (gear icon in the sidebar)
3. Click the **Account** tab
4. Find the **API Key** section — copy the full key shown there
5. If you don't see it or need a new one, hit **Regenerate** — your new key will display once, so copy it immediately

#### Step 2 — Build the Shortcut

Open the **Shortcuts** app and create a new shortcut. Add these actions in order:

**Action 1 — Select Files**
- Add action: **Select Files**
- Leave defaults (allows you to pick one or multiple files when you run it)

**Action 2 — Repeat with each item in File**
- Add action: **Repeat with each item in**
- Set the input to **File** (the output of the previous step)

**Action 3 — Get Contents of URL**
- Add action: **Get Contents of URL**
- Set the **URL** to:
  ```
  https://your-domain.com/api/upload
  ```
  *(Replace `your-domain.com` with your actual domain)*
- Set **Method** to `POST`
- Expand **Headers** and add two headers:
  | Key | Value |
  |---|---|
  | `X-API-Key` | Your full API key from Step 1 |
  | `X-Filename` | `Repeat Item` *(tap the variable picker, select Repeat Item)* |
- Set **Request Body** to `File`
- Set **File** to `Repeat Item` *(tap the variable picker, select Repeat Item)*

**Action 4 — End Repeat**
- Add action: **End Repeat**

Name the shortcut something like **"Upload to Journal Intelligence"** and save it.

#### Step 3 — Daily Workflow

1. **Write your entry** in the Apple Journal app as normal
2. **Export to iCloud Drive:**
   - Tap the entry → tap the share icon
   - Choose **Export to Files**
   - Navigate to **iCloud Drive → [your journal folder] → entries**
   - If a file with the same name already exists, tap **Replace**
3. **Run the Shortcut:**
   - Open the **Shortcuts** app
   - Tap your **"Upload to Journal Intelligence"** shortcut
   - When the file picker opens, navigate to your entries folder and select the file
   - A single entry typically takes around 20 seconds to fully process
4. Open your dashboard — your entry will be there with mood, severity, and events already extracted

#### Uploading Multiple Entries at Once

- Select multiple files in the file picker when the shortcut runs
- The shortcut loops through each one automatically
- Keep your phone awake and the Shortcuts app in the foreground during bulk uploads

#### Troubleshooting

| Problem | Fix |
|---|---|
| Shortcut returns an error | Double-check your API key is pasted correctly with no extra spaces |
| Entry uploads but no AI data appears | AI extraction runs async — wait 60–90 seconds then refresh |
| File picker doesn't show iCloud Drive | Make sure iCloud Drive is enabled in iOS Settings → [your name] → iCloud |
| 401 Unauthorized error | Your key may have been regenerated — grab a fresh one from Settings → Account |

---

## Backup & Restore

The app includes two scripts for database and derived data backups: `backup_journal.sh` and `restore_journal.sh`. Make them executable after cloning:

```bash
chmod +x backup_journal.sh restore_journal.sh
```

### Automated Backups (VPS)

The backup script uses SQLite's native backup API — safe to run while the app is live. It backs up the database and all derived data (master summaries, user memory, exports), then auto-purges backups older than 14 days.

Set it up as a daily cron job:

```bash
crontab -e
```

Add this line to run at 3am daily:

```
0 3 * * * /path/to/journal-intelligence/backup_journal.sh >> /path/to/journal-intelligence/logs/backup.log 2>&1
```

Backups are stored in `backups/` inside your app root. Each backup consists of two files:
- `journal_backup_YYYYMMDD_HHMMSS.db` — the SQLite database
- `journal_backup_YYYYMMDD_HHMMSS_derived.tar.gz` — summaries, memory profiles, exports

### Restoring from a Backup

```bash
./restore_journal.sh journal_backup_20260304_030000
```

Pass the backup name **without** the file extension. The script will:
1. Stop the API
2. List available backups if you don't pass a name
3. Ask for confirmation before overwriting anything
4. Save a `.pre_restore_*` snapshot of current data before overwriting
5. Restart the API when done

### Pull a Backup to Your Local Machine (VPS users)

```bash
rsync -avz --progress user@your-server:/path/to/journal-intelligence/backups/ ~/journal-backups/
```

---

## Directory Structure

```
journal-intelligence/
├── config/
│   ├── config.example.yaml    ← copy to config.yaml and fill in
│   ├── prompts.yaml           ← all AI prompts, fully editable
│   ├── topics.yaml            ← custom topic categories
│   └── theme.yaml             ← UI theme config
├── src/
│   ├── api/                   ← FastAPI routes
│   ├── auth/                  ← JWT, bcrypt, API keys
│   ├── ingest/                ← file ingestion pipeline
│   ├── nlp/                   ← AI extraction, master summary
│   └── patterns/              ← behavioral pattern detection
├── frontend/src/              ← React source
├── install_vps.sh
├── install_local.sh
└── security_hardening.sh
```

---

## What's Coming

This is early. But the roadmap is ambitious - and I'm not slowing down.

- **Memory injection** - your memory profile actively shapes every AI response, not just onboarding
- **Native iOS & Android app** - a dedicated mobile experience built for this, not a browser wrapper. Write, review, upload, and get reflections from your phone natively
- **Improved export engine** - exports are live and working, but this is getting a serious upgrade: better formatting, more packet types, smarter redaction, and therapist-ready clinical layouts
- **Multi-user support improvements** - better admin tooling, user management, invite flows
- **Deeper pattern intelligence** - longer lookback windows, cross-pattern correlations, predictive mood modeling
- **Community resources** - user-contributed topic configs, prompt packs, theme presets

I have a lot more planned that I'm not ready to talk about yet. If this resonates with you - watch the repo, open issues, or just reach out. This project has a lot of road ahead of it.

---

## For Anyone Who Needs This

If you found this project because you're going through something hard - I see you. You're not crazy. Your memory isn't broken. Writing it down matters.
This tool won't fix anything. But it might help you understand what's happening, document what needs documenting, and feel a little less alone in the process.
That's why I built it.

---

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=whthomas22&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/whthomas22)


## Contributing

Issues and PRs welcome. If something doesn't work on your setup, open an issue - I want this to be deployable by anyone.

---

## License

MIT. Your data is yours. Always.
