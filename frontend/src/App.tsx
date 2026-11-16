import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import {
  LayoutGrid, Phone, Calendar, Users, BarChart3, Settings, Mic, MicOff, PhoneOff,
  ChevronLeft, ChevronRight, Check, Sparkles, Mail, CalendarDays, User, AudioLines,
} from 'lucide-react'
import './App.css'

/* ───────────── Config & types ───────────── */
// TOKEN_URL: backend endpoint that returns { token, url } for a LiveKit room (MUST be implemented server-side).
// API_BASE: REST base for clinic operations. Unset => demo data. Paths below are an ASSUMED contract
// that your Python backend does not necessarily expose yet (see README notes in chat).
const TOKEN_URL = import.meta.env.VITE_TOKEN_URL as string | undefined
const API_BASE = import.meta.env.VITE_API_BASE as string | undefined

type Src = 'demo' | 'live'
type CallStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
interface Doctor { id: string; name: string; specialty: string; duration: number }
interface Patient {
  patient_id: number
  full_name: string
  phone: string
  total_appointments: number
  last_appointment: string | null
}
interface Slot { time: string; available: boolean }
interface Appt {
  id: string
  doctorId: string
  date: string
  time: string
  status: 'confirmed' | 'cancelled' | 'pending' | 'completed'
}
interface Msg { id: string; who: 'patient' | 'ai'; text: string; at: string }
type Action = 'book' | 'cancel' | 'reschedule'

