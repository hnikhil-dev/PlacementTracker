import uuid
import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.database import get_db, parse_skills
from app.auth import require_admin

logger = logging.getLogger("placement-tracker.routers.admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])

class VerifyStudentRequest(BaseModel):
    college_verified: bool

class AdminCreateApplicationRequest(BaseModel):
    student_id: str
    internship_id: str

@router.get("/students")
def list_students(current_user: dict = Depends(require_admin)):
    with get_db() as cur:
        cur.execute("""
            SELECT id, full_name, email, role, batch_year, department, cgpa,
                   college_verified, verified_skills, skills, resume_link, created_at
            FROM public.users
            WHERE role = 'student'
            ORDER BY full_name ASC;
        """)
        students = cur.fetchall()

    formatted = []
    for s in students:
        created_str = s["created_at"].isoformat() if s.get("created_at") else None
        formatted.append({
            "id": str(s["id"]),
            "full_name": s.get("full_name"),
            "email": s.get("email"),
            "role": s.get("role"),
            "batch_year": s.get("batch_year") or 0,
            "department": s.get("department") or "",
            "cgpa": float(s["cgpa"]) if s.get("cgpa") is not None else 0.0,
            "college_verified": bool(s.get("college_verified")),
            "verified_skills": parse_skills(s.get("verified_skills")),
            "skills": parse_skills(s.get("skills")),
            "resume_link": s.get("resume_link") or "",
            "created_at": created_str
        })

    return {"status": "success", "data": formatted}

@router.get("/rankings")
def get_student_rankings(current_user: dict = Depends(require_admin)):
    with get_db() as cur:
        cur.execute("""
            SELECT 
                u.id AS id, 
                u.full_name AS full_name, 
                u.email AS email, 
                u.department AS department, 
                u.batch_year AS batch_year, 
                COALESCE(u.cgpa, 0) AS cgpa, 
                COALESCE(array_length(u.verified_skills, 1), 0) AS verified_skills_count, 
                u.verified_skills AS verified_skills, 
                COALESCE(u.college_verified, false) AS college_verified, 
                COUNT(a.id) AS total_applications, 
                COUNT(CASE WHEN a.status = 'Offered' THEN 1 END) AS offers_count, 
                COUNT(CASE WHEN a.status = 'Shortlisted' THEN 1 END) AS shortlisted_count, 
                COUNT(CASE WHEN a.status = 'Rejected' THEN 1 END) AS rejected_count, 
                ( 
                    COALESCE(u.cgpa, 0) * 10 + 
                    COALESCE(array_length(u.verified_skills, 1), 0) * 8 + 
                    COUNT(CASE WHEN a.status = 'Offered' THEN 1 END) * 25 + 
                    COUNT(CASE WHEN a.status = 'Shortlisted' THEN 1 END) * 10 + 
                    COUNT(a.id) * 2 + 
                    CASE WHEN COALESCE(u.college_verified, false) THEN 5 ELSE 0 END 
                ) AS ranking_score 
            FROM public.users u 
            LEFT JOIN public.applications a ON a.user_id = u.id 
            WHERE u.role = 'student' 
            GROUP BY u.id, u.full_name, u.email, u.department, u.batch_year, u.cgpa, u.verified_skills, u.college_verified 
            ORDER BY ranking_score DESC, u.cgpa DESC, u.full_name ASC;
        """)
        rows = cur.fetchall()

    formatted = []
    for r in rows:
        formatted.append({
            "id": str(r["id"]),
            "full_name": r.get("full_name") or "",
            "email": r.get("email") or "",
            "department": r.get("department") or "",
            "batch_year": r.get("batch_year"),
            "cgpa": float(r["cgpa"]) if r.get("cgpa") is not None else 0.0,
            "verified_skills_count": int(r.get("verified_skills_count") or 0),
            "verified_skills": parse_skills(r.get("verified_skills")),
            "college_verified": bool(r.get("college_verified")),
            "total_applications": int(r.get("total_applications") or 0),
            "offers_count": int(r.get("offers_count") or 0),
            "shortlisted_count": int(r.get("shortlisted_count") or 0),
            "rejected_count": int(r.get("rejected_count") or 0),
            "ranking_score": float(r.get("ranking_score") or 0.0)
        })

    return {"status": "success", "data": formatted}

@router.put("/students/{student_id}/verify")
def verify_student(
    student_id: str,
    req: VerifyStudentRequest,
    current_user: dict = Depends(require_admin)
):
    try:
        s_id = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student_id format")

    with get_db() as cur:
        cur.execute("SELECT id, full_name, email, role FROM public.users WHERE id = %s;", (str(s_id),))
        student = cur.fetchone()

        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        if (student.get("role") or "").lower() != "student":
            raise HTTPException(status_code=400, detail="Selected user is not a student")

        cur.execute("""
            UPDATE public.users 
            SET college_verified = %s 
            WHERE id = %s
            RETURNING id, full_name, email, college_verified;
        """, (req.college_verified, str(s_id)))
        updated = cur.fetchone()

    return {
        "status": "success",
        "data": {
            "id": str(updated["id"]),
            "full_name": updated["full_name"],
            "email": updated["email"],
            "college_verified": updated["college_verified"]
        }
    }

@router.post("/applications", status_code=status.HTTP_201_CREATED)
def admin_create_application(
    req: AdminCreateApplicationRequest,
    current_user: dict = Depends(require_admin)
):
    try:
        s_id = uuid.UUID(req.student_id)
        i_id = uuid.UUID(req.internship_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format for student_id or internship_id")

    with get_db() as cur:
        cur.execute("SELECT id, role FROM public.users WHERE id = %s;", (str(s_id),))
        student = cur.fetchone()
        if not student or (student.get("role") or "").lower() != "student":
            raise HTTPException(status_code=400, detail="Selected user is not a valid student")

        cur.execute("SELECT id FROM public.internships WHERE id = %s;", (str(i_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Internship not found")

        cur.execute("""
            SELECT id FROM public.applications 
            WHERE user_id = %s AND internship_id = %s;
        """, (str(s_id), str(i_id)))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="This student has already applied to this internship.")

        new_id = uuid.uuid4()
        now = datetime.datetime.now(datetime.timezone.utc)
        cur.execute("""
            INSERT INTO public.applications (id, user_id, internship_id, status, applied_at)
            VALUES (%s, %s, %s, 'Applied', %s)
            RETURNING id, user_id, internship_id, status, applied_at;
        """, (str(new_id), str(s_id), str(i_id), now))
        saved = cur.fetchone()

    return {
        "status": "success",
        "data": {
            "id": str(saved["id"]),
            "user_id": str(saved["user_id"]),
            "internship_id": str(saved["internship_id"]),
            "status": saved["status"],
            "applied_at": saved["applied_at"].isoformat() if saved.get("applied_at") else None
        }
    }
