#!/usr/bin/env bash
# Check health of all Turgon services
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Turgon Service Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_service() {
    local name="$1"
    local url="$2"
    local fix="$3"
    if curl -sf "$url" >/dev/null 2>&1; then
        echo "✅ $name: UP"
    else
        echo "❌ $name: DOWN"
        echo "   Fix: $fix"
    fi
}

check_service "Ollama"        "http://localhost:11434/api/version"    "ollama serve &"
check_service "OpenMetadata"  "http://localhost:8585/api/v1/system/config/jwks" "docker compose up -d"
check_service "FastAPI"       "http://localhost:8000/api/health"      "cd backend && uvicorn main:app --reload"
check_service "React Dev"     "http://localhost:5173"                  "cd frontend && npm run dev"
echo ""
