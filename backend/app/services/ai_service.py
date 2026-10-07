import json
import logging
import urllib.parse
import requests
from app.config import GEMINI_API_KEY

logger = logging.getLogger("placement-tracker.ai")

MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-pro-latest",
]

def clean_json_text(raw_text: str) -> str:
    if not raw_text:
        return ""
    cleaned = raw_text.replace("```json", "").replace("```JSON", "").replace("```", "").strip()
    
    start_bracket = cleaned.find("[")
    end_bracket = cleaned.rfind("]")
    if start_bracket != -1 and end_bracket > start_bracket:
        return cleaned[start_bracket:end_bracket + 1]

    start_brace = cleaned.find("{")
    end_brace = cleaned.rfind("}")
    if start_brace != -1 and end_brace > start_brace:
        return cleaned[start_brace:end_brace + 1]

    return cleaned

def call_gemini(prompt: str) -> str | None:
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY is not set.")
        return None

    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ]
    }

    for model in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
        logger.info("Calling Gemini API with model: %s", model)
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        text = parts[0]["text"]
                        logger.info("Gemini API call succeeded with model: %s", model)
                        return text
            else:
                logger.warning("Gemini model %s returned status %s: %s", model, resp.status_code, resp.text)
        except Exception as e:
            logger.warning("Gemini model %s call failed: %s", model, e)

    logger.error("All Gemini API models failed to respond.")
    return None

def generate_quiz(skill: str) -> list[dict]:
    logger.info("Generating MCQs for skill: %s", skill)
    prompt = (
        "Act as a Technical Interviewer. Generate 5 multiple-choice questions (MCQ) for the skill '" + skill + "'.\n\n"
        "STRICT OUTPUT RULES:\n"
        "1. Return ONLY a valid JSON array.\n"
        "2. Do NOT use markdown code blocks (no ```json).\n"
        '3. Format: [{"question": "...", "options": ["A","B","C","D"], "correctIndex": 0}]\n'
        "4. Make questions progressively harder (1=easy, 5=very hard)."
    )

    raw_response = call_gemini(prompt)
    if raw_response:
        try:
            cleaned = clean_json_text(raw_response)
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and len(parsed) == 5:
                return parsed
        except Exception as e:
            logger.error("Failed to parse Gemini quiz JSON: %s", e)

    logger.warning("Serving rich emergency quiz for skill: %s", skill)
    return get_emergency_quiz(skill)

def get_feedback(skill: str, score: int, total: int = 5) -> str:
    pct = round((score / total) * 100) if total > 0 else 0
    prompt = (
        f"A student scored {score} out of {total} ({pct}%) on a {skill} quiz.\n"
        f"Write 3 sentences of personalized feedback:\n"
        f"1. Acknowledge their performance.\n"
        f"2. Identify the most important concept they should study in {skill}.\n"
        f"3. Suggest ONE free resource (like a YouTube channel, official docs, or website) to improve.\n"
        f"Keep it encouraging and concise. Return plain text only."
    )

    raw = call_gemini(prompt)
    if raw and raw.strip():
        return raw.strip()

    if pct >= 80:
        return (
            f"Great job on your {skill} quiz! Your score of {score}/{total} shows solid understanding. "
            f"Keep building practical projects to reinforce your knowledge. "
            f"Check out the official documentation for deeper insights."
        )
    return (
        f"You scored {score}/{total} on {skill} - don't be discouraged! "
        f"Focus on the fundamentals first, particularly core concepts and syntax. "
        f"FreeCodeCamp and YouTube tutorials are excellent free resources to build your confidence."
    )

