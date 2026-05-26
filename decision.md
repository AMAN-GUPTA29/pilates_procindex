# ProcIndex — Solstice Pilates AI Receptionist
## Project Decisions Log

---

## 1. Tech Stack

### Language — TypeScript
**Chosen over:** Python
**Why:** Vapi's SDK and docs are TypeScript-first. Type safety makes tool schemas and API contracts explicit, which matters for an agentic system with multiple integrations. Signals production-minded thinking to the reviewer. Both languages were viable but TS is the stronger choice for this specific stack.

### Framework — Express.js
**Chosen over:** Fastify, NestJS
**Why:** Minimal boilerplate, widely understood, handles both the chat REST API and Vapi webhooks cleanly. No need for the overhead of NestJS for a single-agent demo.

### LLM Provider — Anthropic Claude
**Chosen over:** OpenAI GPT-4o, Google Gemini
**Why:** Claude's tool calling is reliable and well-structured for agentic workflows. Reviewing team likely builds with Claude — shows alignment with their stack. Gemini rejected — no clear advantage, adds unnecessary complexity.

### LLM Model — Haiku 3.5 (development), revisit before submission
**Why Haiku for now:** Cheapest Claude model, fast, more than capable for building and testing all agent logic. Cost difference is significant at scale even if negligible for a demo.
**Before submission:** Revisit using Sonnet 4.5 for complex turns — booking conflicts, reschedules, complaints — where reasoning quality matters more than speed.

### Vapi Integration — Webhooks over SDK
**Why:** Webhooks give full control over the request/response cycle, which is critical for latency tuning. The Vapi Python/TS SDKs are thin wrappers anyway — going direct means fewer abstractions to debug and more transparency over what's happening between Vapi and our agent.

---

## 2. Google Setup

### Auth — Service Account over OAuth
**Why:** OAuth requires a browser-based login flow to get a refresh token — adds setup friction for a demo and needs token refresh handling in code. Service Account uses a JSON key file, no login flow, works headlessly. Perfect for a server-side agent that runs without user interaction. Would use OAuth if this were a multi-user product where each user owns their own calendar.

- **Calendar name:** Solstice Pilates Classes
- **Sheet name:** Solstice Pilates - Contacts
- **Sheet tab:** Contacts
- **Sheet columns:** Phone | Name | First_Called | Last_Called | Call_Timestamp | Request_Type | Details | Status | Notes

---

## 3. Data Modeling

### Capacity in Calendar Description over extendedProperties
**Why:** Description is visible in the Google Calendar UI during testing and demos. Reviewer can see capacity data directly in the calendar while watching the demo video. extendedProperties would be cleaner in production but adds code complexity with no demo benefit.

**Format:**
```
capacity:8
booked:6
attendees:Name Phone xN, Name Phone xN
```

**Format for Spreadsheet:**
```
Phone          | Name | First_Called | Last_Called | Call_Timestamp      | Request_Type | Details  | Status    | Notes
917-555-0144   | Tom  | 2026-05-26   | 2026-05-26  | 05/26/2026 01:30 PM | Booking      | Booked Reformer class on 2026-05-28 at 19:00, 1 spot | Booked    |
```

### Attendee format — Name Phone xN
**Why:** `xN` makes spot counting explicit and unambiguous. `Ayush +2` is ambiguous (is that 2 or 3 spots?). `Ayush 981-555-0111 x3` clearly means 3 spots. Agent can parse and increment reliably.

### Sheet logging — new row per call, never overwrite
**Why:** Gives a full audit trail of every interaction. Phone number as unique identifier lets us detect repeat callers and carry forward First_Called date. Overwriting would lose call history.

### Pricing — per class only, no memberships
**Why:** Membership tracking requires payment history, remaining class counts, expiry logic — a separate system entirely. Out of scope for this take-home. The reviewer is evaluating agent + calendar + sheets integration, not a billing system. Keeps scope clean and focused.
- Reformer: $20
- Mat: $15

---

## 4. Agent Scope

