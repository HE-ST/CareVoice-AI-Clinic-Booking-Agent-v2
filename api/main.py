
import os
import uuid
import logging
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from livekit import api

from services.booking_service import (
    get_available_doctors,
    check_appointment_availability,
    book_appointment,
    get_upcoming_appointments,
    cancel_appointment,
    reschedule_appointment,
    get_all_appointments,
    get_all_patients,
)

# Load environment variables from the project root.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clinic-api")

app = FastAPI(
    title="Clinic AI Booking API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.1.30:5173",
        "https://technical-cargo-texas-hung.trycloudflare.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request models ----------

class AvailabilityRequest(BaseModel):
    doctor_id: int
    start_time: datetime
    exclude_appointment_id: int | None = None


class BookingRequest(BaseModel):
    patient_name: str = Field(min_length=1, max_length=150)
    patient_phone: str = Field(min_length=5, max_length=20)
    doctor_id: int
    start_time: datetime


class PatientRequest(BaseModel):
    patient_phone: str = Field(min_length=5, max_length=20)


class CancelRequest(BaseModel):
    patient_phone: str = Field(min_length=5, max_length=20)


class RescheduleRequest(BaseModel):
    patient_phone: str = Field(min_length=5, max_length=20)
    new_start_time: datetime


class TokenRequest(BaseModel):
    identity: str | None = None
    name: str | None = None
    agent_name: str = "my-agent"


def require_timezone(value: datetime):
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(
            status_code=400,
            detail="Appointment time must include a timezone.",
        )
    return value


# ---------- Health ----------

@app.get("/")
async def root():
    return {
        "success": True,
        "message": "Clinic AI Booking API is running.",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


# ---------- Doctors ----------

@app.get("/doctors")
async def doctors(specialty: str | None = None):
    try:
        result = await run_in_threadpool(
            get_available_doctors,
            specialty,
        )
        return result
    except Exception:
        logger.exception("Could not fetch doctors")
        raise HTTPException(
            status_code=500,
            detail="Could not fetch doctors.",
        )


# ---------- Availability ----------

@app.post("/availability")
async def availability(data: AvailabilityRequest):
    start_time = require_timezone(data.start_time)

    try:
        result = await run_in_threadpool(
            check_appointment_availability,
            data.doctor_id,
            start_time,
            data.exclude_appointment_id,
        )
        return result
    except Exception:
        logger.exception("Availability check failed")
        raise HTTPException(
            status_code=500,
            detail="Could not check appointment availability.",
        )


# ---------- Book appointment ----------

@app.post("/appointments")
async def create_appointment(data: BookingRequest):
    start_time = require_timezone(data.start_time)

    try:
        result = await run_in_threadpool(
            book_appointment,
            data.patient_name.strip(),
            data.patient_phone.strip(),
            data.doctor_id,
            start_time,
        )
        return result
    except Exception:
        logger.exception("Appointment booking failed")
        raise HTTPException(
            status_code=500,
            detail="Could not book appointment.",
        )


# ---------- Find appointments ----------

@app.get("/appointments")
async def appointments(patient_phone: str):
    try:
        result = await run_in_threadpool(
            get_upcoming_appointments,
            patient_phone.strip(),
        )
        return result
    except Exception:
        logger.exception("Could not fetch appointments")
        raise HTTPException(
            status_code=500,
            detail="Could not fetch appointments.",
        )


@app.get("/appointments/all")
async def all_appointments():
    try:
        result = await run_in_threadpool(
            get_all_appointments,
        )
        return result
    except Exception:
        logger.exception("Could not fetch all appointments")
        raise HTTPException(
            status_code=500,
            detail="Could not fetch all appointments.",
        )
    


# ---------- Patients ----------

@app.get("/patients")
async def all_patients():
    try:
        result = await run_in_threadpool(
            get_all_patients,
        )
        return result
    except Exception:
        logger.exception("Could not fetch all patients")
        raise HTTPException(
            status_code=500,
            detail="Could not fetch patients.",
        )


# ---------- Cancel appointment ----------

@app.post("/appointments/{appointment_id}/cancel")
async def cancel(
    appointment_id: int,
    data: CancelRequest,
):
    try:
        result = await run_in_threadpool(
            cancel_appointment,
            appointment_id,
            data.patient_phone.strip(),
        )
        return result
    except Exception:
        logger.exception("Appointment cancellation failed")
        raise HTTPException(
            status_code=500,
            detail="Could not cancel appointment.",
        )


# ---------- Reschedule appointment ----------

@app.post("/appointments/{appointment_id}/reschedule")
async def reschedule(
    appointment_id: int,
    data: RescheduleRequest,
):
    new_start_time = require_timezone(data.new_start_time)

    try:
        result = await run_in_threadpool(
            reschedule_appointment,
            appointment_id,
            data.patient_phone.strip(),
            new_start_time,
        )
        return result
    except Exception:
        logger.exception("Appointment rescheduling failed")
        raise HTTPException(
            status_code=500,
            detail="Could not reschedule appointment.",
        )


# ---------- LiveKit token and agent dispatch ----------

@app.post("/token")
async def create_token(data: TokenRequest):
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    livekit_url = os.getenv("LIVEKIT_URL")

    if not api_key or not api_secret or not livekit_url:
        raise HTTPException(
            status_code=500,
            detail="LiveKit environment configuration is incomplete.",
        )

    room_name = f"clinic-call-{uuid.uuid4().hex[:12]}"
    identity = data.identity or f"patient-{uuid.uuid4().hex[:8]}"
    participant_name = data.name or "Clinic Patient"

    lkapi = api.LiveKitAPI(
        url=livekit_url,
        api_key=api_key,
        api_secret=api_secret,
    )

    try:
        # Create a room for this browser call.
        await lkapi.room.create_room(
            api.CreateRoomRequest(
                name=room_name,
                empty_timeout=300,
                max_participants=5,
            )
        )

        # Dispatch the registered AI receptionist.
        await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=data.agent_name,
                room=room_name,
            )
        )

        # Generate a token for the browser participant.
        token = (
            api.AccessToken(api_key, api_secret)
            .with_identity(identity)
            .with_name(participant_name)
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                )
            )
            .with_ttl(timedelta(hours=1))
            .to_jwt()
        )

        return {
            "token": token,
            "url": livekit_url,
            "room": room_name,
            "identity": identity,
        }

    except Exception:
        logger.exception("LiveKit room or agent dispatch failed")
        raise HTTPException(
            status_code=502,
            detail="Could not start the AI voice session.",
        )

    finally:
        await lkapi.aclose()
