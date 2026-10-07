# 🚀 Complete Setup & Client Handover Guide
### Smart Student Placement Tracker (FastAPI + Supabase)

Welcome! This guide explains **everything** needed to set up and run the Smart Placement Tracker from scratch—even on a brand new laptop with **zero tools installed**, no Python, and no existing database.

---

## ⚡ Quick Summary (The 3-Minute Routine)

If you are on Windows, the launcher script (`run.bat`) is **fully autonomous**:
1. **Double-click `run.bat`**.
2. If Python is missing, it **automatically downloads and installs Python** for you.
3. It creates an isolated virtual environment (`.venv`) and installs all dependencies.
4. It detects if `.env` needs your database link and guides you to paste it.
5. It **automatically creates all database tables, 160+ skills, and default admin**.
6. It automatically opens your browser to `http://localhost:3000`.

---

## 📋 Step-by-Step Setup Guide

---

### Step 1: Create a Free Supabase Database (Takes 2 Minutes)

The project uses **Supabase** (an open-source cloud PostgreSQL database). A free tier account is completely free and requires no credit card.

1. **Sign Up:**
   - Go to [https://supabase.com](https://supabase.com) and click **Start your project** (or Log In with GitHub / Google / Email).
2. **Create New Project:**
   - In the Supabase Dashboard, click **New project**.
   - Choose your Organization.
   - **Name:** Enter `placement-tracker` (or any name you like).
   - **Database Password:** Enter a strong password (e.g., `MyPlacementDb2026!`).  
     ⚠️ **CRITICAL:** Write down or copy this password! You will need it in your connection string.
   - **Region:** Choose the region closest to you (e.g., `South Asia (Mumbai)` or `Central EU`).
   - Click **Create new project**. Supabase will spend ~60 seconds setting up your database.

---

### Step 2: Copy Your Database Connection String (`DATABASE_URL`)

Once your Supabase project shows **Active**:

1. In the left-hand sidebar, click the **Settings (gear icon ⚙️)** at the very bottom.
2. Under "Project Settings", click **Database**.
3. Scroll down to the **Connection string** section.
4. Click on the **URI** tab.
5. You will see a connection string like this:
   ```text
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   ```
   *(Or direct mode: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`)*
6. Copy this string and replace `[YOUR-PASSWORD]` with the password you created in Step 1.
   > **Example:**  
   > If your password was `Pass1234!` and host was `aws-0.pooler.supabase.com`, your URL is:  
   > `postgresql://postgres.xyz:Pass1234!@aws-0.pooler.supabase.com:6543/postgres`

---

### Step 3: Copy Your API Keys (`SUPABASE_URL` & `SUPABASE_KEY`)

1. Still in **Project Settings (⚙️)**, click **API** in the sidebar.
2. Find **Project URL**:
   - Copy the URL (looks like: `https://xxxxxxxxxxxxxxxx.supabase.co`).
3. Find **Project API keys**:
   - Copy the `anon` (public) key OR the `service_role` (secret) key.

---

### Step 4: Create the Storage Bucket for PDF Resumes

To allow students to upload and download PDF resumes:

1. In the left sidebar of Supabase, click **Storage (folder icon 📁)**.
2. Click **New bucket**.
3. **Bucket Name:** Type exactly `resumes` (all lowercase).
4. **Public Bucket:** Toggle the switch **ON** (Public).
5. Click **Save bucket**.

---

### Step 5: Configure the `.env` File

In the project folder:
1. Make a copy of `.env.example` and name it `.env` (or let `run.bat` create it automatically).
2. Open `.env` in Notepad.
3. Fill in the values you copied in Steps 2 & 3:

```ini
PORT=3000
ENVIRONMENT=production

# 1. Your Supabase PostgreSQL Connection String (from Step 2)
DATABASE_URL=postgresql://postgres.yourproject:YourPassword123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres

# 2. Your Supabase API Credentials (from Step 3)
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_KEY=your_actual_supabase_api_key_here
SUPABASE_BUCKET=resumes

# 3. Security Secret (Keep this default or generate your own)
JWT_SECRET=placement_tracker_jwt_super_secure_random_production_key_2026_xyz987

# 4. Optional: Gemini AI key (can leave blank - offline question bank works automatically!)
GEMINI_API_KEY=
```
4. Save the file (`Ctrl + S`) and close Notepad.

---

### Step 6: Launch the Application

#### On Windows:
Simply **double-click `run.bat`**.

What happens automatically:
1. **Python Check:** If Python is not on your machine, `run.bat` automatically installs Python 3.11 silently via Windows Package Manager / official Python installer.
2. **Environment:** Creates an isolated `.venv` folder.
3. **Packages:** Runs `pip install -r backend/requirements.txt`.
4. **Database Auto-Bootstrapping:** The backend connects to Supabase, checks if tables exist, and automatically creates:
   - `users` table
   - `skills` table (pre-seeded with 160+ industry skills)
   - `internships` table (pre-seeded with 5 top company postings: Google, Microsoft, Amazon, Meta, TCS)
   - `applications` table
   - `quiz_attempts` table
   - `user_skills` table
   - Row Level Security (RLS) security policies
   - Default Administrator account
5. **Browser:** Automatically launches `http://localhost:3000/index.html`.

#### On macOS / Linux:
Open your terminal in the project folder and run:
```bash
chmod +x run.sh
./run.sh
```

---

## 🔑 Default Login Credentials

Once the application opens:

### 1. Training & Placement Officer (Admin Portal)
- **URL:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
- **Email:** `admin@placementtracker.com`
- **Password:** `Admin@123`
- **Capabilities:** Post new drives, review student resumes, approve/shortlist applicants, give written feedback, view live cohort rankings.

### 2. Student Portal
- **URL:** [http://localhost:3000/register.html](http://localhost:3000/register.html)
- **Registration:** Students register with their college email, branch, and CGPA.
- **Capabilities:** Upload resume PDF (auto-scans skills), take 5-question quizzes to earn verified badges, view real-time match percentages against drives, and apply in 1-click.

---

## 🛠️ Frequently Asked Questions & Troubleshooting

### Q1: What if Python is not installed or not in PATH on my client's laptop?
**Answer:** `run.bat` handles this automatically. It searches standard Windows directories (`AppData\Local\Programs\Python`, `Program Files\Python`), checks the `py` launcher, and if completely missing, downloads and installs Python 3.11 with `PrependPath=1`. Zero manual configuration required.

### Q2: What if the database tables are not showing up in Supabase?
**Answer:** Our backend includes an **Automated Self-Bootstrapper** (`backend/app/init_db.py`). The moment `run.bat` starts, it runs `supabase_setup.sql` on your Supabase instance.  
*Manual alternative:* If you ever want to run the SQL yourself:
1. Open Supabase Dashboard -> **SQL Editor** (terminal icon in left menu).
2. Click **New query**.
3. Open `supabase_setup.sql` from the project folder, copy all contents, paste it into the editor, and click **Run**.

### Q3: What if port 3000 is already in use by another software?
**Answer:** Open `.env` and change `PORT=3000` to `PORT=8080` (or `5000`). Save and re-run `run.bat`. The launcher and frontend dynamically adapt to whichever port you configure.

### Q4: Does this project require an active Google Gemini AI key to work?
**Answer:** No! While you can paste a free Gemini API key into `GEMINI_API_KEY` for dynamic generative questions, the backend has a built-in **Offline Question Bank Engine** covering 15+ major domains (Python, Java, React, SQL, Cloud, Docker, DSA). Quizzes and badge evaluations will work 100% reliably even with no internet or zero AI quota.

### Q5: Can this be deployed online to the cloud?
**Answer:** Yes! You can push this repository to GitHub and deploy to Render, Railway, or AWS in under 3 minutes:
- **Build Command:** `pip install -r backend/requirements.txt`
- **Start Command:** `python backend/run.py`
- Add your environment variables in the cloud dashboard.
