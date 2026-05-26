# Solstice Pilates — AI Receptionist
An AI receptionist for Solstice Pilates studio. Handles bookings, reschedules, cancellations, and general enquiries via chat (Phase 1) and voice via Vapi (Phase 2).

---

## Studio Info
- **Name:** Solstice Pilates
- **Hours:** Monday–Friday 6am–9pm, Saturday–Sunday 8am–6pm
- **Classes:** Reformer (60 min, capacity 8, $20), Mat (60 min, capacity 12, $15)
- **Payment:** Paid at studio, cash or card

---

## Project Structure    
```
solstice-pilates-agent/
├── credentials/
│   └── google-service-account.json
├── src/
│   ├── google/
│   │   ├── calendar.ts       — read/write calendar events
│   │   └── sheets.ts         — read/write contacts sheet
│   ├── agent/
│   │   ├── agent.ts          — main agent loop
│   │   ├── tools.ts          — tool definitions
│   │   └── systemPrompt.ts   — system prompt
│   └── index.ts              — Express server + chat endpoint
├── .env
├── .gitignore
├── decisions.md
├── README.md
├── package.json
└── tsconfig.json
```

---

## Setup
1. Clone the repo
2. Run `npm install`
3. Add credentials/google-service-account.json
4. Copy `.env.example` to `.env` and fill in values
5. Run `npm run dev`
6. In a separate terminal, run `ngrok http 3000`
7. Copy the ngrok forwarding URL and set it as the Custom LLM URL in Vapi dashboard
---

## Environment Variables
```
ANTHROPIC_API_KEY=
GOOGLE_CALENDAR_ID=
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_PATH=credentials/google-service-account.json
PORT=3000
VAPI_API_KEY=
```

---

## Test Data — Calendar Events
| Title | Date | Time | Status |
|---|---|---|---|
| Reformer Class | Thursday May 28 | 6–7 PM | FULL (8/8) |
| Reformer Class | Thursday May 28 | 7–8 PM | Available (5/8) |
| Mat Class | Friday May 29 | 9–10 AM | FULL (12/12) |
| Mat Class | Friday May 29 | 10–11 AM | Available (4/12) |
| Reformer Class | Monday Jun 1 | 6–7 PM | Available (2/8) |

---

## Phase 1 — Chat
Run `npm run dev` and open `http://localhost:3000`

## Phase 2 — Voice (Vapi)
Wire the agent to Vapi via webhooks at `/vapi` endpoint.