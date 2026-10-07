-- Placement Tracker - Unified Supabase bootstrap SQL
-- Run this in the Supabase SQL Editor to initialize the database for a new client project.
-- This script contains all necessary table definitions, check constraints, indexes, 
-- master skills data, and storage bucket setup.
-- Safe to re-run (idempotent).

BEGIN;

-- 0) Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    password TEXT, -- Legacy password support
    role VARCHAR(50) NOT NULL DEFAULT 'student',
    resume_link TEXT,
    skills TEXT[] NOT NULL DEFAULT '{}',
    verified_skills TEXT[] NOT NULL DEFAULT '{}',
    batch_year INTEGER DEFAULT 0,
    department VARCHAR(120),
    cgpa NUMERIC(4,2),
    college_verified BOOLEAN NOT NULL DEFAULT FALSE,
    reset_token TEXT,
    reset_token_expiry TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure correct defaults and constraints
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'student';
ALTER TABLE public.users ALTER COLUMN college_verified SET DEFAULT FALSE;
ALTER TABLE public.users ALTER COLUMN created_at SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_check'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'admin'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_users_college_verified ON public.users (college_verified);


-- 2) MASTER SKILLS TABLE
CREATE TABLE IF NOT EXISTS public.skills (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_name ON public.skills (name);


-- 3) INTERNSHIPS TABLE
CREATE TABLE IF NOT EXISTS public.internships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    role_title VARCHAR(255) NOT NULL,
    description TEXT,
    stipend VARCHAR(120),
    duration VARCHAR(120),
    mode VARCHAR(60),
    type VARCHAR(60) NOT NULL DEFAULT 'Internship',
    location VARCHAR(255),
    required_skills TEXT[] NOT NULL DEFAULT '{}',
    deadline DATE,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.internships ALTER COLUMN type SET DEFAULT 'Internship';
ALTER TABLE public.internships ALTER COLUMN posted_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_internships_posted_at ON public.internships (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_internships_deadline ON public.internships (deadline);
CREATE INDEX IF NOT EXISTS idx_internships_required_skills_gin ON public.internships USING GIN (required_skills);


-- 4) APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    internship_id UUID NOT NULL REFERENCES public.internships (id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'Applied',
    ai_reason TEXT, -- Maps to adminReason in Spring Boot
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, internship_id)
);

ALTER TABLE public.applications ALTER COLUMN status SET DEFAULT 'Applied';
ALTER TABLE public.applications ALTER COLUMN applied_at SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'applications_status_check'
          AND conrelid = 'public.applications'::regclass
    ) THEN
        ALTER TABLE public.applications
            ADD CONSTRAINT applications_status_check
            CHECK (status IN ('Applied', 'Shortlisted', 'Offered', 'Rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_applications_user_id ON public.applications (user_id);
CREATE INDEX IF NOT EXISTS idx_applications_internship_id ON public.applications (internship_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON public.applications (applied_at DESC);


-- 5) QUIZ ATTEMPTS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    skill_name VARCHAR(120) NOT NULL,
    score INTEGER NOT NULL,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quiz_attempts ALTER COLUMN passed SET DEFAULT FALSE;
ALTER TABLE public.quiz_attempts ALTER COLUMN attempted_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON public.quiz_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_created_at ON public.quiz_attempts (attempted_at DESC);


-- 6) SUPABASE STORAGE BUCKET FOR RESUMES
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resumes', 'resumes', TRUE, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read policy for resume files
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Public read access for resumes'
    ) THEN
        CREATE POLICY "Public read access for resumes"
        ON storage.objects
        FOR SELECT
        TO public
        USING (bucket_id = 'resumes');
    END IF;
END $$;


