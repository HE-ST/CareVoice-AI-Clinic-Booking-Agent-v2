from services.booking_service import get_upcoming_appointments

phone = input("Enter registered patient phone number: ")

appointments = get_upcoming_appointments(phone)

if not appointments:
    print("No upcoming confirmed appointments found.")
else:
    print("\nUpcoming Appointments:")

    for appointment in appointments:
        print("-" * 40)
        for key, value in appointment.items():
            print(f"{key}: {value}")