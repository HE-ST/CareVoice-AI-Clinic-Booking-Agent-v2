
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow

BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def main():
    if not CREDENTIALS_FILE.exists():
        raise FileNotFoundError("credentials.json not found.")

    flow = InstalledAppFlow.from_client_secrets_file(
        str(CREDENTIALS_FILE),
        SCOPES,
    )

    credentials = flow.run_local_server(
        host="localhost",
        port=0,
        prompt="consent",
        access_type="offline",
    )

    TOKEN_FILE.write_text(
        credentials.to_json(),
        encoding="utf-8",
    )

    print("Google Calendar authentication successful!")
    print(f"New token saved: {TOKEN_FILE}")


if __name__ == "__main__":
    main()
