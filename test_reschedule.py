
from datetime import datetime
from zoneinfo import ZoneInfo

from services.booking_service import reschedule_appointment

IST = ZoneInfo("Asia/Kolkata")

result = reschedule_appointment(
    appointment_id=6,
    patient_phone="TEST-RESCHEDULE-001",
    new_start_time=datetime(
        2026, 11, 5, 15, 0, tzinfo=IST
    ),
)

print("\n--- RESCHEDULE TEST RESULT ---")
print(result)
