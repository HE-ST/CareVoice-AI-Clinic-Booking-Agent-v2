
import os
import psycopg
from dotenv import load_dotenv
from services.calendar_service import get_calendar_service

load_dotenv(".env.local")

appointment_id = 6

# Check PostgreSQL
with psycopg.connect(os.getenv("DATABASE_URL")) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT start_time, end_time, status,
                   google_calendar_event_id
            FROM appointments
            WHERE id = %s
        """, (appointment_id,))

        appointment = cur.fetchone()

print("\n--- POSTGRESQL ---")
print(appointment)

# Check Google Calendar
event_id = appointment[3]
service = get_calendar_service()

event = service.events().get(
    calendarId="primary",
    eventId=event_id,
).execute()

print("\n--- GOOGLE CALENDAR ---")
print("Event ID:", event["id"])
print("Start:", event["start"]["dateTime"])
print("End:", event["end"]["dateTime"])
print("Status:", event["status"])
