#!/usr/bin/env bash
# Turgon one-command environment bootstrap
# Run from WSL: bash scripts/setup.sh
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Turgon Environment Setup ==="
echo "Repo root: $REPO_ROOT"

# ── 1. Ollama ──────────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    echo ""
    echo "[1/5] Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
else
    echo "[1/5] Ollama already installed: $(ollama --version)"
fi

echo ""
echo "[2/5] Pulling qwen2.5-coder:3b (this may take a few minutes)..."
ollama serve >/dev/null 2>&1 &
OLLAMA_PID=$!
sleep 4
ollama pull qwen2.5-coder:3b
echo "✅ Model ready"

# ── 2. Docker / OpenMetadata ───────────────────────────────────────────────
echo ""
echo "[3/5] Starting OpenMetadata via Docker Compose..."
cd "$REPO_ROOT"
docker compose up -d

echo "Waiting for OpenMetadata to be ready (up to 3 minutes)..."
SECONDS=0
until curl -sf http://localhost:8585/api/v1/system/config/jwks >/dev/null 2>&1; do
    if [ $SECONDS -ge 180 ]; then
        echo "❌ OpenMetadata did not start within 3 minutes. Check: docker compose logs"
        exit 1
    fi
    printf "."
    sleep 5
done
echo ""
echo "✅ OpenMetadata is up → http://localhost:8585"

# ── 3. Python dependencies ─────────────────────────────────────────────────
echo ""
echo "[4/5] Installing Python dependencies..."
cd "$REPO_ROOT/backend"
pip install -r requirements.txt --quiet
echo "✅ Python packages installed"

# ── 4. Environment file ────────────────────────────────────────────────────
echo ""
echo "[5/5] Creating .env from template..."
if [ ! -f "$REPO_ROOT/backend/.env" ]; then
    cp "$REPO_ROOT/backend/.env.example" "$REPO_ROOT/backend/.env"
    echo "✅ Created backend/.env"
    echo ""
    echo "⚠️  IMPORTANT: Set OPENMETADATA_JWT_TOKEN in backend/.env"
    echo "   → Login to http://localhost:8585 (admin/admin)"
    echo "   → Settings → Bots → ingestion-bot → copy JWT token"
else
    echo "⚠️  backend/.env already exists — skipped"
fi

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
echo "  ✅ Turgon bootstrapped successfully!"
echo "══════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Edit backend/.env → set OPENMETADATA_JWT_TOKEN"
echo "  2. WSL terminal:     cd $REPO_ROOT/backend"
echo "                       uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo "  3. Windows terminal: cd turgon/frontend"
echo "                       npm install && npm run dev"
echo ""
