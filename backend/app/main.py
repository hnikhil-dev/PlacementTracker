import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db_pool, close_db_pool
from app.init_db import auto_init_database
from app.routers import auth, internships, applications, profile, skills, ai, admin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("placement-tracker.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Smart Placement Tracker (Python FastAPI Backend)...")
    try:
        init_db_pool()
        auto_init_database()
    except Exception as e:
        logger.error("Database connection could not be initialized on startup: %s", e)
        logger.warning("Application will run in setup mode. Please configure your .env file with Supabase credentials.")
    yield
    logger.info("Shutting down Smart Placement Tracker...")
    close_db_pool()

app = FastAPI(
    title="Smart Placement Tracker API",
    version="2.0.0",
    description="Python FastAPI enterprise backend for the Smart Student Placement Manager",
    lifespan=lifespan
)

# CORS Middleware (Fully permissive for dev, localhost & production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router)
app.include_router(internships.router)
app.include_router(applications.router)
app.include_router(profile.router)
app.include_router(skills.router)
app.include_router(ai.router)
app.include_router(admin.router)

# Locate public directory
base_dir = Path(__file__).resolve().parent.parent.parent
public_dir = base_dir / "public"

if public_dir.exists():
    css_dir = public_dir / "css"
    js_dir = public_dir / "js"

    if css_dir.exists():
        app.mount("/css", StaticFiles(directory=str(css_dir)), name="css")
    if js_dir.exists():
        app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")

    # Static HTML routes
    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(str(public_dir / "index.html"))

    @app.get("/index.html", include_in_schema=False)
    def index_page():
        return FileResponse(str(public_dir / "index.html"))

    @app.get("/register.html", include_in_schema=False)
    def register_page():
        return FileResponse(str(public_dir / "register.html"))

    @app.get("/dashboard.html", include_in_schema=False)
    def dashboard_page():
        return FileResponse(str(public_dir / "dashboard.html"))

    @app.get("/admin.html", include_in_schema=False)
    def admin_page():
        return FileResponse(str(public_dir / "admin.html"))

    @app.get("/reset-password.html", include_in_schema=False)
    def reset_password_page():
        return FileResponse(str(public_dir / "reset-password.html"))

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        fav_path = public_dir / "favicon.ico"
        if fav_path.exists():
            return FileResponse(str(fav_path))
        return Response(status_code=204)

    @app.get("/Documentation.html", include_in_schema=False)
    @app.get("/documentation", include_in_schema=False)
    def documentation_page():
        doc_path = base_dir / "Documentation.html"
        if doc_path.exists():
            return FileResponse(str(doc_path))
        return Response(status_code=404)

    @app.get("/Placement_Tracker_Documentation.pdf", include_in_schema=False)
    @app.get("/docs.pdf", include_in_schema=False)
    def documentation_pdf():
        pdf_path = base_dir / "Placement_Tracker_Documentation.pdf"
        if pdf_path.exists():
            return FileResponse(str(pdf_path), media_type="application/pdf", filename="Placement_Tracker_Documentation.pdf")
        return Response(status_code=404)
else:
    logger.warning("Public folder not found at %s", public_dir)
