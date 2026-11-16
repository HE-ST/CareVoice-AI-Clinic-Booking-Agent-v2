
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

BASE_DIR = Path(__file__).resolve().parent
TOKEN_FILE = BASE_DIR / "token.json"

SCOPES = ["https://www.googleapis.com/auth/calendar"]
TIMEZONE = ZoneInfo("Asia/Kolkata")


def main():
    if not TOKEN_FILE.exists():
        raise FileNotFoundError("token.json not found. Run OAuth setup first.")

    credentials = Credentials.from_authorized_user_file(
        str(TOKEN_FILE), SCOPES
    )
    service = build("calendar", "v3", credentials=credentials)

    start_time = datetime.now(TIMEZONE) + timedelta(days=1)
    start_time = start_time.replace(
        hour=11, minute=0, second=0, microsecond=0
    )

    # If 11 AM has already passed today, the date is still tomorrow.
    end_time = start_time + timedelta(minutes=15)

    event = {
        "summary": "AI Booking Agent - Test Appointment",
        "description": "Test event created by the college project.",
        "start": {
            "dateTime": start_time.isoformat(),
            "timeZone": "Asia/Kolkata",
        },
        "end": {
            "dateTime": end_time.isoformat(),
            "timeZone": "Asia/Kolkata",
        },
    }

    created_event = service.events().insert(
        calendarId="primary",
        body=event,
    ).execute()

    print("Test event created successfully!")
    print("Event ID:", created_event["id"])
    print("Start:", start_time.strftime("%d %B %Y, %I:%M %p IST"))
    print("Event link:", created_event.get("htmlLink", ""))


if __name__ == "__main__":
    main()
