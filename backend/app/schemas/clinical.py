from pydantic import BaseModel
from typing import List, Optional

class LabResult(BaseModel):
    name: str        # e.g., "Hemoglobin", "TSH", "FSH"
    value: str       # e.g., "12.5", "0.4" (String handles "< 0.1" cases)
    unit: str        # e.g., "g/dL", "mIU/L"
    category: str    # e.g., "Hormone", "Hematology", "Unknown"

class BloodWorkData(BaseModel):
    # Instead of hardcoding FSH/AMH, we just have a list of results
    results: List[LabResult] 
    
    # Metadata
    cycle_day: int
    is_verified: bool = False
    raw_ocr_text: str
    admin_notes: Optional[str] = None