const PATIENT = {
  name: 'Hemant',
  phone: '6363636363',
  email: '',
  isNew: false
}
const DEMO_DOCTORS: Doctor[] = [
  { id: 'd1', name: 'Dr. Amelia Hart', specialty: 'General Medicine', duration: 30 },
  { id: 'd2', name: 'Dr. Raj Patel', specialty: 'Cardiology', duration: 45 },
  { id: 'd3', name: 'Dr. Lena Ortiz', specialty: 'Dermatology', duration: 30 },
]
const DEMO_APPTS: Appt[] = [
  { id: 'a1', doctorId: 'd1', date: '2026-11-04', time: '10:00 AM', status: 'confirmed' },
  { id: 'a2', doctorId: 'd2', date: '2026-11-05', time: '1:00 PM', status: 'confirmed' },
  { id: 'a3', doctorId: 'd3', date: '2026-10-28', time: '3:00 PM', status: 'cancelled' },
]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const HOURS = [9, 10, 11, 13, 14, 15, 16, 17, 18]
const label = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`

/* ───────────── Backend API layer ───────────── */
async function request<T>(path: string, fallback: () => T, init?: RequestInit): Promise<{ data: T; source: Src }> {
  if (!API_BASE) return { data: fallback(), source: 'demo' }
  const r = await fetch(API_BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!r.ok) throw new Error(`Backend returned ${r.status} for ${path}`)
  return { data: (await r.json()) as T, source: 'live' }
}
const api = {
  searchDoctors: (q = '') => request<Doctor[]>(`/doctors?q=${encodeURIComponent(q)}`, () => DEMO_DOCTORS),

  getAllAppointments: async () => {
    const result = await request<any[]>(
      '/appointments/all',
      () => []
    )
  

    const appointments: Appt[] = result.data.map((a: any) => ({
      id: String(a.appointment_id),
      doctorId: String(a.doctor_id),
      date: new Date(a.start_time).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
      }),
      time: new Date(a.start_time).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      }),
      status: a.status,
    }))

    return { ...result, data: appointments }
  },
  getAllPatients: () =>
  request<Patient[]>('/patients', () => []),

 

availability: async (
  doctorId: string,
  date: string,
  excludeAppointmentId?: string
) => {
  if (!API_BASE) {
    return {
      data: HOURS.map((h) => ({
        time: label(h),
        available: (h * 7 + Number(date.slice(-2))) % 4 !== 0,
      })),
      source: 'demo' as Src,
    }
  }

  const slots = await Promise.all(
    HOURS.map(async (h) => {
      const time = `${String(h).padStart(2, '0')}:00`

      const response = await fetch(`${API_BASE}/availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          doctor_id: Number(doctorId),
          start_time: `${date}T${time}:00+05:30`,
          exclude_appointment_id: excludeAppointmentId
            ? Number(excludeAppointmentId)
            : null,
        }),
      })

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status} for /availability`)
      }

      const result = await response.json()

      return {
        time: label(h),
        available: result.available,
      }
    })
  )

  return {
    data: slots,
    source: 'live' as Src,
  }
},

  


book: async (
  a: Omit<Appt, 'id' | 'status'>,
  patientName: string,
  patientPhone: string
) => {
  const [clock, period] = a.time.split(' ')
  let [hours, minutes] = clock.split(':').map(Number)

  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  const startTime =
    `${a.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+05:30`

  const result = await request<any>(
    '/appointments',
    () => ({
      ...a,
      id: 'a' + Date.now(),
      status: 'confirmed',
    }),
    {
      method: 'POST',
      body: JSON.stringify({
        patient_name: patientName.trim(),
        patient_phone: patientPhone.trim(),
        doctor_id: Number(a.doctorId),
        start_time: startTime,
      }),
    }
  )

  const response = result.data

  const start = response.start_time
    ? new Date(response.start_time)
    : new Date(startTime)

  const mappedAppointment: Appt = {
    id: String(response.appointment_id ?? response.id),
    doctorId: String(response.doctor_id ?? a.doctorId),
    date: start.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    }),
    time: start.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }),
    status: response.status ?? 'confirmed',
  }

  if (mappedAppointment.id === 'undefined') {
    throw new Error('Backend did not return an appointment ID.')
  }

  return {
    ...result,
    data: mappedAppointment,
  }
},


cancel: (id: string, phone: string) =>
  request<any>(
    `/appointments/${id}/cancel`,
    () => ({ success: true }),
    {
      method: 'POST',
      body: JSON.stringify({ patient_phone: phone }),
    }
  ),
reschedule: (
  id: string,
  date: string,
  time: string,
  phone: string
) => {
  const [clock, period] = time.split(' ')
  let [hours, minutes] = clock.split(':').map(Number)

  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  const startTime =
    `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+05:30`

  return request<any>(
    `/appointments/${id}/reschedule`,
    () => ({}),
    {
      method: 'POST',
      body: JSON.stringify({
        patient_phone: phone,
        new_start_time: startTime,
      }),
    }
  )
},
 find: async (phone: string) => {
  const result = await request<any[]>(
    `/appointments?patient_phone=${encodeURIComponent(phone)}`,
    () => []
  )

  const appointments: Appt[] = result.data.map((a: any) => ({
    id: String(a.appointment_id),
    doctorId: String(a.doctor_id),
    date: new Date(a.start_time).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata'
    }),
    time: new Date(a.start_time).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata'
    }),
    status: a.status
  }))

  return { ...result, data: appointments }
},
}


/* ───────────── LiveKit hook ───────────── */
function useCall() {
  const room = useRef<Room | null>(null)
  const audio = useRef<HTMLDivElement | null>(null)
  const secsRef = useRef(0)
  const [status, setStatus] = useState<CallStatus>('idle')
  const [muted, setMuted] = useState(false)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    if (status !== 'connected') return
    const t = setInterval(() => { secsRef.current += 1; setSecs(secsRef.current) }, 1000)
    return () => clearInterval(t)
  }, [status])

  const end = useCallback(() => {
    room.current?.disconnect(); room.current = null
    audio.current?.replaceChildren()
    setStatus('idle'); setAiSpeaking(false); setMuted(false)
  }, [])
  useEffect(() => end, [end])

  const start = async () => {
    if (!TOKEN_URL) { setError('VITE_TOKEN_URL is not set. A backend endpoint that returns a LiveKit token is required.'); setStatus('error'); return }
    try {
      setStatus('connecting'); setError(''); setMsgs([]); secsRef.current = 0; setSecs(0)
      const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_name: 'my-agent' }) })
      if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`)
      const { token, url } = await res.json()
      const r = new Room({ adaptiveStream: true }); room.current = r
      r.on(RoomEvent.TrackSubscribed, (t) => { if (t.kind === Track.Kind.Audio) audio.current?.appendChild(t.attach()) })
      r.on(RoomEvent.TrackUnsubscribed, (t) => t.detach().forEach((e) => e.remove()))
      r.on(RoomEvent.ActiveSpeakersChanged, (s) => setAiSpeaking(s.some((p) => !p.isLocal)))
      r.on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
      r.on(RoomEvent.Reconnected, () => setStatus('connected'))
      r.on(RoomEvent.Disconnected, () => setStatus('idle'))
      r.on(RoomEvent.TranscriptionReceived, (segs, p) => {
        const who = p?.isLocal ? 'patient' : 'ai'
        setMsgs((prev) => {
          const next = [...prev]
          for (const s of segs) {
            const m: Msg = { id: s.id, who, text: s.text, at: fmt(secsRef.current) }
            const i = next.findIndex((x) => x.id === s.id)
            if (i >= 0) next[i] = { ...m, at: next[i].at }; else next.push(m)
          }
          return next
        })
      })
      await r.connect(url, token)
      await r.startAudio()
      await r.localParticipant.setMicrophoneEnabled(true)
      setStatus('connected')
    } catch (e) {
      room.current?.disconnect(); room.current = null
      setError(e instanceof Error ? e.message : 'Could not connect'); setStatus('error')
    }
  }
  const toggleMute = async () => {
    const next = !muted
    await room.current?.localParticipant.setMicrophoneEnabled(!next)
    setMuted(next)
  }
  return { status, muted, aiSpeaking, error, msgs, secs, audio, start, end, toggleMute }
}

