# Journal Intelligence Dashboard

> *I built this for myself - while going through it. Maybe it helps you too.*

---

> ⚠️ **VERY EARLY BETA** - This project is actively being developed. Things may break, APIs may change, and some features are still being wired up. That said, the core is solid and running in production. Use it, break it, open issues. Screenshots, setup guides, and full documentation are on the way.
>
> 📸 **Coming soon:** Screenshots of every page, plus a full step-by-step guide for setting up the iPhone Shortcut so you can upload journal entries directly from your phone.
>
> 📤 **In the works:** Direct upload from the web dashboard - paste or drop an entry straight from your browser without needing the Shortcut.

---

There's a certain kind of pain that's hard to explain to people. The kind where you're not sure if you're overreacting. Where you've been told your memory is wrong so many times you start to believe it. Where you look back at months or years of your life and wonder - was that real? Did that actually happen the way I remember?

I started journaling as a way to hold onto reality. To document things. To have a record that existed outside of my own head, one that couldn't be rewritten by someone else.

And then I thought - what if my journal could actually *talk back*? What if instead of just writing into a void, the things I was processing could be understood, tracked, reflected back at me in ways that helped me see the bigger picture?

That's what this is. A privacy-first, self-hosted journal intelligence system. Built by someone in the middle of it, for anyone else who needs it.

---

## What It Does

You write. The system listens - and thinks.

Journal entries come in as plain text files (or straight from your iPhone via Shortcuts). From there, AI extracts mood, emotional severity, key events, people mentioned, and recurring topics. But it doesn't stop at data. It builds a living picture of you over time.

---

## Features

### 📖 Timeline
Your entries, beautifully laid out. Mood scores visualized as a sparkline. Severity tracked over time. A **Living Master Summary** that sits at the top and evolves with every new entry - a constantly updated portrait of where you are and what you've been going through.

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

```bash
cp config/config.example.yaml config/config.yaml
nano config/config.yaml
```

Your `config.yaml` is gitignored and never committed. The install scripts auto-generate a JWT secret. Add your AI provider key during onboarding or in Settings - or skip it entirely and use a local model.

---

## iPhone Shortcut Integration *(screenshot of Settings coming soon)*

This is currently how entries get in - straight from your iPhone. The ingest endpoint accepts plain text or HTML files via `POST /api/upload` with your personal API key in the header. Your key is generated during onboarding, shown once, and stored as a hash - regeneratable anytime from Settings. A full step-by-step Shortcut setup guide is coming soon.

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

- **Direct web upload** - paste or drop journal entries straight from the browser, no Shortcut needed
- **Memory injection** - your memory profile actively shapes every AI response, not just onboarding
- **Docker support** - one `docker-compose up` and you're running, no manual install needed
- **Mobile-optimized UI** - write and review from your phone without the Shortcut
- **Multi-user support improvements** - better admin tooling, user management, invite flows
- **Deeper pattern intelligence** - longer lookback windows, cross-pattern correlations, predictive mood modeling
- **Therapist export mode** - structured session prep packets formatted for clinical handoff
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
