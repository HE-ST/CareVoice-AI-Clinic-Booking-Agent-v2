
from pathlib import Path
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

BASE_DIR = Path(__file__).resolve().parent.parent
TOKEN_FILE = BASE_DIR / "token.json"

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def get_calendar_service():
    """Connect to the user's Google Calendar."""

    if not TOKEN_FILE.exists():
        raise FileNotFoundError(
            "token.json not found. Run test_calendar.py first."
        )

    credentials = Credentials.from_authorized_user_file(
        str(TOKEN_FILE), SCOPES
    )

    if credentials.expired:
        if credentials.refresh_token:
            credentials.refresh(Request())
        else:
            raise RuntimeError(
                "Google Calendar token expired and no refresh token is available. "
                "Please authenticate again."
            )

    return build("calendar", "v3", credentials=credentials)


def create_calendar_event(
    patient_name: str,
    doctor_name: str,
    start_time: datetime,
    end_time: datetime,
    patient_phone: str | None = None,
):
    """Create an appointment event in Google Calendar."""

    service = get_calendar_service()

    event = {
        "summary": f"Clinic Appointment - {doctor_name}",
        "description": (
            f"Patient: {patient_name}\n"
            f"Doctor: {doctor_name}\n"
            f"Phone: {patient_phone or 'Not provided'}"
        ),
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

    return {
        "event_id": created_event["id"],
        "event_link": created_event.get("htmlLink", ""),
    }


def update_calendar_event(
    event_id: str,
    start_time: datetime,
    end_time: datetime,
):
    """Update the timing of an existing Google Calendar event."""

    service = get_calendar_service()

    updated_event = service.events().patch(
        calendarId="primary",
        eventId=event_id,
        body={
            "start": {
                "dateTime": start_time.isoformat(),
                "timeZone": "Asia/Kolkata",
            },
            "end": {
                "dateTime": end_time.isoformat(),
                "timeZone": "Asia/Kolkata",
            },
        },
    ).execute()

    return {
        "event_id": updated_event["id"],
        "event_link": updated_event.get("htmlLink", ""),
        "status": updated_event.get("status", ""),
    }
