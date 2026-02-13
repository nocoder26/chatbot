import json
import os
import time
from groq import Groq
from pinecone import Pinecone
import openai

# 1. Initialize Connections
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
index = pc.Index("fertility-assistant") # Your Pinecone Index Name

SCENARIOS = [
    "35yo with PCOS, high AMH (6.5), irregular cycles, high LH",
    "40yo with low ovarian reserve, FSH 15, AMH 0.4, regular cycles",
    "28yo donor, perfect hormone levels, AMH 3.0, FSH 6.0",
    "33yo with endometriosis, normal FSH, low-normal AMH (1.2), pain symptoms",
    "38yo unexplained infertility, all markers normal, failed IUI",
    "42yo very low reserve, FSH 25, AMH 0.1, considering donor eggs"
]

def generate_and_save():
    print("🚀 Starting Synthetic Data Engine...")
    
    for i in range(20): # Let's generate 20 high-quality cases first
        scenario = SCENARIOS[i % len(SCENARIOS)]
        print(f"Generating Case {i+1}: {scenario}...")
        
        # A. Generate the profile using Llama 3.3
        prompt = f"""
        Generate a realistic JSON for a fertility patient: {scenario}.
        Must include 'results' (list of name/value/unit), 'cycle_day', and 'interpretation'.
        Return ONLY JSON.
        """
        
        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            case_data = json.loads(completion.choices[0].message.content)
            
            # B. Create the Text Summary for Search
            # "Cycle Day: 3. Results: FSH 15, AMH 0.4. Interp: Low reserve..."
            memory_text = f"Cycle Day: {case_data.get('cycle_day', 3)}. Results: "
            for r in case_data.get('results', []):
                memory_text += f"{r.get('name')}: {r.get('value')} {r.get('unit')}, "
            memory_text += f" Diagnosis: {case_data.get('interpretation')}"

            # C. Create Embedding (Vector)
            embedding = openai.embeddings.create(
                input=memory_text,
                model="text-embedding-ada-002"
            ).data[0].embedding

            # D. Upsert to Pinecone (The "Save" Step)
            index.upsert(
                vectors=[{
                    "id": f"synthetic_case_{i}",
                    "values": embedding,
                    "metadata": {
                        "text": memory_text,
                        "type": "synthetic_clinical",
                        "scenario": scenario
                    }
                }],
                namespace="clinical-cases-staging"
            )
            print(f"✅ Saved Case {i+1} to Pinecone!")
            time.sleep(1) # Avoid rate limits

        except Exception as e:
            print(f"❌ Failed Case {i+1}: {e}")

if __name__ == "__main__":
    generate_and_save()