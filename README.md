# Smart Student Placement Manager (AI-Powered)
### Python FastAPI & Supabase Enterprise Edition

An enterprise-grade, AI-powered placement and internship tracker platform. The application is built with a high-performance **Python FastAPI** backend, connects to a **Supabase PostgreSQL** database, utilizes **Supabase Storage** for PDF resume uploads, and integrates with **Google Gemini AI** for automated skill badging and personalized 30-day learning curricula.

The frontend is a premium, responsive **Glassmorphism UI** served directly by the FastAPI web server.

> 💡 **First time setting up? Cloning from GitHub?**  
> Check out the complete step-by-step beginner guide: **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for 3-minute Supabase setup and 1-click Windows launch instructions!

---

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Environment Configuration](#environment-configuration)
4. [Automatic Database Initialization](#automatic-database-initialization)
5. [Running the Application Locally](#running-the-application-locally)
6. [Deployment to Production](#deployment-to-production)
7. [Project Structure](#project-structure)
8. [Default Credentials](#default-credentials)

---

## System Architecture

The application is structured as a single, cohesive deployment:
*   **Python FastAPI Backend (`backend/`)**: Exposes clean, JWT-secured REST APIs under `/api/*`, provides interactive Swagger UI at `/docs`, and serves static web pages and assets (`public/`).
*   **Static Glassmorphism Frontend (`public/`)**: Modern UI featuring responsive views for students (`dashboard.html`), placement officers (`admin.html`), registration, login, and password recovery.
*   **Database (Supabase PostgreSQL)**: Relational data model mapping students, internships, applications, and skill quizzes using native UUID primary/foreign keys.
*   **Storage (Supabase Storage)**: A dedicated `resumes` bucket safely storing student resume PDFs with secure direct links.
*   **AI (Google Gemini)**: Generates dynamic skill-verification multiple-choice quizzes and tailored 30-day learning roadmaps (with YouTube and tutorial references) based on skill gap analysis. Includes an offline fallback question engine for 15+ technologies.
*   **Resume Parser**: Automated PDF text extraction (`pypdf`) and regex skill matcher cross-referenced against the master skills catalog.

---

## Technology Stack

*   **Backend**: Python 3.9+, FastAPI, Uvicorn (ASGI server), Pydantic v2
*   **Database**: PostgreSQL / Supabase, `psycopg2` threaded connection pooling
*   **Security**: Stateless JWT (`python-jose`), BCrypt password hashing (10 salt rounds)
*   **Frontend**: HTML5, CSS3 (Glassmorphism design system), Vanilla ES6 JavaScript (Fetch API client)
*   **AI Integration**: Google Gemini AI (Pro & Flash models) with offline local MCQ question banks
*   **PDF Extraction**: `pypdf` for fast, lightweight in-memory PDF parsing and skill detection
*   **Documentation Generator**: ReportLab 5.0 for dynamic enterprise PDF reports

---

## Environment Configuration

Create a `.env` file in the root folder of the project (or copy `.env.example`). The backend automatically parses these settings at startup:

```env
# Server Port (Default: 3000 or 8080)
PORT=3000

# Database Connection (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.your_project_ref:your_password@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"

# Supabase Storage & Key Credentials
SUPABASE_URL="https://your_project_ref.supabase.co"
SUPABASE_KEY="your_supabase_service_role_key"
SUPABASE_BUCKET="resumes"

# Security (JWT Signature Secret - min 32 characters)
JWT_SECRET="f0141710-2155-479a-8864-7989e837b9e4"

# Google Gemini AI Key (from Google AI Studio)
GEMINI_API_KEY="your_gemini_api_key_here"

# Email Configuration (SMTP for Password Recovery)
EMAIL_USER="your_email@gmail.com"
EMAIL_PASS="your_smtp_app_password"
```

---

## Automatic Database Initialization

The backend features **Automatic Self-Bootstrapping**:
1. When you start the application with a fresh Supabase database, it automatically executes `supabase_setup.sql` to create all required tables (`users`, `skills`, `internships`, `applications`, `quiz_attempts`), constraints, and indexes.
2. It seeds the master catalog of 160+ industry skills.
3. If no administrator exists, it automatically provisions the default administrator account.
4. If no internships are found, it seeds initial job postings from Google, Microsoft, Amazon, Meta, and TCS.

---

## Running the Application Locally

### Method A: Super-Smart One-Click Runner (Windows)
Double-click `run.bat` in the root folder.
* Automatically verifies if Python is installed (downloads & installs it silently if missing).
* Automatically creates a clean `.venv` virtual environment.
* Automatically installs all dependencies (`pip install -r backend/requirements.txt`).
* Automatically verifies database tables and master seed data.
* Automatically opens your default web browser to `http://localhost:3000/index.html`.

### Method B: One-Click Runner (macOS / Linux)
Open a terminal in the root folder:
```bash
chmod +x run.sh
./run.sh
```

### Method C: Manual Python CLI
```bash
# 1. Create and activate virtual environment
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 2. Install dependencies
pip install -r backend/requirements.txt

# 3. Start the application
python backend/run.py
```

### Method D: Docker Compose
```bash
docker compose up --build
```
Access at: `http://localhost:3000/index.html` (or `http://localhost:8080/index.html`).

---

## Deployment to Production

### Option 1: Railway.app / Render.com
1. Push your repository to GitHub.
2. Create a new service on **Render** or **Railway**.
3. Set the build command:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. Set the start command:
   ```bash
   python backend/run.py
   ```
5. Add your environment variables from `.env` in the platform settings.
6. Deploy! The frontend dynamically adapts to the host URL without any code modifications.

### Option 2: Docker Container
Build and run the containerized application on any cloud host (AWS ECS, GCP Cloud Run, DigitalOcean, Azure):
```bash
docker build -t placement-tracker .
docker run -p 8080:8080 --env-file .env placement-tracker
```

---

## Project Structure

```
placement-tracker/
├── backend/                          # Python FastAPI backend
│   ├── app/
│   │   ├── routers/                  # API endpoints
│   │   │   ├── auth.py               # Register, login, reset-password, me
│   │   │   ├── internships.py        # Opportunities, matching ratio, search
│   │   │   ├── applications.py       # Apply, student applications, stats
│   │   │   ├── profile.py            # Profile details, PDF resume parsing
│   │   │   ├── skills.py             # Skill quiz verification & history
│   │   │   ├── ai.py                 # Gemini quiz generation & 30-day gap roadmaps
│   │   │   └── admin.py              # Leaderboard composite rankings & student management
│   │   ├── services/                 # Business logic services
│   │   │   ├── ai_service.py         # Gemini AI & offline question bank
│   │   │   ├── storage_service.py    # Supabase Storage PDF uploader
│   │   │   └── email_service.py      # SMTP password reset mailer
│   │   ├── auth.py                   # JWT security & BCrypt utilities
│   │   ├── config.py                 # Environment & connection URL parser
│   │   ├── database.py               # PostgreSQL connection pooling & skill normalizer
│   │   ├── init_db.py                # Database self-bootstrapping & seeder
│   │   └── main.py                   # FastAPI app, static routes, and CORS setup
│   ├── run.py                        # Server launch script
│   └── requirements.txt              # Python package dependencies
├── public/                           # Static Frontend Glassmorphism UI
│   ├── css/                          # Custom design stylesheets
│   ├── js/                           # Frontend controllers (auth, dashboard, config)
│   ├── index.html                    # Student & Admin Login
│   ├── register.html                 # Student Registration
│   ├── dashboard.html                # Student Portal (Opportunities, Profile, Badges)
│   ├── admin.html                    # Officer Portal (Rankings, Job Post, Applications)
│   └── reset-password.html           # Password Recovery
├── supabase_setup.sql                # Complete Supabase DDL & seed script
├── run.bat                           # Super-smart Windows launcher
├── run.sh                            # macOS/Linux launcher
├── Dockerfile                        # Multi-arch Docker container specification
├── docker-compose.yml                # Docker Compose setup
├── Documentation.html                # Interactive User & Officer Guide
├── Placement_Tracker_Documentation.pdf # Enterprise PDF Documentation
└── README.md                         # This file
```

---

## Default Credentials

* **Student Demo Account**: Register a new student via `register.html` or use an existing student login.
* **Administrator Account**:
  * Email: `admin@placementtracker.com`
  * Password: `Admin@123`
* **Interactive API Documentation**: Visit `http://localhost:3000/docs` (Swagger UI) or `http://localhost:3000/redoc`.