def get_skill_gap_plan(user_skills: list[str], target_role: str, required_skills: list[str]) -> dict:
    user_skills_lower = [s.lower().strip() for s in (user_skills or [])]
    missing_skills = [
        req for req in (required_skills or [])
        if req.lower().strip() not in user_skills_lower
    ]

    if not missing_skills:
        return {
            "gapSkills": [],
            "plan": {
                "summary": "You already have all the required skills for this role!",
                "weeks": [],
                "tip": "Focus on building advanced projects to demonstrate your experience."
            }
        }

    user_skills_text = ", ".join(user_skills) if user_skills else "no skills listed yet"
    missing_skills_text = ", ".join(missing_skills)
    role_text = target_role or "Software Engineer"

    prompt = (
        f"A student wants to become a {role_text}.\n"
        f"They have: {user_skills_text}.\n"
        f"They are missing: {missing_skills_text}.\n\n"
        "Create a concise 30-day learning plan in JSON format:\n"
        "{\n"
        '  "summary": "one sentence overview",\n'
        '  "weeks": [\n'
        '    { "week": 1, "focus": "skill name", "goal": "what to achieve", "resource": "https://example.com/..." },\n'
        '    { "week": 2, ... },\n'
        '    { "week": 3, ... },\n'
        '    { "week": 4, ... }\n'
        "  ],\n"
        '  "tip": "one motivational tip"\n'
        "}\n"
        'CRITICAL: The "resource" field MUST be a real, full clickable URL starting with https://. '
        "Use actual website URLs such as https://www.youtube.com/results?search_query=... or https://www.freecodecamp.org/ or official documentation links. "
        "NEVER return plain text like 'Search X on YouTube'. Always return a real https:// URL.\n"
        "Return ONLY valid JSON, no markdown."
    )

    raw = call_gemini(prompt)
    if raw:
        try:
            cleaned = clean_json_text(raw)
            plan = json.loads(cleaned)
            return {"gapSkills": missing_skills, "plan": plan}
        except Exception as e:
            logger.error("Failed to parse Gemini skill gap plan: %s", e)

    # Fallback 30-day curriculum
    fallback_weeks = []
    count = min(len(missing_skills), 4)
    for i in range(count):
        sk = missing_skills[i]
        encoded = urllib.parse.quote_plus(f"{sk} tutorial")
        fallback_weeks.append({
            "week": i + 1,
            "focus": sk,
            "goal": f"Complete beginner to intermediate {sk} tutorial and mini project",
            "resource": f"https://www.youtube.com/results?search_query={encoded}"
        })

    fallback_plan = {
        "summary": f"You need to learn {len(missing_skills)} skill(s) to qualify.",
        "weeks": fallback_weeks,
        "tip": "Consistency beats intensity. 1 hour daily is better than 7 hours once a week!"
    }
    return {"gapSkills": missing_skills, "plan": fallback_plan}