/* ───────────── Components ───────────── */

const NAV = [
  ['Dashboard', LayoutGrid],
  ['Calls', Phone],
  ['Patients', Users],
] as const


function Sidebar({ active, onSelect, status }: { active: string; onSelect: (n: string) => void; status: CallStatus }) {
  return (
    <aside className="sidebar">
      <div className="brand"><span className="logo"><AudioLines size={22} /></span><b>CareVoice</b></div>
      <nav>
        {NAV.map(([name, Icon]) => (
          <button key={name} className={active === name ? 'nav active' : 'nav'} onClick={() => onSelect(name)}>
            <Icon size={18} /><span>{name}</span>
          </button>
        ))}
      </nav>
      <div className="agent-state">
        <i className="dot on" />
        <div>
          <b>{status === 'connected' ? 'In Call' : 'Online'}</b>
          <small>AI Receptionist</small>
        </div>
      </div>
    </aside>
  )
}

function Waveform({ active, speaking }: { active: boolean; speaking: boolean }) {
  const bars = useMemo(() => Array.from({ length: 64 }, (_, i) => {
    const env = Math.exp(-Math.pow((i - 32) / 18, 2))
    return { h: 8 + Math.random() * 92 * env, d: (i % 9) * 0.11 }
  }), [])
  return (
    <div className={`wave ${active ? 'live' : ''} ${speaking ? 'speak' : ''}`} aria-hidden>
      {bars.map((b, i) => <span key={i} style={{ height: `${b.h}%`, animationDelay: `${b.d}s` }} />)}
    </div>
  )
}

