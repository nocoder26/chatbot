from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat
from dotenv import load_dotenv
import os

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

@app.get("/")
def root():
    return {"status": "Active", "message": "Fertility Bot is Online"}

from fastapi import UploadFile, File
import base64
from groq import Groq
import os

# Initialize the AI Client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

@app.post("/analyze-bloodwork")
async def analyze_bloodwork(file: UploadFile = File(...)):
    # 1. Read the image file and convert to text the AI can read
    image_data = await file.read()
    base64_image = base64.b64encode(image_data).decode('utf-8')
    
    # 2. Ask Llama 3.2 Vision to extract the data
    prompt = "Extract all blood test values (FSH, AMH, LH, Estradiol) and units. Return ONLY JSON."
    
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
        response_format={"type": "json_object"}
    )
    
    # 3. Send the found data back to the user to confirm
    return chat_completion.choices[0].message.content
