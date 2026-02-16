import os
import json
import io
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.routers import chat, admin
from dotenv import load_dotenv
from groq import Groq
from pypdf import PdfReader

load_dotenv()

logger = logging.getLogger("izana")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# --- RATE LIMITER ---
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Izana AI", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- CORS SETTINGS ---
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "")
CORS_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX", "")

cors_config = {
    "allow_credentials": True,
    "allow_methods": ["GET", "POST"],
    "allow_headers": ["Content-Type", "Authorization", "X-Admin-Key"],
}

if CORS_REGEX:
    cors_config["allow_origin_regex"] = CORS_REGEX
elif ALLOWED_ORIGINS_RAW:
    cors_config["allow_origins"] = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",")]
else:
    cors_config["allow_origin_regex"] = r"https://.*\.vercel\.app|http://localhost:\d+"
    logger.info("No CORS origins configured; defaulting to *.vercel.app + localhost")

app.add_middleware(CORSMiddleware, **cors_config)

# --- CONNECT ROUTERS ---
app.include_router(chat.router)
app.include_router(admin.router)

# --- AI CLIENT ---
groq_api_key = os.getenv("GROQ_API_KEY")
if not groq_api_key:
    logger.warning("GROQ_API_KEY not set - /analyze-bloodwork will not function")
client = Groq(api_key=groq_api_key) if groq_api_key else None

BLOODWORK_MODEL = os.getenv("BLOODWORK_MODEL", "llama-3.3-70b-versatile")


@app.get("/")
def root():
    return {"status": "Active", "message": "Izana AI is Online", "version": "2.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/analyze-bloodwork")
@limiter.limit("10/minute")
async def analyze_bloodwork(request: Request, file: UploadFile = File(...)):
    """Receives a PDF of blood work, extracts text, and maps to JSON."""
    if not client:
        raise HTTPException(status_code=503, detail="AI service not configured")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.lower().endswith('.pdf') and file.content_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="File must be a PDF")

    try:
        file_bytes = await file.read()

        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB"
            )

        pdf_file = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_file)

        extracted_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"

        if not extracted_text.strip():
            return {
                "results": [],
                "error": "Could not extract any text from the PDF. It might be a scanned image without OCR."
            }

        max_text_length = 15000
        if len(extracted_text) > max_text_length:
            extracted_text = extracted_text[:max_text_length]

        prompt = f"""You are a medical lab data extractor. Your task is to extract EVERY SINGLE test result from the following blood/lab report text.

CRITICAL INSTRUCTIONS:
- Extract ALL test results found in the report, not just fertility-related ones.
- Include complete blood count (CBC), metabolic panel, thyroid, hormones, vitamins, lipids, liver function, kidney function, and any other tests present.
- For each test, extract the test name, numeric value, and unit exactly as shown.
- Do NOT skip any test. Do NOT summarize. Extract every individual line item.

RAW TEXT FROM REPORT:
---
{extracted_text}
---

Return ONLY a JSON object in this exact format:
{{"results": [{{"name": "TEST NAME", "value": "NUMERIC VALUE", "unit": "UNIT"}}, ...]}}

Extract every test. If a test has no unit listed, use an empty string for unit.
If you cannot find any lab results at all, return {{"results": []}}."""

        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=BLOODWORK_MODEL,
            response_format={"type": "json_object"},
            temperature=0.1
        )

        return json.loads(chat_completion.choices[0].message.content)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process the PDF file")
