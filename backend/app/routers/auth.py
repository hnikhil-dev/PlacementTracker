import uuid
import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from app.config import APP_URL
from app.database import get_db
from app.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user
)
from app.services.email_service import send_reset_email

logger = logging.getLogger("placement-tracker.routers.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str | None = "student"

class LoginRequest(BaseModel):
    email: str
    password: str

class UpdatePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    newPassword: str

@router.post("/register")
def register(req: RegisterRequest):
    email_clean = req.email.strip().lower()
    
    with get_db() as cur:
        cur.execute("SELECT id FROM public.users WHERE lower(email) = %s;", (email_clean,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="User already exists")

        normalized_role = "student"
        if req.role:
            r = req.role.strip().lower()
            if r in ("student", "admin"):
                normalized_role = r

        hashed = hash_password(req.password)
        new_id = uuid.uuid4()
        now = datetime.datetime.now(datetime.timezone.utc)

        cur.execute("""
            INSERT INTO public.users (id, full_name, email, password_hash, role, created_at, skills, verified_skills)
            VALUES (%s, %s, %s, %s, %s, %s, '[]', '{}')
            RETURNING id, full_name, email, role;
        """, (str(new_id), req.full_name.strip(), email_clean, hashed, normalized_role, now))
        new_user = cur.fetchone()

    token = create_access_token(new_user["id"], new_user["email"], new_user["role"])
    return {
        "token": token,
        "user": {
            "id": str(new_user["id"]),
            "full_name": new_user["full_name"],
            "email": new_user["email"],
            "role": new_user["role"]
        }
    }

@router.post("/login")
def login(req: LoginRequest):
    email_clean = req.email.strip().lower()

    with get_db() as cur:
        cur.execute("""
            SELECT id, full_name, email, password_hash, role
            FROM public.users 
            WHERE lower(email) = %s;
        """, (email_clean,))
        user = cur.fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    password_check = user.get("password_hash")
    if not password_check or not verify_password(req.password, password_check):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user["id"], user["email"], user["role"])
    return {
        "token": token,
        "user": {
            "id": str(user["id"]),
            "name": user["full_name"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"]
        }
    }

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "status": "success",
        "data": {
            "id": str(current_user["id"]),
            "full_name": current_user["full_name"],
            "email": current_user["email"],
            "role": current_user["role"],
            "resume_link": current_user.get("resume_link") or "",
            "batch_year": current_user.get("batch_year") or 0
        }
    }

@router.patch("/update-password")
def update_password(req: UpdatePasswordRequest, current_user: dict = Depends(get_current_user)):
    with get_db() as cur:
        cur.execute("SELECT password_hash FROM public.users WHERE id = %s;", (current_user["id"],))
        u = cur.fetchone()
        if not u or not verify_password(req.currentPassword, u.get("password_hash")):
            raise HTTPException(status_code=400, detail="Incorrect current password")

        new_hash = hash_password(req.newPassword)
        cur.execute("UPDATE public.users SET password_hash = %s WHERE id = %s;", (new_hash, current_user["id"]))

    return {"status": "success", "message": "Password updated successfully!"}

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email_clean = req.email.strip().lower()
    with get_db() as cur:
        cur.execute("SELECT id FROM public.users WHERE lower(email) = %s;", (email_clean,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="User not found")

        reset_token = uuid.uuid4().hex
        expiry = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
        cur.execute("""
            UPDATE public.users 
            SET reset_token = %s, reset_token_expiry = %s 
            WHERE id = %s;
        """, (reset_token, expiry, user["id"]))

    reset_link = f"{APP_URL}/reset-password.html?token={reset_token}"
    send_reset_email(email_clean, reset_link)
    return {"message": "Reset link sent to email."}

@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    now = datetime.datetime.now(datetime.timezone.utc)
    with get_db() as cur:
        cur.execute("""
            SELECT id, reset_token_expiry 
            FROM public.users 
            WHERE reset_token = %s;
        """, (req.token,))
        user = cur.fetchone()

        if not user:
            raise HTTPException(status_code=400, detail="Invalid reset token")

        expiry = user.get("reset_token_expiry")
        if expiry:
            # Handle both tz-aware and naive timestamps
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=datetime.timezone.utc)
            if expiry < now:
                raise HTTPException(status_code=400, detail="Reset token has expired")

        new_hash = hash_password(req.newPassword)
        cur.execute("""
            UPDATE public.users 
            SET password_hash = %s, reset_token = NULL, reset_token_expiry = NULL 
            WHERE id = %s;
        """, (new_hash, user["id"]))

    return {"message": "Password reset successful."}