### Handles autonomously
- Check class availability
- Book a class
- Reschedule a booking
- Cancel a booking
- Pricing questions
- Hours and general info
- Running late calls
- Drop-in enquiries

### Always hands off to human
**Why these specifically:** Billing disputes and refunds carry financial/legal risk. Medical concerns carry liability risk. Complaints needing a manager require human judgement and authority. These are the categories where a wrong AI response causes real damage.
- Billing disputes
- Refund requests
- Injury or medical concerns
- Complaints requiring a manager
- Anything agent is not confident about

---

## 5. Request_Type Values
```
Booking | Reschedule | Cancellation | Pricing Inquiry | 
Running Late | Drop-in Inquiry | General Question | Complaint | Other
```

---
 
## 6. Latency Strategy (Phase 2 — Vapi)
 
### SSE Streaming over JSON response
**Why:** Sending the full response as JSON means Vapi waits for the entire response before speaking. SSE streams word by word — Vapi starts speaking as soon as first words arrive, reducing perceived latency by 300-500ms.
 
### Filler injection in code
**Why:** Vapi's built-in backchanneling wasn't available on free plan dashboard. Instead we send "One moment..." immediately via SSE before tool calls run. Only injected when message contains booking/availability keywords — not for simple conversational replies.
 
### Session tracking by Vapi call ID
**Why:** Vapi sends full message history on every turn which caused the agent to re-process old tool calls and attempt duplicate bookings. Tracking sessions by `call.id` means we only append the latest user message to our own maintained history — no duplicate actions.
 
### res.flushHeaders() immediately
**Why:** Sends SSE headers to Vapi before any processing begins. Keeps the connection alive during tool calls (Google API calls take 200-400ms each) so Vapi doesn't timeout.
 
---
 
## 7. Voice Tuning (Phase 2 — Vapi)
 
### Transcriber — Deepgram Nova-3
**Why:** Nova-3 handles numbers and names significantly better than flux-general which was mishearing "6pm Reformer" as "sixth period former" and "Thursday" as "thirteenth amendment".
 
### Voice — Emma (Vapi)
**Why:** Warm, natural sounding voice suitable for a boutique pilates studio receptionist.
 
### Start Speaking Plan
- Wait seconds: 0.0 — agent speaks as fast as possible
- Smart Endpointing: On — more accurate speech detection
- On No Punctuation Seconds: 0.8 — reduced from 1.5 for faster response
### Stop Speaking Plan
- Number of words: 2 — caller can interrupt after 2 words
- Voice seconds: 0.2
- Back off seconds: 1
### End Call Phrases
**Why short phrases removed:** "goodbye", "no thanks", "that's all" were triggering mid-conversation. Kept only explicit multi-word phrases.
```
have a great day, thanks for calling solstice, goodbye and take care
```
 
### Silence Timeout
- Set to 30 seconds (reduced from 60) — ends call faster after genuine silence
---
 
## 8. Auto-Logging Strategy
 
### Logging guaranteed in code, not relying on Claude
**Why:** Claude occasionally forgot to call log_contact despite system prompt instructions. Moving auto-logging into the tool executor guarantees it always happens after successful actions.
- `book_class` success → auto `logContact`
- `cancel_booking` success → auto `logContact`
- `reschedule_booking` success → auto `logContact`
- `add_spots_to_booking` success → auto `logContact`
- Running late, general questions, handoffs → Claude calls `log_contact` via tool
---
 
## 9. Duplicate Booking Prevention
 
### Phone number check before booking
**Why:** Without this check the agent would double-book callers who called multiple times or misheard confirmation. `bookClass()` now checks if phone number already exists in attendees before adding.
 
### Session history prevents re-booking
**Why:** Vapi sends full conversation history on every turn. Without session tracking, the agent would re-process booking tool calls on every subsequent message. Fixed by maintaining our own session keyed by `call.id` and only appending new user messages.
 
### buildSystemPrompt context injection
**Why:** After a booking is confirmed, subsequent messages get an additional system prompt note: "The previous action is COMPLETE. Do NOT repeat." Prevents Claude from re-booking when caller says "no thanks" or "goodbye".
 
---
