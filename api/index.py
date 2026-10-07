import os
import sys
from pathlib import Path

# Ensure root and backend directories are in Python path
current_dir = Path(__file__).resolve().parent
root_dir = current_dir.parent
backend_dir = root_dir / "backend"

for path in [str(backend_dir), str(root_dir)]:
    if path not in sys.path:
        sys.path.insert(0, path)

# Import the FastAPI ASGI app from backend
from app.main import app

# Export app for Vercel Serverless Function
