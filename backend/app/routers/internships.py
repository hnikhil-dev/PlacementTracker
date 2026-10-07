import uuid
import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from app.database import get_db, parse_skills
from app.auth import get_optional_current_user, require_admin

logger = logging.getLogger("placement-tracker.routers.internships")
router = APIRouter(prefix="/api", tags=["internships"])

class CreateInternshipRequest(BaseModel):
    company_name: str
    role_title: str
    description: str | None = None
    stipend: str | None = None
    duration: str | None = None
    mode: str | None = None
    type: str | None = "Internship"
    location: str | None = None
    required_skills: list[str] | str | None = None
    deadline: str | None = None

def calculate_match_ratio(user_verified_skills: list[str], required_skills: list[str]) -> dict:
    verified = [s.strip().lower() for s in (user_verified_skills or []) if s.strip()]
    required = [s.strip() for s in (required_skills or []) if s.strip()]

    if not required:
        return {
            "matchRatio": 100.0,
            "matchPercentage": 100,
            "matchedSkills": [],
            "missingSkills": [],
            "matchedCount": 0,
            "totalRequired": 0,
            "isPerfectMatch": True,
            "isGoodMatch": False,
            "isPartialMatch": False,
            "isPoorMatch": False
        }

    matched_skills = []
    missing_skills = []

    for req in required:
        req_lower = req.lower()
        is_matched = any(
            v == req_lower or v in req_lower or req_lower in v
            for v in verified
        )
        if is_matched:
            matched_skills.append(req)
        else:
            missing_skills.append(req)

    matched_count = len(matched_skills)
    total_required = len(required)

    ratio = (matched_count / total_required) * 100.0
    percentage = round(ratio)

    return {
        "matchRatio": round(ratio, 2),
        "matchPercentage": percentage,
        "matchedSkills": matched_skills,
        "missingSkills": missing_skills,
        "matchedCount": matched_count,
        "totalRequired": total_required,
        "isPerfectMatch": (percentage == 100),
        "isGoodMatch": (70 <= percentage < 100),
        "isPartialMatch": (40 <= percentage < 70),
        "isPoorMatch": (percentage < 40)
    }

def format_job_dto(job: dict, current_user: dict | None) -> dict:
    req_skills = parse_skills(job.get("required_skills"))
    
    match_info = None
    if current_user and current_user.get("role", "").lower() == "student":
        match_info = calculate_match_ratio(current_user.get("verified_skills"), req_skills)

    deadline_str = None
    if job.get("deadline"):
        dl = job["deadline"]
        deadline_str = dl.isoformat() if hasattr(dl, "isoformat") else str(dl)

    posted_str = None
    if job.get("posted_at"):
        pa = job["posted_at"]
        posted_str = pa.isoformat() if hasattr(pa, "isoformat") else str(pa)

    return {
        "id": str(job["id"]),
        "company_name": job.get("company_name"),
        "role_title": job.get("role_title"),
        "description": job.get("description"),
        "stipend": job.get("stipend"),
        "duration": job.get("duration"),
        "mode": job.get("mode"),
        "type": job.get("type") or "Internship",
        "location": job.get("location"),
        "required_skills": req_skills,
        "deadline": deadline_str,
        "posted_at": posted_str,
        "matchInfo": match_info,
        "source_table": "internships",
        "apply_enabled": True
    }

@router.get("/internships")
@router.get("/companies")
def get_all_internships(current_user: dict | None = Depends(get_optional_current_user)):
    with get_db() as cur:
        cur.execute("""
            SELECT id, company_name, role_title, description, stipend, 
                   duration, mode, type, location, required_skills, deadline, posted_at
            FROM public.internships 
            ORDER BY posted_at DESC;
        """)
        jobs = cur.fetchall()

    dtos = [format_job_dto(job, current_user) for job in jobs]

    if current_user and current_user.get("role", "").lower() == "student":
        dtos.sort(
            key=lambda x: (
                x["matchInfo"]["matchPercentage"] if x.get("matchInfo") else 0,
                x["posted_at"] or ""
            ),
            reverse=True
        )

    return dtos

@router.get("/internships/search")
def search_internships(
    q: str | None = Query(None),
    mode: str | None = Query(None),
    type: str | None = Query(None)
):
    with get_db() as cur:
        cur.execute("""
            SELECT id, company_name, role_title, description, stipend, 
                   duration, mode, type, location, required_skills, deadline, posted_at
            FROM public.internships 
            ORDER BY posted_at DESC;
        """)
        jobs = cur.fetchall()

    results = []
    term = q.strip().lower() if q and q.strip() else None

    for job in jobs:
        if mode and mode.lower() != "all" and (job.get("mode") or "").lower() != mode.lower():
            continue
        if type and type.lower() != "all" and (job.get("type") or "").lower() != type.lower():
            continue

        if term:
            company = (job.get("company_name") or "").lower()
            role = (job.get("role_title") or "").lower()
            skills = [s.lower() for s in parse_skills(job.get("required_skills"))]
            if not (term in company or term in role or any(term in sk for sk in skills)):
                continue

        results.append(format_job_dto(job, None))

    return results

@router.post("/internships", status_code=status.HTTP_201_CREATED)
def create_internship(
    req: CreateInternshipRequest,
    current_user: dict = Depends(require_admin)
):
    if not req.company_name or not req.role_title:
        raise HTTPException(status_code=400, detail="Company name and role title are required.")

    skills_list = []
    if isinstance(req.required_skills, list):
        skills_list = [s.strip() for s in req.required_skills if s and s.strip()]
    elif isinstance(req.required_skills, str):
        skills_list = [s.strip() for s in req.required_skills.split(",") if s.strip()]

    new_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)

    with get_db() as cur:
        cur.execute("""
            INSERT INTO public.internships (
                id, company_name, role_title, description, stipend, 
                duration, mode, type, location, required_skills, deadline, posted_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, company_name, role_title, description, stipend, 
                      duration, mode, type, location, required_skills, deadline, posted_at;
        """, (
            str(new_id), req.company_name.strip(), req.role_title.strip(), req.description,
            req.stipend, req.duration, req.mode, req.type or "Internship", req.location,
            skills_list, req.deadline, now
        ))
        saved = cur.fetchone()

    return {
        "message": "Internship posted successfully!",
        "data": format_job_dto(saved, None)
    }