def get_emergency_quiz(skill: str) -> list[dict]:
    key = skill.lower().strip() if skill else ""
    
    if "java" in key and "script" not in key:
        return [
            {"question": "Which of the following is NOT a primitive data type in Java?", "options": ["int", "double", "String", "boolean"], "correctIndex": 2},
            {"question": "What is the size of an int data type in Java?", "options": ["8-bit", "16-bit", "32-bit", "64-bit"], "correctIndex": 2},
            {"question": "Which class is the superclass of all classes in Java?", "options": ["String", "Object", "Class", "System"], "correctIndex": 1},
            {"question": "What is used to handle exceptions in Java?", "options": ["try-catch", "throw", "throws", "All of the above"], "correctIndex": 3},
            {"question": "Which keyword is used to inherit a class in Java?", "options": ["implements", "extends", "inherits", "super"], "correctIndex": 1}
        ]
    elif "python" in key:
        return [
            {"question": "Which of the following is a mutable data type in Python?", "options": ["tuple", "list", "str", "int"], "correctIndex": 1},
            {"question": "How do you start a comment in Python?", "options": ["//", "/*", "#", "--"], "correctIndex": 2},
            {"question": "What does the len() function do in Python?", "options": ["Returns length", "Returns type", "Returns value", "Prints text"], "correctIndex": 0},
            {"question": "Which keyword is used to define a function in Python?", "options": ["func", "def", "function", "define"], "correctIndex": 1},
            {"question": "What is the correct file extension for Python files?", "options": [".py", ".pyt", ".pyw", ".python"], "correctIndex": 0}
        ]
    elif "javascript" in key or key == "js":
        return [
            {"question": "Which keyword is used to declare a block-scoped variable in JavaScript?", "options": ["var", "let", "const", "Both let and const"], "correctIndex": 3},
            {"question": "What is the result of 'typeof null' in JavaScript?", "options": ["null", "undefined", "object", "string"], "correctIndex": 2},
            {"question": "How do you write an arrow function in JavaScript?", "options": ["() => {}", "function()", "arrow {}", "() -> {}"], "correctIndex": 0},
            {"question": "Which method adds one or more elements to the end of an array?", "options": ["pop()", "push()", "shift()", "unshift()"], "correctIndex": 1},
            {"question": "What is the purpose of the 'use strict' directive?", "options": ["Enforces strict coding rules", "Enables new features", "Improves performance", "None of the above"], "correctIndex": 0}
        ]
    elif "typescript" in key or key == "ts":
        return [
            {"question": "Which of the following is a key feature of TypeScript?", "options": ["Dynamic typing", "Static typing", "No type checking", "Interpreted execution"], "correctIndex": 1},
            {"question": "How do you define an optional property in a TypeScript interface?", "options": ["propName!", "propName?", "propName*", "propName:optional"], "correctIndex": 1},
            {"question": "Which keyword is used to create a type alias in TypeScript?", "options": ["alias", "interface", "type", "def"], "correctIndex": 2},
            {"question": "What does the 'any' type mean in TypeScript?", "options": ["Allows any type value", "Throws compile error", "Strictly type-safe", "None of the above"], "correctIndex": 0},
            {"question": "How does the TypeScript compiler produce browser-ready code?", "options": ["Compiles to bytecode", "Compiles to JavaScript", "Runs directly without compilation", "None of the above"], "correctIndex": 1}
        ]
    elif "html" in key:
        return [
            {"question": "What does HTML stand for?", "options": ["Hyper Text Markup Language", "High Tech Modern Language", "Hyperlink Text Markup Language", "Home Tool Markup Language"], "correctIndex": 0},
            {"question": "Which HTML element is used for the largest heading?", "options": ["<heading>", "<h6>", "<head>", "<h1>"], "correctIndex": 3},
            {"question": "What is the correct HTML element for inserting a line break?", "options": ["<break>", "<lb>", "<br>", "<hr>"], "correctIndex": 2},
            {"question": "Which attribute is used to specify a unique identifier for an element?", "options": ["class", "id", "name", "style"], "correctIndex": 1},
            {"question": "Which HTML element is used to define an unordered list?", "options": ["<ul>", "<ol>", "<li>", "<list>"], "correctIndex": 0}
        ]
    elif "css" in key:
        return [
            {"question": "What does CSS stand for?", "options": ["Computer Style Sheets", "Creative Style Sheets", "Cascading Style Sheets", "Colorful Style Sheets"], "correctIndex": 2},
            {"question": "Where in an HTML document is the correct place to refer to an external style sheet?", "options": ["In the <body> section", "In the <head> section", "At the end of the document", "None of the above"], "correctIndex": 1},
            {"question": "Which CSS property is used to change the background color?", "options": ["color", "background-color", "bgcolor", "background"], "correctIndex": 1},
            {"question": "Which CSS property controls the text size?", "options": ["font-size", "text-size", "font-style", "size"], "correctIndex": 0},
            {"question": "How do you select an element with id 'demo' in CSS?", "options": [".demo", "#demo", "*demo", "demo"], "correctIndex": 1}
        ]
    elif "react" in key:
        return [
            {"question": "What is the virtual DOM in React?", "options": ["A direct copy of the HTML DOM", "An in-memory representation of the real DOM", "A browser extension", "A database configuration"], "correctIndex": 1},
            {"question": "Which hook is used to handle state in functional React components?", "options": ["useEffect", "useState", "useContext", "useReducer"], "correctIndex": 1},
            {"question": "How do you pass data from parent to child component in React?", "options": ["State", "Context", "Props", "Refs"], "correctIndex": 2},
            {"question": "What is the correct syntax to render a list of items in React?", "options": ["items.forEach()", "items.map()", "items.filter()", "items.loop()"], "correctIndex": 1},
            {"question": "Which hook is used to perform side effects in functional components?", "options": ["useState", "useMemo", "useCallback", "useEffect"], "correctIndex": 3}
        ]
    elif "node" in key:
        return [
            {"question": "What is Node.js?", "options": ["A frontend framework", "A JavaScript runtime environment", "A database system", "A package manager"], "correctIndex": 1},
            {"question": "Which module is used in Node.js to create an HTTP server?", "options": ["fs", "url", "http", "path"], "correctIndex": 2},
            {"question": "What is NPM in the context of Node.js?", "options": ["Node Project Manager", "Node Package Manager", "New Package Module", "None of the above"], "correctIndex": 1},
            {"question": "Which of the following is used to import a CommonJS module in Node.js?", "options": ["import", "require", "include", "fetch"], "correctIndex": 1},
            {"question": "How does Node.js handle asynchronous operations?", "options": ["Multi-threading", "Single-threaded Event Loop", "Blocking I/O", "By sleeping the process"], "correctIndex": 1}
        ]
    elif "sql" in key or "postgres" in key or "mysql" in key:
        return [
            {"question": "Which SQL statement is used to retrieve data from a database?", "options": ["GET", "SELECT", "EXTRACT", "OPEN"], "correctIndex": 1},
            {"question": "Which SQL clause is used to filter records?", "options": ["GROUP BY", "ORDER BY", "WHERE", "HAVING"], "correctIndex": 2},
            {"question": "What is a Primary Key in a relational database?", "options": ["A key that uniquely identifies a row", "A key that allows null values", "A key used for styling", "A key that duplicates data"], "correctIndex": 0},
            {"question": "Which join returns all rows when there is a match in either table?", "options": ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL OUTER JOIN"], "correctIndex": 3},
            {"question": "What does the GROUP BY statement do?", "options": ["Filters row values", "Sorts row values", "Groups rows with same values into summary rows", "None of the above"], "correctIndex": 2}
        ]
    elif "docker" in key:
        return [
            {"question": "What is Docker?", "options": ["A database engine", "A containerization platform", "A code editor", "An operating system"], "correctIndex": 1},
            {"question": "What file is used to define the instructions to build a Docker image?", "options": ["docker.config", "Dockerbuild", "Dockerfile", "docker.yaml"], "correctIndex": 2},
            {"question": "Which command is used to list running Docker containers?", "options": ["docker list", "docker run", "docker ps", "docker images"], "correctIndex": 2},
            {"question": "What is the purpose of Docker Hub?", "options": ["To host Git code", "To download code dependencies", "To share and store Docker images", "None of the above"], "correctIndex": 2},
            {"question": "Which docker command runs a container from an image?", "options": ["docker build", "docker start", "docker run", "docker execute"], "correctIndex": 2}
        ]
    else:
        return [
            {"question": f"What is the primary purpose of {skill}?", "options": ["Data storage", "Building applications", "Network communication", "All of the above"], "correctIndex": 3},
            {"question": f"Which paradigm is {skill} most associated with?", "options": ["Procedural", "Object-Oriented", "Functional", "Depends on usage"], "correctIndex": 3},
            {"question": f"What is a common use case of {skill} in production?", "options": ["Frontend UI", "Backend APIs", "Data pipelines", "All are valid"], "correctIndex": 3},
            {"question": f"Which tool pairs best with {skill} for deployment?", "options": ["Docker", "Jenkins", "AWS", "All of the above"], "correctIndex": 3},
            {"question": f"What is best practice when using {skill} in team environments?", "options": ["Version control", "Code reviews", "Testing", "All of the above"], "correctIndex": 3}
        ]
