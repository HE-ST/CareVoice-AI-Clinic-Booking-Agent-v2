from dotenv import load_dotenv
import os
import psycopg

load_dotenv(".env.local")

with psycopg.connect(os.getenv("DATABASE_URL")) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                a.id,
                p.full_name,
                d.full_name,
                a.start_time,
                a.end_time,
                a.status,
                CASE
                    WHEN a.google_calendar_event_id IS NULL THEN 'No'
                    ELSE 'Yes'
                END AS has_calendar_event
            FROM appointments a
            JOIN patients p ON p.id = a.patient_id
            JOIN doctors d ON d.id = a.doctor_id
            ORDER BY a.id;
        """)

        rows = cur.fetchall()

        print("\n--- EXISTING APPOINTMENTS ---")
        for row in rows:
            print({
                "appointment_id": row[0],
                "patient": row[1],
                "doctor": row[2],
                "start": row[3],
                "end": row[4],
                "status": row[5],
                "has_calendar_event": row[6],
            })