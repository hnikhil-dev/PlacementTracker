"""
Unit and integration tests for core placement tracker services,
auth verification, skill matching, and AI emergency fallbacks.
Runs using Python standard library `unittest` (no external test dependencies required).
"""

import sys
import unittest
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.auth import hash_password, verify_password, create_access_token, decode_token
from app.database import parse_skills
from app.routers.internships import calculate_match_ratio
from app.services.ai_service import clean_json_text, get_emergency_quiz, get_feedback, get_skill_gap_plan


class TestAuthSecurity(unittest.TestCase):
    def test_password_hashing_and_verification(self):
        plain = "ClientSecret@2026"
        hashed = hash_password(plain)
        self.assertNotEqual(plain, hashed)
        self.assertTrue(hashed.startswith("$2b$") or hashed.startswith("$2a$"))
        self.assertTrue(verify_password(plain, hashed))
        self.assertFalse(verify_password("WrongPassword!", hashed))

    def test_jwt_token_flow(self):
        user_id = "12345678-1234-5678-1234-567812345678"
        email = "test@placementtracker.com"
        role = "student"

        token = create_access_token(user_id, email, role)
        self.assertIsInstance(token, str)
        self.assertTrue(len(token) > 20)

        decoded = decode_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded.get("sub"), user_id)
        self.assertEqual(decoded.get("email"), email)
        self.assertEqual(decoded.get("role"), role)


class TestDatabaseParsing(unittest.TestCase):
    def test_parse_skills_various_formats(self):
        # Native list
        self.assertEqual(parse_skills(["Python", "Docker"]), ["Python", "Docker"])
        # PostgreSQL text array format
        self.assertEqual(parse_skills("{Python,Docker}"), ["Python", "Docker"])
        # Empty array
        self.assertEqual(parse_skills("{}"), [])
        self.assertEqual(parse_skills("[]"), [])
        self.assertEqual(parse_skills(None), [])
        # JSON string format
        self.assertEqual(parse_skills('["Python", "React"]'), ["Python", "React"])
        # Comma-separated format
        self.assertEqual(parse_skills("Python, React, FastApi"), ["Python", "React", "FastApi"])


class TestSkillMatchingRatio(unittest.TestCase):
    def test_perfect_match(self):
        user_skills = ["Python", "Docker", "PostgreSQL"]
        required_skills = ["Python", "Docker", "PostgreSQL"]
        result = calculate_match_ratio(user_skills, required_skills)
        self.assertEqual(result["matchPercentage"], 100)
        self.assertTrue(result["isPerfectMatch"])
        self.assertEqual(len(result["missingSkills"]), 0)

    def test_partial_match(self):
        user_skills = ["Python"]
        required_skills = ["Python", "Kubernetes", "AWS", "Docker"]
        result = calculate_match_ratio(user_skills, required_skills)
        self.assertEqual(result["matchPercentage"], 25)
        self.assertFalse(result["isPerfectMatch"])
        self.assertEqual(len(result["matchedSkills"]), 1)
        self.assertEqual(len(result["missingSkills"]), 3)

    def test_empty_requirements(self):
        result = calculate_match_ratio(["Python"], [])
        self.assertEqual(result["matchPercentage"], 100)
        self.assertTrue(result["isPerfectMatch"])


class TestAIEmergencyFallbacks(unittest.TestCase):
    def test_emergency_quiz_generation(self):
        # Python
        py_quiz = get_emergency_quiz("Python")
        self.assertEqual(len(py_quiz), 5)
        for q in py_quiz:
            self.assertIn("question", q)
            self.assertEqual(len(q["options"]), 4)
            self.assertIn("correctIndex", q)

        # Java
        java_quiz = get_emergency_quiz("Java")
        self.assertEqual(len(java_quiz), 5)

        # Unknown skill fallback
        generic_quiz = get_emergency_quiz("Solidity")
        self.assertEqual(len(generic_quiz), 5)

    def test_clean_json_text(self):
        raw_markdown = '```json\n[{"question": "What is Python?"}]\n```'
        cleaned = clean_json_text(raw_markdown)
        self.assertEqual(cleaned, '[{"question": "What is Python?"}]')

    def test_offline_skill_gap_plan(self):
        user_skills = ["Python", "Git"]
        required_skills = ["Python", "Git", "Docker", "FastAPI"]
        plan = get_skill_gap_plan(user_skills, "Backend Developer", required_skills)
        self.assertIn("gapSkills", plan)
        self.assertEqual(set(plan["gapSkills"]), {"Docker", "FastAPI"})
        self.assertIn("plan", plan)
        self.assertIn("weeks", plan["plan"])
        self.assertTrue(len(plan["plan"]["weeks"]) > 0)


if __name__ == "__main__":
    unittest.main()
