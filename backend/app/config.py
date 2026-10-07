import os
from pathlib import Path
from dotenv import load_dotenv

# Search for .env in current, root, and parent directories
base_dir = Path(__file__).resolve().parent.parent.parent
env_candidates = [
    base_dir / ".env",
    Path.cwd() / ".env",
    Path.cwd().parent / ".env",
]

env_loaded = False
for env_path in env_candidates:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        print(f"INFO: Loaded environment variables from {env_path}")
        env_loaded = True
        break

if not env_loaded:
    print("INFO: No .env file found, using system environment variables.")

# Database Configuration
RAW_DB_URL = os.getenv("DATABASE_URL", "").strip('"').strip("'")
DB_HOST = os.getenv("DB_HOST", "aws-1-ap-south-1.pooler.supabase.com")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "postgres.ftiibvtqebzlgfgdehbs")
DB_PASS = os.getenv("DB_PASS", "")

if RAW_DB_URL and RAW_DB_URL.startswith("postgresql://"):
    try:
        clean_url = RAW_DB_URL[len("postgresql://"):]
        at_idx = clean_url.rfind("@")
        if at_idx > 0:
            creds = clean_url[:at_idx]
            host_port_db = clean_url[at_idx + 1:]
            if ":" in creds:
                DB_USER, DB_PASS = creds.split(":", 1)
            if "/" in host_port_db:
                host_port, db = host_port_db.split("/", 1)
                DB_NAME = db
                if ":" in host_port:
                    DB_HOST, DB_PORT = host_port.split(":", 1)
                else:
                    DB_HOST = host_port
                    DB_PORT = "5432"
    except Exception as e:
        print(f"WARNING: Failed to parse DATABASE_URL: {e}")

# Supabase Credentials
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip('"').strip("'")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip('"').strip("'")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "resumes").strip('"').strip("'")

# Security / JWT
JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_random_string_min_32_characters_long_for_security").strip('"').strip("'")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_SECONDS = 7 * 24 * 60 * 60  # 7 days

# Gemini AI API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip('"').strip("'")

# Email Settings
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USER = os.getenv("EMAIL_USER", "")
EMAIL_PASS = os.getenv("EMAIL_PASS", "")

# Server
PORT = int(os.getenv("PORT", "8080"))
APP_URL = os.getenv("APP_URL", f"http://localhost:{PORT}")
