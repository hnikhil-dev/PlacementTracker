import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth import get_current_user
from app.services.ai_service import generate_quiz, get_feedback, get_skill_gap_plan

logger = logging.getLogger("placement-tracker.routers.ai")
router = APIRouter(prefix="/api/ai", tags=["ai"])

class QuizRequest(BaseModel):
    skill: str

class FeedbackRequest(BaseModel):
    skill: str
    score: int
    total: int | None = 5

class SkillGapRequest(BaseModel):
    targetRole: str | None = "Software Engineer"
    requiredSkills: list[str]

@router.post("/quiz")
def api_generate_quiz(req: QuizRequest):
    if not req.skill or not req.skill.strip():
        raise HTTPException(status_code=400, detail="Skill parameter is required.")
    
    quiz_data = generate_quiz(req.skill.strip())
    return {
        "success": True,
        "quiz": quiz_data
    }

@router.post("/feedback")
def api_get_feedback(req: FeedbackRequest):
    if not req.skill:
        raise HTTPException(status_code=400, detail="Skill and score parameters are required.")

    fb = get_feedback(req.skill.strip(), req.score, req.total or 5)
    return {"feedback": fb}

@router.post("/skill-gap")
def api_get_skill_gap(
    req: SkillGapRequest,
    current_user: dict = Depends(get_current_user)
):
    if not req.requiredSkills:
        raise HTTPException(status_code=400, detail="Required skills list is required.")

    user_skills = current_user.get("skills") or []
    plan = get_skill_gap_plan(user_skills, req.targetRole or "Software Engineer", req.requiredSkills)
    return plan
