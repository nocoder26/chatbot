import os
import json
import io
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat, admin
from dotenv import load_dotenv
from groq import Groq
from pypdf import PdfReader

load_dotenv()

app = FastAPI()

# --- CORS SETTINGS (THE CRITICAL FIX) ---
# allow_origins=["*"] tells the server to accept requests from ANY website.
# This fixes the "blocked by CORS policy" error instantly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONNECT THE CHAT LOGIC ---
app.include_router(chat.router)
app.include_router(admin.router)

# --- AI CLIENT ---
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

@app.get("/")
def root():
    return {"status": "Active", "message": "Fertility Bot is Online"}

@app.post("/analyze-bloodwork")
async def analyze_bloodwork(file: UploadFile = File(...)):
    """Receives a PDF of blood work, extracts text, and maps to JSON."""
    
    # 1. Quick validation to ensure it's a PDF
    if not file.filename.lower().endswith('.pdf') and file.content_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="File must be a PDF")
        
    try:
        # 2. Read PDF and extract text using open-source PyPDF
        file_bytes = await file.read()
        pdf_file = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_file)
        
        extracted_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
                
        if not extracted_text.strip():
            return {"results": [], "error": "Could not extract any text from the PDF. It might be a scanned image without OCR."}

        # 3. Prompt for strict JSON extraction using the raw text
        prompt = f"""
        You are a medical data extractor. Read the following raw text extracted from a patient's blood/lab test report.
        Extract ALL blood test values (like FSH, AMH, LH, Estradiol, TSH, Prolactin, etc.) and their specific units.
        
        RAW TEXT FROM REPORT:
        {extracted_text}
        
        Return ONLY a JSON object in this exact format:
        {{
            "results": [
                {{"name": "FSH", "value": "5.4", "unit": "mIU/mL"}},
                {{"name": "AMH", "value": "1.2", "unit": "ng/mL"}}
            ]
        }}
        If you cannot find any lab results, return {{"results": []}}. Do not include any other text.
        """
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile", # High-accuracy text model
            response_format={"type": "json_object"},
            temperature=0.1
        )
        
        # 4. Parse and return as a proper JSON object
        return json.loads(chat_completion.choices[0].message.content)

    except Exception as e:
        print(f"PDF Parsing/Extraction Error: {e}")
        return {"results": []}
