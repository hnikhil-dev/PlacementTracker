import os
import logging
from pathlib import Path
import bcrypt
from app.database import get_db

logger = logging.getLogger("placement-tracker.init_db")

SAMPLE_INTERNSHIPS = [
    {
        "company_name": "Google",
        "role_title": "Software Engineering Intern",
        "description": "Join Google's core engineering team to build high-scale distributed systems and user-facing features.",
        "stipend": "₹1,25,000 / month",
        "duration": "6 Months",
        "mode": "Hybrid",
        "type": "Internship",
        "location": "Bengaluru, Karnataka",
        "required_skills": ["Python", "Algorithms", "Data Structures", "PostgreSQL", "Docker"],
        "deadline": "2026-12-31"
    },
    {
        "company_name": "Microsoft",
        "role_title": "Cloud & DevOps Intern",
        "description": "Collaborate with Azure engineering teams to design resilient cloud architecture and CI/CD automation pipelines.",
        "stipend": "₹1,10,000 / month",
        "duration": "6 Months",
        "mode": "Remote",
        "type": "Internship",
        "location": "Hyderabad, Telangana",
        "required_skills": ["Azure", "Docker", "Kubernetes", "CI/CD", "Linux", "Python"],
        "deadline": "2026-12-31"
    },
    {
        "company_name": "Amazon",
        "role_title": "Backend Developer Intern",
        "description": "Work on AWS retail and payments services, optimizing low-latency microservices handling millions of transactions.",
        "stipend": "₹1,00,000 / month",
        "duration": "3 Months",
        "mode": "On-site",
        "type": "Internship",
        "location": "Bengaluru, Karnataka",
        "required_skills": ["Python", "REST API", "PostgreSQL", "Microservices", "Git"],
        "deadline": "2026-12-31"
    },
    {
        "company_name": "Meta",
        "role_title": "Frontend Software Engineer Intern",
        "description": "Design modern, responsive user interfaces and performant client web applications using React and TypeScript.",
        "stipend": "₹95,000 / month",
        "duration": "6 Months",
        "mode": "Hybrid",
        "type": "Internship",
        "location": "Gurugram, Haryana",
        "required_skills": ["React", "JavaScript", "TypeScript", "HTML", "CSS"],
        "deadline": "2026-12-31"
    },
    {
        "company_name": "TCS Research",
        "role_title": "AI & Data Science Intern",
        "description": "Develop predictive machine learning models and data pipelines for enterprise analytics and generative AI use cases.",
        "stipend": "₹45,000 / month",
        "duration": "6 Months",
        "mode": "On-site",
        "type": "Internship",
        "location": "Pune, Maharashtra",
        "required_skills": ["Python", "Machine Learning", "Pandas", "NumPy", "Data Analysis"],
        "deadline": "2026-12-31"
    }
]

def auto_init_database():
    """
    Checks database schema and seeds master data if starting with a fresh Supabase database.
    Safe and idempotent: runs without modifying existing records.
    """
    try:
        with get_db() as cur:
            # Check if users table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'users'
                );
            """)
            users_exist = cur.fetchone()["exists"]

            if not users_exist:
                logger.info("Database schema not detected. Automatically initializing database...")
                # Search for supabase_setup.sql
                root_dir = Path(__file__).resolve().parent.parent.parent
                sql_path = root_dir / "supabase_setup.sql"
                if not sql_path.exists():
                    sql_path = Path.cwd() / "supabase_setup.sql"

                if sql_path.exists():
                    logger.info("Executing %s to bootstrap Supabase database...", sql_path)
                    with open(sql_path, "r", encoding="utf-8") as f:
                        sql_content = f.read()

                    # Execute SQL commands
                    try:
                        cur.execute(sql_content)
                        logger.info("Supabase database tables, indexes, and skills successfully created!")
                    except Exception as sql_err:
                        logger.warning("Error running full SQL script: %s. Continuing with table checks.", sql_err)
                else:
                    logger.warning("supabase_setup.sql not found at %s", sql_path)

            # Ensure default admin exists
            cur.execute("SELECT COUNT(*) FROM public.users WHERE email = 'admin@placementtracker.com';")
            admin_pt_count = cur.fetchone()["count"]
            if admin_pt_count == 0:
                logger.info("Creating default administrator (admin@placementtracker.com)...")
                admin_pw_hash = bcrypt.hashpw(b"Admin@123", bcrypt.gensalt(10)).decode('utf-8')
                cur.execute("""
                    INSERT INTO public.users 
                    (full_name, email, password_hash, role, college_verified, skills, verified_skills)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO NOTHING;
                """, ("Administrator", "admin@placementtracker.com", admin_pw_hash, "admin", True, [], []))
                logger.info("Default administrator account created successfully! Login: admin@placementtracker.com / Admin@123")

            # Ensure internships have sample postings if empty
            cur.execute("SELECT COUNT(*) FROM public.internships;")
            internship_count = cur.fetchone()["count"]
            if internship_count == 0:
                logger.info("Internships table is empty. Seeding %d initial job postings...", len(SAMPLE_INTERNSHIPS))
                for job in SAMPLE_INTERNSHIPS:
                    cur.execute("""
                        INSERT INTO public.internships 
                        (company_name, role_title, description, stipend, duration, mode, type, location, required_skills, deadline)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """, (
                        job["company_name"], job["role_title"], job["description"],
                        job["stipend"], job["duration"], job["mode"], job["type"],
                        job["location"], job["required_skills"], job["deadline"]
                    ))
                logger.info("Initial internships seeded successfully!")

            # Enforce Row Level Security (RLS) on all public tables for Supabase Security compliance
            cur.execute("""
                ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
                ALTER TABLE IF EXISTS public.skills ENABLE ROW LEVEL SECURITY;
                ALTER TABLE IF EXISTS public.internships ENABLE ROW LEVEL SECURITY;
                ALTER TABLE IF EXISTS public.applications ENABLE ROW LEVEL SECURITY;
                ALTER TABLE IF EXISTS public.quiz_attempts ENABLE ROW LEVEL SECURITY;
                ALTER TABLE IF EXISTS public.user_skills ENABLE ROW LEVEL SECURITY;
            """)

    except Exception as e:
        logger.error("Error during auto database initialization: %s", e)