-- 7) SEED DATA: POPULATE MASTER SKILLS
INSERT INTO public.skills (name) VALUES
    -- Programming Languages
    ('JavaScript'), ('Python'), ('Java'), ('C++'), ('C'), ('C#'), ('TypeScript'),
    ('Go'), ('Rust'), ('Ruby'), ('PHP'), ('Swift'), ('Kotlin'), ('Dart'),
    ('Scala'), ('R'), ('MATLAB'), ('Perl'), ('Shell'), ('Bash'),
    -- Web Development
    ('HTML'), ('CSS'), ('React'), ('Angular'), ('Vue.js'), ('Node.js'), ('Express.js'),
    ('Django'), ('Flask'), ('Spring Boot'), ('ASP.NET'), ('Laravel'), ('Next.js'),
    ('Nuxt.js'), ('Svelte'), ('jQuery'), ('Bootstrap'), ('Tailwind CSS'), ('SASS'),
    ('LESS'), ('Webpack'), ('Vite'),
    -- Mobile Development
    ('React Native'), ('Flutter'), ('Android'), ('iOS'), ('Xamarin'), ('Ionic'),
    -- Databases
    ('MySQL'), ('PostgreSQL'), ('MongoDB'), ('SQLite'), ('Redis'), ('Oracle'),
    ('SQL Server'), ('MariaDB'), ('Cassandra'), ('DynamoDB'), ('Firebase'),
    ('Supabase'), ('Firestore'), ('CouchDB'),
    -- Cloud & DevOps
    ('AWS'), ('Azure'), ('Google Cloud'), ('GCP'), ('Docker'), ('Kubernetes'),
    ('Jenkins'), ('CI/CD'), ('Terraform'), ('Ansible'), ('GitHub Actions'),
    ('GitLab CI'), ('CircleCI'), ('Heroku'), ('Vercel'), ('Netlify'), ('DigitalOcean'),
    -- Data Science & ML
    ('Machine Learning'), ('Deep Learning'), ('TensorFlow'), ('PyTorch'), ('Keras'),
    ('Scikit-learn'), ('Pandas'), ('NumPy'), ('Matplotlib'), ('Seaborn'),
    ('Data Analysis'), ('Data Visualization'), ('Natural Language Processing'),
    ('NLP'), ('Computer Vision'), ('OpenCV'),
    -- Tools & Platforms
    ('Git'), ('GitHub'), ('GitLab'), ('Bitbucket'), ('VS Code'), ('IntelliJ IDEA'),
    ('Eclipse'), ('Postman'), ('Insomnia'), ('Jira'), ('Trello'), ('Slack'),
    ('Figma'), ('Adobe XD'), ('Photoshop'),
    -- Testing
    ('Jest'), ('Mocha'), ('Chai'), ('Selenium'), ('Cypress'), ('Pytest'),
    ('JUnit'), ('TestNG'), ('Unit Testing'), ('Integration Testing'), ('E2E Testing'),
    -- Other Concepts
    ('REST API'), ('GraphQL'), ('WebSocket'), ('gRPC'), ('Microservices'),
    ('OAuth'), ('JWT'), ('Blockchain'), ('Solidity'), ('Ethereum'), ('Web3'),
    ('API Development'), ('System Design'), ('Data Structures'), ('Algorithms'),
    ('OOP'), ('Functional Programming'), ('Agile'), ('Scrum'), ('Linux'),
    ('Ubuntu'), ('Windows'), ('macOS'), ('Nginx'), ('Apache'), ('RabbitMQ'),
    ('Kafka'), ('ElasticSearch'), ('Tableau'), ('Power BI')
ON CONFLICT (name) DO NOTHING;


-- 8) ROW LEVEL SECURITY (RLS) CONFIGURATION
-- Enable RLS on all tables to satisfy Supabase Security Advisor
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Allow public read for master skills catalog
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'skills' AND policyname = 'Allow public read on skills'
    ) THEN
        CREATE POLICY "Allow public read on skills" ON public.skills FOR SELECT TO public USING (true);
    END IF;
END $$;

-- Allow service role full access on all tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'skills' AND policyname = 'Allow service_role full access on skills') THEN
        CREATE POLICY "Allow service_role full access on skills" ON public.skills FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Allow service_role full access on users') THEN
        CREATE POLICY "Allow service_role full access on users" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'internships' AND policyname = 'Allow service_role full access on internships') THEN
        CREATE POLICY "Allow service_role full access on internships" ON public.internships FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applications' AND policyname = 'Allow service_role full access on applications') THEN
        CREATE POLICY "Allow service_role full access on applications" ON public.applications FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quiz_attempts' AND policyname = 'Allow service_role full access on quiz_attempts') THEN
        CREATE POLICY "Allow service_role full access on quiz_attempts" ON public.quiz_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

COMMIT;
