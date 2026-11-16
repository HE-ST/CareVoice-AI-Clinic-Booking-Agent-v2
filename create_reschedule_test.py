from datetime import datetime
from zoneinfo import ZoneInfo

from services.booking_service import book_appointment

IST = ZoneInfo("Asia/Kolkata")

result = book_appointment(
    patient_name="Reschedule Test Patient",
    patient_phone="TEST-RESCHEDULE-001",
    doctor_id=1,
    start_time=datetime(2026, 11, 5, 14, 0, tzinfo=IST),
)

print(result)