import os
import sys
import uvicorn

# Ensure the backend directory is in python search path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from app.config import PORT

if __name__ == "__main__":
    print("=======================================================")
    print("Starting Smart Placement Tracker (Python FastAPI)...")
    print(f"Server URL:  http://localhost:{PORT}")
    print(f"Web App:     http://localhost:{PORT}/index.html")
    print(f"API Docs:    http://localhost:{PORT}/docs")
    print("=======================================================")
    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT, reload=False)
