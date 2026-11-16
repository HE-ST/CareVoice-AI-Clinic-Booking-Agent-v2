
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from services.calendar_service import create_calendar_event

timezone = ZoneInfo("Asia/Kolkata")

start_time = datetime.now(timezone) + timedelta(days=3)
start_time = start_time.replace(
    hour=12, minute=0, second=0, microsecond=0
)
end_time = start_time + timedelta(minutes=15)

result = create_calendar_event(
    patient_name="Test Patient",
    doctor_name="Dr. Amit Sharma",
    start_time=start_time,
    end_time=end_time,
    patient_phone="TEST-001",
)

print("Calendar service test successful!")
print("Event ID:", result["event_id"])
print("Event link:", result["event_link"])
