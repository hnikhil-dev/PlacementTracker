#!/usr/bin/env bash
set -e

echo "======================================================="
echo "   Starting Smart Placement Tracker Application"
echo "   Tech Stack: Python FastAPI + Supabase PostgreSQL"
echo "======================================================="

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. Check .env
if [ ! -f .env ]; then
    echo "[WARNING] .env file not found in root folder!"
    if [ -f .env.example ]; then
        echo "[INFO] Copying .env.example to .env as starting template..."
        cp .env.example .env
        echo "[IMPORTANT] Please check .env and add your Supabase credentials."
    fi
    echo ""
fi

# Extract PORT from .env
APP_PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d ' "\r' || echo "8080")
if [ -z "$APP_PORT" ]; then
    APP_PORT="8080"
fi

# 2. Check Python 3
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "[ERROR] Python 3 is not installed or not in PATH."
    echo "Please install Python 3.9+:"
    echo "  macOS:  brew install python3"
    echo "  Ubuntu: sudo apt update && sudo apt install -y python3 python3-pip python3-venv"
    exit 1
fi

# 3. Setup Virtual Environment
if [ ! -d ".venv" ]; then
    echo "[INFO] Creating Python virtual environment (.venv)..."
    $PYTHON_BIN -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# 4. Install Dependencies
echo "[INFO] Installing required dependencies..."
pip install -r backend/requirements.txt --disable-pip-version-check

# 5. Launch Application
echo ""
echo "======================================================="
echo "Application is ready!"
echo "Web Application: http://localhost:${APP_PORT}/index.html"
echo "Admin Portal:    http://localhost:${APP_PORT}/admin.html"
echo "API Docs:        http://localhost:${APP_PORT}/docs"
echo "======================================================="
echo ""

# Try opening default browser in background
if command -v xdg-open >/dev/null 2>&1; then
    (sleep 2 && xdg-open "http://localhost:${APP_PORT}/index.html") &
elif command -v open >/dev/null 2>&1; then
    (sleep 2 && open "http://localhost:${APP_PORT}/index.html") &
fi

python backend/run.py
