from pydantic import BaseModel
from typing import Optional

class BloodWorkData(BaseModel):
    # Core Fertility Markers
    fsh: Optional[float] = None  # mIU/mL
    amh: Optional[float] = None  # ng/mL
    lh: Optional[float] = None   # mIU/mL
    estradiol: Optional[float] = None # pg/mL
    
    # Metadata for Context
    cycle_day: int 
    is_verified: bool = False
    raw_ocr_text: str  # This stores exactly what the AI read from the image
