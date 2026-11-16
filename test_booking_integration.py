
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from services.booking_service import (
    get_available_doctors,
    book_appointment,
)

doctors = get_available_doctors()

if not doctors:
    print("No active doctors found.")
else:
    print("Available doctors:")
    for doctor in doctors:
        print(
            f"{doctor['id']}: {doctor['name']} "
            f"({doctor['specialty']})"
        )

    doctor_id = doctors[0]["id"]

    # Choose a test time three days ahead at 2 PM IST.
    start_time = datetime.now(ZoneInfo("Asia/Kolkata")) + timedelta(days=4)
    start_time = start_time.replace(
        hour=14, minute=0, second=0, microsecond=0
    )

    result = book_appointment(
        patient_name="Integration Test Patient",
        patient_phone="TEST-INTEGRATION-001",
        doctor_id=doctor_id,
        start_time=start_time,
    )

    print("\nBooking integration result:")
    print(result)
