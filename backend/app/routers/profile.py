import io
import re
import time
import json
import logging
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
import pypdf
from app.database import get_db, parse_skills
from app.auth import get_current_user
from app.services.storage_service import upload_resume_pdf

logger = logging.getLogger("placement-tracker.routers.profile")
router = APIRouter(prefix="/api/profile", tags=["profile"])

def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        pages_text = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages_text)
    except Exception as e:
        logger.error("Failed to extract text from PDF: %s", e)
        return ""

@router.get("/me")
def get_profile(current_user: dict = Depends(get_current_user)):
    return {
        "status": "success",
        "data": {
            "id": str(current_user["id"]),
            "full_name": current_user["full_name"],
            "email": current_user["email"],
            "role": current_user["role"],
            "resume_link": current_user.get("resume_link") or "",
            "skills": current_user.get("skills") or [],
            "verified_skills": current_user.get("verified_skills") or [],
            "batch_year": current_user.get("batch_year") or 0,
            "college_verified": bool(current_user.get("college_verified"))
        }
    }

@router.post("/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if not resume:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    file_bytes = await resume.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    original_filename = resume.filename or "resume.pdf"
    file_name = f"{current_user['id']}-{int(time.time() * 1000)}-{original_filename}"

    # Extract text and match master skills
    pdf_text = extract_text_from_pdf(file_bytes)
    extracted_skills = []

    with get_db() as cur:
        cur.execute("SELECT name FROM public.skills;")
        master_skills = [row["name"] for row in cur.fetchall()]

    if pdf_text and pdf_text.strip():
        for skill_name in master_skills:
            escaped = re.escape(skill_name)
            has_special = bool(re.search(r"[+#.]", skill_name))
            if has_special:
                pattern = rf"(^|\s){escaped}(\s|$|\.|,)"
            else:
                pattern = rf"\b{escaped}\b"
            
            if re.search(pattern, pdf_text, re.IGNORECASE):
                extracted_skills.append(skill_name)

    logger.info("Identified %d skills from PDF for user %s", len(extracted_skills), current_user["email"])

    # Upload to Supabase Storage
    try:
        public_url = upload_resume_pdf(file_name, file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload resume to storage: {e}")

    # Retain verified skills only if present in newly parsed skills
    existing_verified = current_user.get("verified_skills") or []
    extracted_lower = [s.lower() for s in extracted_skills]
    cleaned_verified = [v for v in existing_verified if v.lower() in extracted_lower]

    skills_json_str = json.dumps(extracted_skills)

    with get_db() as cur:
        cur.execute("""
            UPDATE public.users 
            SET resume_link = %s, skills = %s, verified_skills = %s
            WHERE id = %s;
        """, (public_url, skills_json_str, cleaned_verified, str(current_user["id"])))

        # Find top 5 recommended jobs
        cur.execute("""
            SELECT id, company_name, role_title, stipend, mode, type, required_skills
            FROM public.internships
            ORDER BY posted_at DESC;
        """)
        all_jobs = cur.fetchall()

    recommended_jobs = []
    for job in all_jobs:
        job_req = [s.lower() for s in parse_skills(job.get("required_skills"))]
        if any(sk in job_req for sk in extracted_lower):
            recommended_jobs.append({
                "id": str(job["id"]),
                "company_name": job.get("company_name"),
                "role_title": job.get("role_title"),
                "stipend": job.get("stipend"),
                "mode": job.get("mode"),
                "type": job.get("type"),
                "required_skills": parse_skills(job.get("required_skills"))
            })
            if len(recommended_jobs) >= 5:
                break

    return {
        "status": "success",
        "message": "Resume uploaded successfully!",
        "resume_url": public_url,
        "skills_identified": extracted_skills,
        "recommended_jobs": recommended_jobs
    }
