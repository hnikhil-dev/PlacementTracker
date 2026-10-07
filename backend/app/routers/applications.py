import uuid
import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from app.database import get_db, parse_skills
from app.auth import get_current_user, require_admin, require_student

logger = logging.getLogger("placement-tracker.routers.applications")
router = APIRouter(prefix="/api", tags=["applications"])

class ApplyRequest(BaseModel):
    company_id: str

class UpdateStatusRequest(BaseModel):
    status: str
    reason: str | None = None

@router.post("/applications", status_code=status.HTTP_201_CREATED)
def apply_internship(
    req: ApplyRequest,
    current_user: dict = Depends(require_student)
):
    try:
        internship_id = uuid.UUID(req.company_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company_id format")

    with get_db() as cur:
        # Check internship exists
        cur.execute("SELECT id FROM public.internships WHERE id = %s;", (str(internship_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Internship not found")

        # Check existing application
        cur.execute("""
            SELECT id FROM public.applications 
            WHERE user_id = %s AND internship_id = %s;
        """, (str(current_user["id"]), str(internship_id)))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="You have already applied to this internship!")

        new_id = uuid.uuid4()
        now = datetime.datetime.now(datetime.timezone.utc)
        cur.execute("""
            INSERT INTO public.applications (id, user_id, internship_id, status, applied_at)
            VALUES (%s, %s, %s, 'Applied', %s)
            RETURNING id, user_id, internship_id, status, applied_at, ai_reason;
        """, (str(new_id), str(current_user["id"]), str(internship_id), now))
        saved = cur.fetchone()

    return {
        "status": "success",
        "data": {
            "id": str(saved["id"]),
            "user_id": str(saved["user_id"]),
            "internship_id": str(saved["internship_id"]),
            "status": saved["status"],
            "applied_at": saved["applied_at"].isoformat() if saved.get("applied_at") else None,
            "admin_reason": saved.get("ai_reason") or ""
        }
    }

@router.get("/applications/my")
def get_my_applications(current_user: dict = Depends(require_student)):
    with get_db() as cur:
        cur.execute("""
            SELECT a.id, a.internship_id, a.status, a.applied_at, a.ai_reason,
                   i.company_name, i.role_title
            FROM public.applications a
            JOIN public.internships i ON a.internship_id = i.id
            WHERE a.user_id = %s
            ORDER BY a.applied_at DESC;
        """, (str(current_user["id"]),))
        rows = cur.fetchall()

    formatted = []
    for r in rows:
        applied_str = r["applied_at"].isoformat() if r.get("applied_at") else None
        formatted.append({
            "id": str(r["id"]),
            "internship_id": str(r["internship_id"]),
            "status": r["status"],
            "applied_at": applied_str,
            "admin_reason": r.get("ai_reason") or "",
            "company_name": r.get("company_name"),
            "role": r.get("role_title")
        })

    return {"status": "success", "data": formatted}

@router.delete("/applications/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_application(
    app_id: str,
    current_user: dict = Depends(require_student)
):
    try:
        a_id = uuid.UUID(app_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid application ID format")

    with get_db() as cur:
        cur.execute("""
            DELETE FROM public.applications 
            WHERE id = %s AND user_id = %s
            RETURNING id;
        """, (str(a_id), str(current_user["id"])))
        deleted = cur.fetchone()

    if not deleted:
        raise HTTPException(status_code=404, detail="Application not found or unauthorized")

    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/applications/admin-view")
def get_admin_applications(current_user: dict = Depends(require_admin)):
    with get_db() as cur:
        cur.execute("""
            SELECT a.id, a.status, a.applied_at, a.ai_reason,
                   u.full_name AS student_name, u.email AS student_email,
                   u.resume_link, u.verified_skills,
                   i.company_name, i.role_title, i.stipend, i.type
            FROM public.applications a
            JOIN public.users u ON a.user_id = u.id
            JOIN public.internships i ON a.internship_id = i.id
            ORDER BY a.applied_at DESC;
        """)
        rows = cur.fetchall()

    formatted = []
    for r in rows:
        applied_str = r["applied_at"].isoformat() if r.get("applied_at") else None
        formatted.append({
            "id": str(r["id"]),
            "status": r["status"],
            "applied_at": applied_str,
            "admin_reason": r.get("ai_reason") or "",
            "student_name": r.get("student_name"),
            "student_email": r.get("student_email"),
            "resume_link": r.get("resume_link") or "",
            "verified_skills": parse_skills(r.get("verified_skills")),
            "company_name": r.get("company_name"),
            "role_title": r.get("role_title"),
            "stipend": r.get("stipend") or "",
            "type": r.get("type") or "Internship"
        })

    return {"status": "success", "data": formatted}

@router.put("/applications/{app_id}/status")
def update_application_status(
    app_id: str,
    req: UpdateStatusRequest,
    current_user: dict = Depends(require_admin)
):
    valid_statuses = ["Applied", "Shortlisted", "Offered", "Rejected"]
    if req.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    try:
        a_id = uuid.UUID(app_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid application ID format")

    with get_db() as cur:
        cur.execute("""
            UPDATE public.applications
            SET status = %s, ai_reason = %s
            WHERE id = %s
            RETURNING id, user_id, internship_id, status, applied_at, ai_reason;
        """, (req.status, req.reason or "", str(a_id)))
        updated = cur.fetchone()

    if not updated:
        raise HTTPException(status_code=404, detail="Application not found")

    return {
        "status": "success",
        "data": {
            "id": str(updated["id"]),
            "user_id": str(updated["user_id"]),
            "internship_id": str(updated["internship_id"]),
            "status": updated["status"],
            "admin_reason": updated.get("ai_reason") or ""
        }
    }

@router.get("/stats/dashboard")
def get_dashboard_stats(current_user: dict = Depends(require_student)):
    with get_db() as cur:
        cur.execute("""
            SELECT status FROM public.applications 
            WHERE user_id = %s;
        """, (str(current_user["id"]),))
        apps = cur.fetchall()

    total = len(apps)
    shortlisted = sum(1 for a in apps if (a.get("status") or "").lower() == "shortlisted")
    offered = sum(1 for a in apps if (a.get("status") or "").lower() == "offered")
    rejected = sum(1 for a in apps if (a.get("status") or "").lower() == "rejected")

    verified_count = len(current_user.get("verified_skills") or [])
    skills_count = len(current_user.get("skills") or [])
    has_resume = bool(current_user.get("resume_link") and current_user["resume_link"].strip())

    profile_score = 0
    if has_resume:
        profile_score += 30
    profile_score += min(verified_count * 10, 40)
    profile_score += min(skills_count * 2, 20)
    profile_score = min(profile_score, 100)

    return {
        "status": "success",
        "data": {
            "total": total,
            "shortlisted": shortlisted,
            "offered": offered,
            "rejected": rejected,
            "verifiedSkills": verified_count,
            "profileScore": profile_score
        }
    }
