import datetime
import logging
import uuid
import bcrypt
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_SECONDS
from app.database import get_db, parse_skills

logger = logging.getLogger("placement-tracker.auth")
security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_or_plain: str) -> bool:
    if not hashed_or_plain:
        return False
    # Check if standard BCrypt hash
    if hashed_or_plain.startswith("$2a$") or hashed_or_plain.startswith("$2b$") or hashed_or_plain.startswith("$2y$"):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_or_plain.encode("utf-8"))
        except Exception:
            return False
    # Legacy unhashed fallback
    return plain_password == hashed_or_plain

def create_access_token(user_id: uuid.UUID | str, email: str, role: str) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    expire = now + datetime.timedelta(seconds=JWT_EXPIRATION_SECONDS)
    payload = {
        "sub": str(user_id),
        "id": str(user_id),
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None

def get_current_user(auth_header: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not auth_header or not auth_header.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = auth_header.credentials
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload["sub"]
    with get_db() as cur:
        cur.execute("""
            SELECT id, full_name, email, password_hash, role, resume_link, 
                   skills, verified_skills, batch_year, department, cgpa, 
                   college_verified, created_at 
            FROM public.users 
            WHERE id = %s;
        """, (user_id,))
        user = cur.fetchone()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Normalize skills and verified_skills
    user["skills"] = parse_skills(user.get("skills"))
    user["verified_skills"] = parse_skills(user.get("verified_skills"))
    return dict(user)

def get_optional_current_user(request: Request) -> dict | None:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return None
    try:
        user_id = payload["sub"]
        with get_db() as cur:
            cur.execute("""
                SELECT id, full_name, email, role, resume_link, 
                       skills, verified_skills, batch_year, department, cgpa, 
                       college_verified, created_at 
                FROM public.users 
                WHERE id = %s;
            """, (user_id,))
            user = cur.fetchone()
        if user:
            user["skills"] = parse_skills(user.get("skills"))
            user["verified_skills"] = parse_skills(user.get("verified_skills"))
            return dict(user)
    except Exception:
        pass
    return None

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role", "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user

def require_student(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role", "").lower() != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student privileges required",
        )
    return user
