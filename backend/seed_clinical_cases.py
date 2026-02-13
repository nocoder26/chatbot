import json
import os
from groq import Groq

# Use Llama 3.3 to generate 50 clinical cases
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

SCENARIOS = [
    "35yo with PCOS, high AMH, irregular cycles",
    "40yo with low ovarian reserve, FSH 15, AMH 0.4",
    "28yo donor, perfect hormone levels",
    "33yo with endometriosis, normal FSH, low-normal AMH"
]

def generate_cases():
    print("Generating 50 synthetic 'Golden Records'...")
    for i in range(50):
        scenario = SCENARIOS[i % len(SCENARIOS)]
        prompt = f"Create a realistic fertility blood profile JSON for: {scenario}. Include FSH, AMH, LH, and a short interpretation."
        
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        print(f"Generated Case {i+1}: {scenario}")

if __name__ == "__main__":
    generate_cases()