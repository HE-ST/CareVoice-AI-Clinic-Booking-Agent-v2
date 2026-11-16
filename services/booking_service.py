
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from psycopg import errors
from dotenv import load_dotenv

from services.calendar_service import (
    create_calendar_event,
    get_calendar_service,
    update_calendar_event,
)

load_dotenv(".env.local")

INDIA_TZ = ZoneInfo("Asia/Kolkata")


def get_database_url():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing from .env.local")
    return database_url


def get_available_doctors(specialty: str | None = None) -> list[dict]:
    """Return active doctors, optionally filtered by specialty."""
    query = """
        SELECT id, full_name, specialty, appointment_duration_minutes
        FROM doctors
        WHERE is_active = TRUE
    """
    params = ()

    if specialty:
        query += " AND specialty ILIKE %s"
        params = (f"%{specialty}%",)

    query += " ORDER BY full_name"

    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "name": row[1],
            "specialty": row[2],
            "appointment_duration_minutes": row[3],
        }
        for row in rows
    ]


def check_appointment_availability(
    doctor_id: int,
    start_time: datetime,
    exclude_appointment_id: int | None = None,
) -> dict:
    """Check whether a doctor is active and available."""
    if start_time.tzinfo is None or start_time.utcoffset() is None:
        return {
            "available": False,
            "message": "Appointment time must include a timezone.",
        }

    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT appointment_duration_minutes
                FROM doctors
                WHERE id = %s AND is_active = TRUE
                """,
                (doctor_id,),
            )
            doctor = cur.fetchone()

            if doctor is None:
                return {
                    "available": False,
                    "message": "Doctor not found or inactive.",
                }

            duration = timedelta(minutes=doctor[0])
            end_time = start_time + duration

            query = """
                SELECT EXISTS (
                    SELECT 1
                    FROM appointments
                    WHERE doctor_id = %s
                      AND status IN ('pending', 'confirmed')
                      AND start_time < %s
                      AND end_time > %s
            """

            params = [doctor_id, end_time, start_time]

            if exclude_appointment_id is not None:
                query += " AND id <> %s"
                params.append(exclude_appointment_id)

            query += ")"

            cur.execute(query, params)
            has_conflict = cur.fetchone()[0]

    return {
        "available": not has_conflict,
        "duration_minutes": doctor[0],
        "message": (
            "Slot is available."
            if not has_conflict
            else "This time slot conflicts with an existing appointment."
        ),
    }


def book_appointment(
    patient_name: str,
    patient_phone: str,
    doctor_id: int,
    start_time: datetime,
) -> dict:
    """
    Reserve a database slot, create its calendar event,
    and confirm only after both operations succeed.
    """
    if not patient_name or not patient_name.strip():
        return {"success": False, "message": "Patient name is required."}

    if not patient_phone or not patient_phone.strip():
        return {"success": False, "message": "Patient phone is required."}

    if start_time.tzinfo is None or start_time.utcoffset() is None:
        return {
            "success": False,
            "message": "Appointment time must include a timezone.",
        }

    database_url = get_database_url()
    event_id = None
    appointment_id = None

    # Step 1: Reserve the slot in PostgreSQL.
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT full_name, appointment_duration_minutes
                    FROM doctors
                    WHERE id = %s AND is_active = TRUE
                    """,
                    (doctor_id,),
                )
                doctor = cur.fetchone()

                if doctor is None:
                    return {
                        "success": False,
                        "message": "Doctor not found or inactive.",
                    }

                doctor_name, duration_minutes = doctor
                end_time = start_time + timedelta(minutes=duration_minutes)

                cur.execute(
                    """
                    INSERT INTO patients (full_name, phone)
                    VALUES (%s, %s)
                    ON CONFLICT (phone)
                    DO UPDATE SET full_name = EXCLUDED.full_name
                    RETURNING id
                    """,
                    (patient_name.strip(), patient_phone.strip()),
                )
                patient_id = cur.fetchone()[0]

                cur.execute(
                    """
                    INSERT INTO appointments
                        (patient_id, doctor_id, start_time, end_time, status)
                    VALUES (%s, %s, %s, %s, 'pending')
                    RETURNING id
                    """,
                    (patient_id, doctor_id, start_time, end_time),
                )
                appointment_id = cur.fetchone()[0]

    except errors.ExclusionViolation:
        return {
            "success": False,
            "message": (
                "That appointment slot was just booked. "
                "Please choose another time."
            ),
        }
    except Exception:
        return {
            "success": False,
            "message": "Could not reserve the appointment. Please try again.",
        }

    # Step 2: Create the Google Calendar event.
    try:
        calendar_start = start_time.astimezone(INDIA_TZ)
        calendar_end = end_time.astimezone(INDIA_TZ)
        print("DEBUG original start:", repr(start_time))
        print("DEBUG calendar start:", repr(calendar_start))
        print("DEBUG calendar end:", repr(calendar_end))
        

        event = create_calendar_event(
            patient_name=patient_name.strip(),
            doctor_name=doctor_name,
            start_time=calendar_start,
            end_time=calendar_end,
        )
        event_id = event["event_id"]
        

    except Exception:
        import logging
        logging.getLogger("booking_service").exception(
            "Google Calendar event creation failed"
        )
        # Calendar failed, so release the reserved database slot.
        try:
            with psycopg.connect(database_url) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE appointments
                        SET status = 'cancelled'
                        WHERE id = %s AND status = 'pending'
                        """,
                        (appointment_id,),
                    )
        except Exception:
            pass

        return {
            "success": False,
            "appointment_id": appointment_id,
            "message": (
                "The calendar event could not be created. "
                "The appointment has not been confirmed. Please try again."
            ),
        }

    # Step 3: Save the event ID and confirm the appointment.
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE appointments
                    SET google_calendar_event_id = %s,
                        status = 'confirmed'
                    WHERE id = %s AND status = 'pending'
                    RETURNING id
                    """,
                    (event_id, appointment_id),
                )

                if cur.fetchone() is None:
                    raise RuntimeError("Could not confirm the appointment.")

    except Exception:
        # Best-effort cleanup if PostgreSQL confirmation fails.
        try:
            from .calendar_service import get_calendar_service

            service = get_calendar_service()
            service.events().delete(
                calendarId="primary",
                eventId=event_id,
            ).execute()
        except Exception:
            pass

        try:
            with psycopg.connect(database_url) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE appointments
                        SET status = 'cancelled'
                        WHERE id = %s AND status = 'pending'
                        """,
                        (appointment_id,),
                    )
        except Exception:
            pass

        return {
            "success": False,
            "appointment_id": appointment_id,
            "message": (
                "The booking could not be confirmed in the database. "
                "Please check the appointment status before retrying."
            ),
        }

    return {
        "success": True,
        "appointment_id": appointment_id,
        "doctor": doctor_name,
        "start_time": calendar_start.isoformat(),
        "end_time": calendar_end.isoformat(),
        "status": "confirmed",
        "google_calendar_event_id": event_id,
        "message": "Appointment booked and confirmed successfully.",
    }

def get_upcoming_appointments(patient_phone: str) -> list[dict]:
    """Find upcoming confirmed appointments for a registered phone number."""

    if not patient_phone or not patient_phone.strip():
        return []

    query = """
        SELECT
            a.id,
            a.doctor_id,
            p.full_name,
            d.full_name,
            d.specialty,
            a.start_time,
            a.end_time,
            a.status
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors d ON a.doctor_id = d.id
        WHERE p.phone = %s
          AND a.status = 'confirmed'
          AND a.start_time > NOW()
        ORDER BY a.start_time
    """

    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(query, (patient_phone.strip(),))
            rows = cur.fetchall()

    return [
        {
            "appointment_id": row[0],
            "doctor_id": row[1],
            "patient_name": row[2],
            "doctor": row[3],
            "specialty": row[4],
            "start_time": row[5].isoformat(),
            "end_time": row[6].isoformat(),
            "status": row[7],
        }
        for row in rows
    ]


def get_all_appointments() -> list[dict]:
    """Fetch all appointments for the dashboard."""

    query = """
        SELECT
            a.id,
            a.doctor_id,
            p.full_name,
            d.full_name,
            d.specialty,
            a.start_time,
            a.end_time,
            a.status
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors d ON a.doctor_id = d.id
        ORDER BY a.start_time DESC
    """

    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()

    return [
        {
            "appointment_id": row[0],
            "doctor_id": row[1],
            "patient_name": row[2],
            "doctor": row[3],
            "specialty": row[4],
            "start_time": row[5].isoformat(),
            "end_time": row[6].isoformat(),
            "status": row[7],
        }
        for row in rows
    ]


def cancel_appointment(
    appointment_id: int,
    patient_phone: str,
) -> dict:
    """Cancel a patient's upcoming appointment and delete its calendar event."""

    if not patient_phone or not patient_phone.strip():
        return {
            "success": False,
            "message": "Patient phone number is required.",
        }

    database_url = get_database_url()

    # Step 1: Cancel the appointment in PostgreSQL.
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE appointments a
                    SET status = 'cancelled'
                    FROM patients p
                    WHERE a.patient_id = p.id
                      AND a.id = %s
                      AND p.phone = %s
                      AND a.status = 'confirmed'
                      AND a.start_time > NOW()
                    RETURNING
                        a.id,
                        a.google_calendar_event_id
                    """,
                    (appointment_id, patient_phone.strip()),
                )

                appointment = cur.fetchone()

                if appointment is None:
                    return {
                        "success": False,
                        "message": (
                            "No matching upcoming confirmed appointment "
                            "was found. Please check the appointment details."
                        ),
                    }

                cancelled_id, event_id = appointment

    except Exception:
        return {
            "success": False,
            "message": "Could not cancel the appointment. Please try again.",
        }

    # Step 2: Delete the corresponding Google Calendar event.
    if not event_id:
        return {
            "success": True,
            "appointment_id": cancelled_id,
            "calendar_deleted": False,
            "message": (
                "Appointment cancelled in the database, "
                "but no Google Calendar event ID was found."
            ),
        }

    try:
        service = get_calendar_service()

        service.events().delete(
            calendarId="primary",
            eventId=event_id,
        ).execute()

        return {
            "success": True,
            "appointment_id": cancelled_id,
            "calendar_deleted": True,
            "message": (
                "Appointment cancelled successfully, "
                "and Google Calendar event deleted."
            ),
        }

    except Exception:
        return {
            "success": True,
            "appointment_id": cancelled_id,
            "calendar_deleted": False,
            "message": (
                "Appointment cancelled in the database, "
                "but Google Calendar event deletion failed. "
                "Manual calendar cleanup is required."
            ),
        }

def reschedule_appointment(
    appointment_id: int,
    patient_phone: str,
    new_start_time: datetime,
) -> dict:
    """Reschedule a confirmed appointment and update its Google Calendar event."""

    if not patient_phone or not patient_phone.strip():
        return {
            "success": False,
            "message": "Patient phone number is required.",
        }

    if new_start_time.tzinfo is None or new_start_time.utcoffset() is None:
        return {
            "success": False,
            "message": "New appointment time must include a timezone.",
        }

    new_start_time = new_start_time.astimezone(INDIA_TZ)

    if new_start_time <= datetime.now(INDIA_TZ):
        return {
            "success": False,
            "message": "The new appointment time must be in the future.",
        }

    database_url = get_database_url()

    event_id = None
    old_start_time = None
    old_end_time = None
    calendar_update_attempted = False

    try:
        # Keep the database transaction open while updating Google Calendar.
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:

                # Step 1: Find and lock the patient's appointment.
                cur.execute(
                    """
                    SELECT
                        a.start_time,
                        a.end_time,
                        a.doctor_id,
                        a.google_calendar_event_id,
                        p.full_name,
                        d.full_name,
                        d.appointment_duration_minutes
                    FROM appointments a
                    JOIN patients p ON a.patient_id = p.id
                    JOIN doctors d ON a.doctor_id = d.id
                    WHERE a.id = %s
                      AND p.phone = %s
                      AND a.status = 'confirmed'
                      AND a.start_time > NOW()
                    FOR UPDATE OF a
                    """,
                    (appointment_id, patient_phone.strip()),
                )

                appointment = cur.fetchone()

                if appointment is None:
                    return {
                        "success": False,
                        "message": (
                            "No matching upcoming confirmed appointment "
                            "was found."
                        ),
                    }

                (
                    old_start_time,
                    old_end_time,
                    doctor_id,
                    event_id,
                    patient_name,
                    doctor_name,
                    duration_minutes,
                ) = appointment

                if not event_id:
                    return {
                        "success": False,
                        "message": (
                            "This appointment has no Google Calendar event. "
                            "Please contact the clinic."
                        ),
                    }

                # Step 2: Calculate the new appointment end time.
                new_end_time = new_start_time + timedelta(
                    minutes=duration_minutes
                )

                # Step 3: Update PostgreSQL.
                # The exclusion constraint prevents overlapping appointments.
                cur.execute(
                    """
                    UPDATE appointments
                    SET start_time = %s,
                        end_time = %s
                    WHERE id = %s
                    """,
                    (
                        new_start_time,
                        new_end_time,
                        appointment_id,
                    ),
                )

                # Step 4: Update the existing Google Calendar event.
                calendar_update_attempted = True

                calendar_start = new_start_time.astimezone(INDIA_TZ)
                calendar_end = new_end_time.astimezone(INDIA_TZ)

                update_calendar_event(
                    event_id=event_id,
                    start_time=calendar_start,
                    end_time=calendar_end,
                )

        # Database transaction committed successfully.
        return {
            "success": True,
            "appointment_id": appointment_id,
            "doctor": doctor_name,
            "old_start_time": old_start_time.isoformat(),
            "old_end_time": old_end_time.isoformat(),
            "new_start_time": new_start_time.isoformat(),
            "new_end_time": new_end_time.isoformat(),
            "google_calendar_event_id": event_id,
            "message": (
                "Appointment rescheduled successfully. "
                "Google Calendar has also been updated."
            ),
        }

    except errors.ExclusionViolation:
        return {
            "success": False,
            "message": (
                "This time slot is already booked. "
                "Please choose another available time."
            ),
        }

    except Exception:
        # If the calendar update was attempted, try to restore its old timing.
        if calendar_update_attempted and event_id:
            try:
                update_calendar_event(
                    event_id=event_id,
                    start_time=old_start_time.astimezone(INDIA_TZ),
                    end_time=old_end_time.astimezone(INDIA_TZ),
                )
            except Exception:
                return {
                    "success": False,
                    "message": (
                        "Rescheduling encountered an error. "
                        "Please check both the appointment and Google Calendar "
                        "before trying again."
                    ),
                }

        return {
            "success": False,
            "message": (
                "Could not reschedule the appointment. "
                "Please try again."
            ),
        }
    
def get_all_patients() -> list[dict]:
    """Fetch all registered patients with appointment statistics."""

    query = """
        SELECT
            p.id,
            p.full_name,
            p.phone,
            COUNT(a.id) AS total_appointments,
            MAX(a.start_time) AS last_appointment
        FROM patients p
        LEFT JOIN appointments a ON a.patient_id = p.id
        GROUP BY p.id, p.full_name, p.phone
        ORDER BY p.id DESC
    """

    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()

    return [
        {
            "patient_id": row[0],
            "full_name": row[1],
            "phone": row[2],
            "total_appointments": row[3],
            "last_appointment": (
                row[4].isoformat() if row[4] else None
            ),
        }
        for row in rows
    ]
