# CareVoice AI – Clinic Appointment Booking Agent

CareVoice AI is an AI-powered clinic appointment booking system that helps patients interact with a virtual receptionist through voice conversations. It supports doctor discovery, appointment availability checks, booking, cancellation and rescheduling.

The project combines LiveKit Agents, Python, PostgreSQL, Google Calendar and a React-based dashboard to simplify clinic appointment management.

## Features

- **AI Voice Receptionist:** Conversational voice assistant for clinic-related queries.
- **Doctor Search:** Find doctors by name and specialty.
- **Appointment Availability:** Check available appointment slots.
- **Appointment Booking:** Book appointments through voice interaction.
- **Appointment Cancellation:** Cancel existing appointments.
- **Appointment Rescheduling:** Change an existing appointment.
- **Google Calendar Integration:** Synchronize appointments with Google Calendar.
- **Patient Management:** View and manage patient information.
- **Admin Dashboard:** Monitor calls, appointments and patients.
- **REST API:** Backend endpoints for appointment and clinic operations.

## Technology Stack

| Component | Technology |
|---|---|
| AI Voice Agent | LiveKit Agents |
| Backend | Python, FastAPI |
| Frontend | React, TypeScript, Vite |
| Database | PostgreSQL |
| Voice Communication | LiveKit |
| Speech-to-Text | AssemblyAI |
| Text-to-Speech | Fish Audio |
| Language Model | Google Gemma |
| Calendar Integration | Google Calendar API |
| Icons | Lucide React |

## Project Structure

```text
CareVoice-AI-Clinic-Booking-Agent/
│
├── api/                    # FastAPI backend
├── database/               # Database schema and scripts
├── frontend/               # React frontend
├── services/               # Business logic and integrations
├── src/
│   └── agent.py             # LiveKit voice agent
│
├── tests/                   # Tests
├── .env.example             # Environment variable template
├── .gitignore
├── pyproject.toml
├── uv.lock
└── README.md
```

## System Architecture

1. Patient interacts with the voice assistant through the web interface.
2. LiveKit handles real-time voice communication.
3. The AI agent processes the conversation and identifies the patient's request.
4. Python backend services communicate with PostgreSQL.
5. Appointment operations are synchronized with Google Calendar.
6. The React dashboard displays relevant clinic and appointment information.

## Prerequisites

- Python and `uv`
- Node.js and npm
- PostgreSQL
- LiveKit account and API credentials
- Google Cloud project with Google Calendar API enabled
- Required speech and AI service credentials

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/HE-ST/CareVoice-AI-Clinic-Booking-Agent.git
cd CareVoice-AI-Clinic-Booking-Agent
```

### 2. Configure environment variables

Create your local environment file using the example:

```bash
copy .env.example .env.local
```

Add your actual credentials to the local environment file. Never commit API keys, passwords, OAuth tokens or private credentials.

### 3. Set up the Python environment

```bash
uv sync
```

### 4. Configure PostgreSQL

Create the PostgreSQL database and execute the database schema scripts provided in the `database/` directory.

Configure the database connection using the environment variables required by the backend.

### 5. Start the backend API

```bash
uv run uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

API documentation:

`http://127.0.0.1:8000/docs`

### 6. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

### 7. Start the LiveKit voice agent

Open another terminal in the project root:

```bash
uv run python src/agent.py dev
```

Configure the required LiveKit, AI model and speech service credentials before starting the agent.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check API health |
| `GET /doctors` | Retrieve doctors |
| `GET /availability` | Check appointment availability |
| `POST /appointments` | Book an appointment |
| `POST /appointments/{id}/cancel` | Cancel an appointment |
| `POST /appointments/{id}/reschedule` | Reschedule an appointment |
| `GET /appointments/all` | Retrieve appointments |
| `GET /patients` | Retrieve patients |
| `POST /token` | Generate LiveKit access token |

## Security Notes

- Never upload `.env` or `.env.local`.
- Never commit Google OAuth credentials or token files.
- Keep LiveKit API secrets private.
- Protect administrative API endpoints before public deployment.
- Use appropriate authentication and authorization for production.

## Project Purpose

CareVoice AI demonstrates how conversational AI, real-time voice communication, database management and calendar integration can be combined to automate clinic appointment workflows.

## Author

**Hemant Gehlot**

GitHub: https://github.com/HE-ST
