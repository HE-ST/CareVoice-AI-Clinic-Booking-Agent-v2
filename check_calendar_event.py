
from services.calendar_service import get_calendar_service

EVENT_ID = "nngtnlsg8oufh2mdhqnsbdp16s"

service = get_calendar_service()

event = service.events().get(
    calendarId="primary",
    eventId=EVENT_ID,
).execute()

print("Event:", event.get("summary"))
print("Start:", event.get("start"))
print("End:", event.get("end"))