function CallPanel({ call }: { call: ReturnType<typeof useCall> }) {
  const { status, muted, aiSpeaking, error, msgs, secs, start, end, toggleMute } = call
  const live = status === 'connected' || status === 'reconnecting'
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  const state = status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…'
    : !live ? 'Not connected' : muted ? 'Microphone muted' : aiSpeaking ? 'AI is speaking…' : 'AI is listening…'
  return (
    <section className="card call">
      <div className="call-top">
        <div>
          <span className={live ? 'pill live' : 'pill'}><i />{live ? 'LIVE CALL' : 'STANDBY'}</span>
          <h1>Incoming Call</h1>
          <p className="muted">{PATIENT.phone}</p>
        </div>
        <div className="avatar-wrap"><div className="avatar"><User size={46} fill="currentColor" /></div><b className="timer">{fmt(secs)}</b></div>
      </div>
      <Waveform active={live} speaking={aiSpeaking} />
      <h3 className="sec"><Sparkles size={16} /> Live Transcript</h3>
      <div className="transcript" role="log" aria-live="polite">
        {msgs.length === 0 && <p className="empty">{live ? 'Waiting for the first words…' : 'Start a conversation to see the live transcript.'}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.who}`}>
            <small>{m.who === 'ai' ? 'AI Receptionist' : 'Patient'}</small>
            <p>{m.text}</p><time>{m.at}</time>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <div className="error" role="alert">{error}{status === 'error' && <button onClick={start}>Retry</button>}</div>}
      <div className="controls">
        {!live && status !== 'connecting' ? (
          <button className="start" onClick={start}><Phone size={18} /> Start conversation</button>
        ) : (
          <>
            <button className="ctl" onClick={toggleMute} aria-pressed={muted}>
              <span className={muted ? 'round warn' : 'round'}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</span>{muted ? 'Unmute' : 'Mute'}
            </button>
            <button className="ctl end" onClick={end}><span className="round red"><PhoneOff size={22} /></span>End Call</button>
          </>
        )}
      </div>
      <p className="ai-state"><Sparkles size={13} /> {state}</p>
      <div ref={call.audio} hidden />
    </section>
  )
}

function Booking(p: {
  doctors: Doctor[]
  doctorId: string
  setDoctorId: (s: string) => void
  date: string
  setDate: (s: string) => void
  slots: Slot[]
  slot: string
  setSlot: (s: string) => void
  onAction: (a: Action) => void
  hasActive: boolean
  loading: boolean
  source: Src
  patientPhone: string
  setPatientPhone: (s: string) => void
  rescheduleAppointment: Appt | undefined
})  {
  const todayDate = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }, [])
  const [start, setStart] = useState(todayDate)
  const today = ymd(todayDate)
  const dates = Array.from({ length: 6 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const doc = p.doctors.find((d) => d.id === p.doctorId)
  const shift = (n: number) => setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + n))
  const last = dates[5]
  const monthLabel = start.getMonth() === last.getMonth()
    ? start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${start.toLocaleDateString('en-US', { month: 'short' })} – ${last.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  return (
    <section className="card booking">
      <header className="bk-head">
        <span className="logo sq"><CalendarDays size={20} /></span>
        <div><h2>Book Appointment</h2><p className="muted">Select an available time</p></div>
        <div className="month">
          <b>{monthLabel}</b>
          <button aria-label="Previous six days" disabled={ymd(start) <= today} onClick={() => shift(-6)}><ChevronLeft size={16} /></button>
          <button aria-label="Next six days" onClick={() => shift(6)}><ChevronRight size={16} /></button>
        </div>
      </header>
      {p.rescheduleAppointment && (
  <div className="existing-appointment">
    <div className="existing-appointment-header">
      <b>Existing appointment</b>
      <span>Verified</span>
    </div>

    <p>
      Doctor: {
        p.doctors.find(
          d => String(d.id) === String(p.rescheduleAppointment?.doctorId)
        )?.name ?? 'Doctor not found'
      }
    </p>

    <p>Date: {p.rescheduleAppointment.date}</p>
    <p>Time: {p.rescheduleAppointment.time}</p>
  </div>
)}
      <div className="doctors">
        {p.doctors.map((d) => (
          <button  type="button" key={d.id} className={d.id === p.doctorId ? 'doc on' : 'doc'} onClick={() => p.setDoctorId(d.id)}>
            <b>{d.name}</b><small>{d.specialty} · {d.duration} min</small>
          </button>
        ))}
      </div>
      <div className="dates" role="listbox" aria-label="Select a date">
        {dates.map((d) => {
          const k = ymd(d);

          return (
            <button
              type="button"
              key={k}
              role="option"
              aria-selected={k === p.date}
              className={k === p.date ? 'dt on' : 'dt'}
              onClick={() => {
                p.setDate(k);
                p.setSlot('');
              }}
            >
              <small>
                {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </small>
              <b>{d.getDate()}</b>
              <i />
            </button>
          );
        })}
      </div>
      <div className="slots" aria-busy={p.loading}>
        {!p.date && <p className="empty">Pick a date to see available times{doc ? ` for ${doc.name}` : ''}.</p>}
        {p.date && !p.loading && p.slots.length === 0 && <p className="empty">No times returned for this date.</p>}
        {p.slots.map((s) => (
          <button key={s.time} disabled={!s.available} className={s.time === p.slot ? 'slot on' : 'slot'} onClick={() => p.setSlot(s.time)}>
            {s.time}{s.time === p.slot && <><Check size={14} className="tick" /><small>Selected</small></>}{!s.available && <small>Unavailable</small>}
          </button>
        ))}
      </div>
      {p.date && p.source === 'demo' && <p className="demo-note">Demo availability: placeholder times, not from your backend.</p>}
      
      
      <footer className="bk-foot">
        <span className="muted">
          {p.slot ? `${p.date} · ${p.slot}` : 'No time selected'}
          {doc?.duration ? ` · ${doc.duration} min` : ''}
        </span>

        <div className="booking-actions">
        <button
            className="ghost"
            disabled={p.loading}
            onClick={() => p.onAction('reschedule')}
          >
            Reschedule
          </button>

        <button
          className="ghost danger"
          disabled={p.loading}
          onClick={() => p.onAction('cancel')}
        >
          Cancel appointment
        </button>

        <button
          className="primary"
          disabled={!p.date || !p.slot || p.loading}
          onClick={() => p.onAction('book')}
        >
          Book appointment
        </button>
      </div>
      </footer>

    </section>
  )
}

function Stats({ appts, doctors, source }: { appts: Appt[]; doctors: Doctor[]; source: Src }) {
  const t = ymd(new Date())
  const items = [
    ['Total', appts.length], ['Confirmed', appts.filter((a) => a.status === 'confirmed').length],
    ['Cancelled', appts.filter((a) => a.status === 'cancelled').length],
    ['Upcoming', appts.filter((a) => a.status === 'confirmed' && a.date >= t).length], ['Doctors', doctors.length],
  ]
  return (
    <section className="stats">
      {items.map(([k, v]) => <div key={k} className="card stat"><small>{k}</small><b>{v}</b></div>)}
      <span className={source === 'demo' ? 'src demo' : 'src'}>{source === 'demo' ? 'Demo data' : 'Live backend data'}</span>
    </section>
  )
}

function Contact({ appt, doctor, live, sync, onCancel }: { appt?: Appt; doctor?: Doctor; live: boolean; sync: string; onCancel: () => void }) {
  return (
    <section className="card contact">
      <h2>Contact <small className="muted">(Auto-populated)</small></h2>
      <div className="c-body">
        <div className="initials">JK</div>
        <div className="c-info">
          <b>{PATIENT.name}</b>
          <p><Phone size={14} /> {PATIENT.phone}</p>
          <p><Mail size={14} /> {PATIENT.email}</p>
          <span className="tag">{PATIENT.isNew ? 'New Patient' : 'Existing Patient'}</span>
        </div>
        <dl>
          <dt>Status</dt><dd><span className={`status ${appt?.status ?? (live ? 'live' : '')}`}>{appt ? appt.status : live ? 'Live Call' : 'No call'}</span></dd>
          <dt>Appointment</dt><dd>{appt && appt.status === 'confirmed' ? `${doctor?.name ?? 'Doctor'} · ${appt.date} ${appt.time}` : 'None booked'}</dd>
          <dt>Calendar sync</dt><dd>{sync}</dd>
        </dl>
      </div>
      {appt?.status === 'confirmed' && <button className="ghost danger" onClick={onCancel}>Cancel appointment</button>}
    </section>
  )
}



function Confirm({
  action,
  detail,
  onYes,
  onNo,
  patientName,
  patientPhone,
  setPatientName,
  setPatientPhone,
}: {
  action: Action;
  detail: string;
  onYes: () => void;
  onNo: () => void;
  patientName: string;
  patientPhone: string;
  setPatientName: (s: string) => void;
  setPatientPhone: (s: string) => void;
}) {
  const t = {
    book: 'Book this appointment?',
    cancel: 'Find your appointment',
    reschedule: 'Reschedule to the new time?',
  }[action];

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>{t}</h3>
        <p className="muted">{detail}</p>

        {action === 'book' && (
          <div className="patient-form">
            <label>Patient Name</label>
            <input
              type="text"
              placeholder="Enter patient name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />

            <label>Phone Number</label>
            <input
              type="tel"
              placeholder="Enter patient phone number"
              value={patientPhone}
              onChange={(e) =>
                setPatientPhone(e.target.value.replace(/\D/g, ''))
              }
            />
          </div>
        )}

        {action === 'cancel' && (
          <div className="patient-form">
            <label>Enter your registered mobile number</label>
            <input
              type="tel"
              placeholder="Enter 10-digit mobile number"
              maxLength={10}
              value={patientPhone}
              onChange={(e) =>
                setPatientPhone(e.target.value.replace(/\D/g, ''))
              }
            />
          </div>
        )}

        <div>
          <button type="button" className="ghost" onClick={onNo}>
            Go back
          </button>

          <button
            type="button"
            disabled={
              action === 'book' &&
              (!patientName.trim() || patientPhone.trim().length !== 10)
            }
            className={action === 'cancel' ? 'primary red' : 'primary'}
            onClick={onYes}
          >
            {action === 'cancel' ? 'Find appointment' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── App ───────────── */
export default function App() {
  const call = useCall()
  const [nav, setNav] = useState('Calls')
  const [doctors, setDoctors] = useState<Doctor[]>(DEMO_DOCTORS)
  const [doctorId, setDoctorId] = useState(DEMO_DOCTORS[0].id)
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [slot, setSlot] = useState('')
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [appts, setAppts] = useState<Appt[]>(DEMO_APPTS)
  const [active, setActive] = useState<Appt | undefined>()
  const [source, setSource] = useState<Src>('demo')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<Action | null>(null)
  const [notice, setNotice] = useState('')
  const [patientName, setPatientName ] = useState('')
  const [patientPhone, setPatientPhone ] = useState('')
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [rescheduleConfirmOpen, setRescheduleConfirmOpen] = useState(false)
  const [rescheduleReviewOpen, setRescheduleReviewOpen] = useState(false)
  const [reschedulePatientPhone, setReschedulePatientPhone] = useState('')
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appt | undefined>()
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  
  

  const fail = (e: unknown) => setNotice(e instanceof Error ? e.message : 'Something went wrong')

  useEffect(() => {
    api.searchDoctors().then((r) => { setDoctors(r.data); setSource(r.source); if (r.data[0]) setDoctorId(r.data[0].id) }).catch(fail)
    api.getAllAppointments().then((r) => setAppts(r.data)).catch(fail)
    api.getAllPatients().then((r) => setPatients(r.data)).catch(fail)
  }, [])
    
  useEffect(() => {
  if (!date) return

  setLoading(true)

  const excludeId =
    isRescheduling && rescheduleAppointment
      ? rescheduleAppointment.id
      : undefined

  api.availability(doctorId, date, excludeId)
    .then((r) => {
      setSlots(r.data)
      setSource(r.source)
    })
    .catch(fail)
    .finally(() => setLoading(false))

}, [doctorId, date, isRescheduling, rescheduleAppointment?.id])

 const run = async () => {
  const action = pending
  setPending(null)
  setNotice('')

  try {
    if (action === 'book') {
      const { data } = await api.book(
        { doctorId, date, time: slot },
        patientName,
        patientPhone
      )
      setActive(data)
      setAppts((a) => [...a, data])
      setSlot('')
    }

    else if (action === 'cancel') {
      if (patientPhone.length !== 10) {
        setNotice('Please enter a valid 10-digit mobile number.')
        return
      }

      const { data } = await api.find(patientPhone)

      if (!data || data.length === 0) {
        setNotice('No upcoming confirmed appointment found for this number.')
        return
      }

      // Display the first matching appointment
      setActive(data[0])
      setCancelConfirmOpen(true)
    }

    else if (action === 'reschedule' && active) {
      await api.reschedule(active.id, date, slot, patientPhone)
      const moved = { ...active, date, time: slot }
      setActive(moved)
      setAppts((a) => a.map((x) => x.id === moved.id ? moved : x))
      setSlot('')
    }
  } catch (e) {
    fail(e)
  }
}



const findRescheduleAppointment = async () => {
  setNotice('')

  if (reschedulePatientPhone.length !== 10) {
    setNotice('Please enter a valid 10-digit mobile number.')
    return
  }

  try {
    setRescheduleAppointment(undefined)

    const { data } = await api.find(reschedulePatientPhone)

    if (!data || data.length === 0) {
      setNotice('No upcoming confirmed appointment found for this number.')
      return
    }

    const appointment = data[0]

    setRescheduleAppointment(appointment)
    setActive(appointment)

    // Close phone verification popup
    setRescheduleConfirmOpen(false)

    // Keep rescheduling mode active
    setIsRescheduling(true)

    // Reset new date and time selection
   setDoctorId(appointment.doctorId)
   setDate(appointment.date)
   setSlot('')

    setNotice('Appointment found. Select your new date and time.')

  } catch (e) {
    fail(e)
  }
}


const confirmReschedule = async () => {
  if (!rescheduleAppointment) return

  if (!slot) {
    setNotice('Please select a new appointment time.')
    return
  }

  try {
    setNotice('')

    const result = await api.reschedule(
    rescheduleAppointment.id,
    date,
    slot,
    reschedulePatientPhone
  )

if (result.data?.success === false) {
  throw new Error('Rescheduling failed. Please try again.')
}

    const moved = {
      ...rescheduleAppointment,
      date,
      time: slot,
      status: 'confirmed' as const,
    }

    setActive(moved)
    setAppts((appointments) =>
      appointments.map((a) =>
        a.id === moved.id ? moved : a
      )
    )

    setRescheduleConfirmOpen(false)
    setRescheduleReviewOpen(false)
    setIsRescheduling(false)
    setRescheduleAppointment(undefined)
    setReschedulePatientPhone('')
    setSlot('')

    setNotice('Appointment rescheduled successfully!')
  } catch (e) {
    fail(e)
  }
}
const confirmCancellation = async () => {
  if (!active) return

  try {
    await api.cancel(active.id, patientPhone)

    const gone = { ...active, status: 'cancelled' as const }

    setActive(gone)
    setAppts((a) =>
      a.map((x) => x.id === gone.id ? gone : x)
    )

    setCancelConfirmOpen(false)
    setNotice('Appointment cancelled successfully.')
  } catch (e) {
    fail(e)
  }
}
  const sync = source === 'demo' ? 'Demo — not synced' : 'Synced by backend'
  const doc = doctors.find((d) => d.id === (active?.doctorId || doctorId))
  const detail = pending === 'cancel' && active ? `${active.date} at ${active.time}` : `${doc?.name ?? ''} · ${date} at ${slot}`
  return (
    <div className="app">
      <Sidebar active={nav} onSelect={setNav} status={call.status} />
      <main>
           {nav === 'Calls' && <CallPanel call={call} />}

          {nav === 'Dashboard' && (
              <div className="dashboard-layout">

                <div className="dashboard-stats">
                  <Stats
                    appts={appts}
                    doctors={doctors}
                    source={source}
                  />
                </div>

                <div className="dashboard-booking">
                  {notice && (
                    <div className="error" role="alert">
                      {notice}
                    </div>
                  )}

                  <Booking
                    doctors={doctors}
                    doctorId={doctorId}
                    setDoctorId={setDoctorId}
                    date={date}
                    setDate={setDate}
                    slots={slots}
                    slot={slot}
                    setSlot={setSlot}
                    onAction={(action) => {
                      if (action === 'reschedule') {
                        if (rescheduleAppointment) {
                          if (!slot || !date) {
                            setNotice('Please select a new date and time.')
                            return
                          }

                          setRescheduleReviewOpen(true)
                        } else {
                          setIsRescheduling(true)
                          setReschedulePatientPhone('')
                          setRescheduleAppointment(undefined)
                          setRescheduleConfirmOpen(true)
                          setSlot('')
                        }
                      } else {
                        setPending(action)
                      }
                    }}
                    hasActive={active?.status === 'confirmed'}
                    loading={loading}
                    source={source}
                    patientPhone={patientPhone}
                    setPatientPhone={setPatientPhone}
                    rescheduleAppointment={rescheduleAppointment}
                  />
                </div>

              </div>
            )}

            {nav === 'Patients' && (
                <section className="card patients-card">
                  <h1>Patients</h1>
                  <p className="muted">
                    View and manage registered clinic patients.
                  </p>

                  <input
                     className="patients-search"
                    type="text"
                    placeholder="Search patients by name or phone..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                  />

                  {(() => {
                    const filteredPatients = patients.filter((p) =>
                      `${p.full_name} ${p.phone}`
                        .toLowerCase()
                        .includes(patientSearch.toLowerCase())
                    )

                    return (
                      <>
                        <p className="muted">
                          Total patients: {filteredPatients.length}
                        </p>

                        <div className="patients-table-wrap">
                        <table className="patients-table">
                            <thead>
                              <tr>
                                <th>Patient ID</th>
                                <th>Patient Name</th>
                                <th>Phone</th>
                                <th>Appointments</th>
                                <th>Last Appointment</th>
                              </tr>
                            </thead>

                            <tbody>
                              {filteredPatients.map((p) => (
                                <tr key={p.patient_id}>
                                  <td>{p.patient_id}</td>
                                  <td>{p.full_name}</td>
                                  <td>{p.phone}</td>
                                  <td>{p.total_appointments}</td>
                                  <td>
                                    {p.last_appointment
                                      ? new Date(p.last_appointment)
                                          .toLocaleDateString('en-IN', {
                                            timeZone: 'Asia/Kolkata'
                                          })
                                      : 'No appointments'}
                                  </td>
                                </tr>
                              ))}

                              {filteredPatients.length === 0 && (
                                <tr>
                                  <td colSpan={5}>
                                    No patients found.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  })()}
                </section>
              )}
          </main>
{pending && (
  <Confirm
    action={pending}
    detail={detail}
    onYes={run}
    onNo={() => setPending(null)}
    patientName={patientName}
    patientPhone={patientPhone}
    setPatientName={setPatientName}
    setPatientPhone={setPatientPhone}
  />
)}

{cancelConfirmOpen && active && (
  <div className="overlay" role="dialog" aria-modal="true">
    <div className="modal">
      <h3>Confirm cancellation?</h3>

      <p>Are you sure you want to cancel this appointment?</p>

      <p className="muted">
        Doctor: {doctors.find(d => d.id === active.doctorId)?.name}
        <br />
        Date: {active.date}
        <br />
        Time: {active.time}
      </p>

      <button
        type="button"
        className="ghost"
        onClick={() => setCancelConfirmOpen(false)}
      >
        Go back
      </button>

      <button
        type="button"
        className="primary red"
        onClick={confirmCancellation}
      >
        Confirm cancellation
      </button>
    </div>
  </div>
)}

{rescheduleConfirmOpen && (
  <div className="overlay" role="dialog" aria-modal="true">
    <div className="modal">
      <h3>Verify your appointment</h3>

      <p className="muted">
        Enter your registered mobile number to find your appointment.
      </p>

      <div className="patient-form">
        <label>Registered mobile number</label>
        <input
          type="tel"
          placeholder="Enter 10-digit mobile number"
          maxLength={10}
          value={reschedulePatientPhone}
          onChange={(e) =>
            setReschedulePatientPhone(
              e.target.value.replace(/\D/g, '')
            )
          }
        />
      </div>

      {rescheduleAppointment && (
        <div className="patient-form">
          <h4>Appointment found</h4>
          <p>Doctor: {doctors.find(
            d => d.id === rescheduleAppointment.doctorId
          )?.name}</p>
          <p>Date: {rescheduleAppointment.date}</p>
          <p>Time: {rescheduleAppointment.time}</p>
          <p>Status: {rescheduleAppointment.status}</p>
        </div>
      )}

      <div>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setRescheduleConfirmOpen(false)
            setRescheduleAppointment(undefined)
          }}
        >
          Go back
        </button>

        <button
          type="button"
          className="primary"
          disabled={reschedulePatientPhone.length !== 10}
          onClick={findRescheduleAppointment}
        >
          Find appointment
        </button>
      </div>
    </div>
  </div>
)}

{rescheduleReviewOpen && rescheduleAppointment && (
  <div className="overlay" role="dialog" aria-modal="true">
    <div className="modal">
      <h3>Confirm rescheduling?</h3>

      <p className="muted">
        Please review your appointment changes.
      </p>

      <div className="patient-form">
        <h4>Current appointment</h4>

        <p>
          Doctor: {doctors.find(
            d => String(d.id) === String(rescheduleAppointment.doctorId)
          )?.name ?? 'Doctor not found'}
        </p>

        <p>Date: {rescheduleAppointment.date}</p>
        <p>Time: {rescheduleAppointment.time}</p>

        <hr />

        <h4>New appointment</h4>

        <p>Date: {date}</p>
        <p>Time: {slot}</p>
      </div>

      <div>
        <button
          type="button"
          className="ghost"
          onClick={() => setRescheduleReviewOpen(false)}
        >
          Go back
        </button>

        <button
          type="button"
          className="primary"
          onClick={confirmReschedule}
        >
          Confirm reschedule
        </button>
      </div>
    </div>
  </div>
)}


    </div>
  )
}
