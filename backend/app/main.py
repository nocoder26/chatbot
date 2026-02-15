import os
import json
import base64
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat, admin
from dotenv import load_dotenv
from groq import Groq

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
    """Receives an image of blood work and extracts the numbers into JSON."""
    try:
        # Read and encode image
        image_data = await file.read()
        base64_image = base64.b64encode(image_data).decode('utf-8')
        
        # Prompt for strict JSON extraction
        prompt = """
        You are a medical data extractor. Look at the provided image of a blood/lab test report.
        Extract ALL blood test values (like FSH, AMH, LH, Estradiol, TSH, Prolactin, etc.) and their specific units.
        
        Return ONLY a JSON object in this exact format:
        {
            "results": [
                {"name": "FSH", "value": "5.4", "unit": "mIU/mL"},
                {"name": "AMH", "value": "1.2", "unit": "ng/mL"}
            ]
        }
        If you cannot read anything, return {"results": []}. Do not include any other text.
        """
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                        },
                    ],
                }
            ],
            model="llama-3.2-11b-vision-preview",
            response_format={"type": "json_object"},
            temperature=0.1
        )
        
        # Parse and return as a proper JSON object
        return json.loads(chat_completion.choices[0].message.content)

    except Exception as e:
        print(f"Vision Error: {e}")
        return {"results": []}
