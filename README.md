# Turgon — Intelligent Data Dictionary Agent

> Automatically generate AI-powered, business-friendly data dictionaries from your enterprise databases. All processing is on-premise — no data leaves your network.

---

## Architecture

```
Windows Host         WSL2 Environment
┌──────────────┐     ┌────────────────────────────────────────┐
│ React + Vite │────▶│ FastAPI (8000) │ Ollama (11434)        │
│  :5173       │     │ OpenMetadata (8585) via Docker         │
└──────────────┘     └────────────────────────────────────────┘
```

---

## Prerequisites

| Software | Version | Where |
|---|---|---|
| Windows 11 | 21H2+ | Host |
| WSL2 (Ubuntu 22.04) | Latest | Host |
| Docker Desktop | 4.x+ | Host (WSL2 backend enabled) |
| Node.js | 18 LTS | Host |
| Python | 3.10+ | WSL |

---

## Quick Start

### 1. Bootstrap WSL Environment (run once, inside WSL)

```bash
cd /mnt/c/Users/gouth/Downloads/datafabric/turgon
bash scripts/setup.sh
```

This installs Ollama, pulls `qwen2.5-coder:3b`, starts OpenMetadata via Docker, and installs Python dependencies.

### 2. Start Backend (WSL terminal)

```bash
cd /mnt/c/Users/gouth/Downloads/datafabric/turgon/backend
cp .env.example .env
# Edit .env: Set OPENMETADATA_JWT_TOKEN from OpenMetadata UI → Settings → Bots
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start Frontend (Windows terminal)

```bash
cd C:\Users\gouth\Downloads\datafabric\turgon\frontend
npm install
npm run dev
# → http://localhost:5173
```

### 4. Verify Everything

```bash
# In WSL
bash scripts/check_services.sh
```

### 5. Seed Demo Data (optional)

```bash
# In WSL (backend directory)
python ../scripts/seed_demo_db.py
```

---

## Getting OpenMetadata JWT Token

1. Open `http://localhost:8585`
2. Login with `admin` / `admin`
3. Navigate to **Settings → Bots → ingestion-bot**
4. Copy the JWT token → paste into `backend/.env` as `OPENMETADATA_JWT_TOKEN`

---

## Project Structure

```
turgon/
├── backend/        FastAPI + LangChain backend (run in WSL)
├── frontend/       React + Vite frontend (run on Windows)
├── scripts/        Setup and utility scripts
├── docker-compose.yml   OpenMetadata stack
└── docs/           (see ../docs/ — the 12 spec documents)
```

---

## Team

| Role | Owner |
|---|---|
| Frontend Developer (Lead) | Shreedeep M |
| Backend Developer | Madana G S |
| UI/UX Design | Goutham R |
| Database Handler | Sanjay D N |
