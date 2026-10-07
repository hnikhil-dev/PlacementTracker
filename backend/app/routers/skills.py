import uuid
import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.database import get_db, parse_skills
from app.auth import get_current_user, require_student
from app.routers.internships import calculate_match_ratio

logger = logging.getLogger("placement-tracker.routers.skills")
router = APIRouter(prefix="/api/skills", tags=["skills"])

class SubmitQuizRequest(BaseModel):
    skill_name: str
    score: int
    passed: bool

@router.post("/submit")
def submit_quiz(
    req: SubmitQuizRequest,
    current_user: dict = Depends(require_student)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    new_id = uuid.uuid4()

    with get_db() as cur:
        cur.execute("""
            INSERT INTO public.quiz_attempts (id, user_id, skill_name, score, passed, attempted_at)
            VALUES (%s, %s, %s, %s, %s, %s);
        """, (str(new_id), str(current_user["id"]), req.skill_name.strip(), req.score, req.passed, now))

    if not req.passed:
        return {"message": "Quiz Failed. Try again later."}

    # If passed, add to verified_skills if not already present
    verified = list(current_user.get("verified_skills") or [])
    clean_skill = req.skill_name.strip()
    if not any(v.lower() == clean_skill.lower() for v in verified):
        verified.append(clean_skill)
        with get_db() as cur:
            cur.execute("""
                UPDATE public.users 
                SET verified_skills = %s 
                WHERE id = %s;
            """, (verified, str(current_user["id"])))
        current_user["verified_skills"] = verified

    # Calculate match analytics
    with get_db() as cur:
        cur.execute("""
            SELECT id, company_name, role_title, required_skills 
            FROM public.internships;
        """)
        all_jobs = cur.fetchall()

    matches = []
    for job in all_jobs:
        req_skills = parse_skills(job.get("required_skills"))
        m_info = calculate_match_ratio(verified, req_skills)
        matches.append({
            "id": str(job["id"]),
            "company_name": job.get("company_name"),
            "role_title": job.get("role_title"),
            "matchPercentage": m_info["matchPercentage"],
            "matchedSkills": m_info["matchedSkills"],
            "missingSkills": m_info["missingSkills"],
            "isPerfect": m_info["isPerfectMatch"],
            "isGood": m_info["isGoodMatch"]
        })

    # Sort matches by percentage DESC
    matches.sort(key=lambda x: x["matchPercentage"], reverse=True)
    top_matches = [
        {
            "id": m["id"],
            "company_name": m["company_name"],
            "role_title": m["role_title"],
            "matchPercentage": m["matchPercentage"],
            "matchedSkills": m["matchedSkills"],
            "missingSkills": m["missingSkills"]
        }
        for m in matches if m["matchPercentage"] > 0
    ][:5]

    perfect_matches = sum(1 for m in matches if m["isPerfect"])
    good_matches = sum(1 for m in matches if m["isGood"])

    return {
        "message": "Skill Verified Successfully!",
        "verifiedSkill": clean_skill,
        "totalVerifiedSkills": len(verified),
        "topMatches": top_matches,
        "matchInfo": {
            "totalJobsAnalyzed": len(matches),
            "perfectMatches": perfect_matches,
            "goodMatches": good_matches
        }
    }

@router.get("/history")
def get_quiz_history(current_user: dict = Depends(get_current_user)):
    with get_db() as cur:
        cur.execute("""
            SELECT id, skill_name, score, passed, attempted_at
            FROM public.quiz_attempts
            WHERE user_id = %s
            ORDER BY attempted_at DESC
            LIMIT 20;
        """, (str(current_user["id"]),))
        attempts = cur.fetchall()

    formatted = []
    for a in attempts:
        t_str = a["attempted_at"].isoformat() if a.get("attempted_at") else None
        formatted.append({
            "id": str(a["id"]),
            "skill_name": a.get("skill_name"),
            "score": a.get("score"),
            "passed": a.get("passed"),
            "created_at": t_str,
            "attempted_at": t_str
        })

    return {"status": "success", "data": formatted}
