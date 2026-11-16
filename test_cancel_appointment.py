from services.booking_service import cancel_appointment

appointment_id = int(input("Enter appointment ID to cancel: "))
phone = input("Enter registered phone number: ")

confirm = input(
    "Are you sure you want to cancel this appointment? (yes/no): "
).strip().lower()

if confirm == "yes":
    result = cancel_appointment(appointment_id, phone)

    print("\nCancellation Result:")
    print(result)
else:
    print("Cancellation aborted.")