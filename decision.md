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
- **Calendar ID:** `8c7432dc1a7fba62a77795aea25db1aaeb104902df02dfd7b4f4e1d1c8c40753@group.calendar.google.com`
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

-

---

## 7. Voice Tuning (Phase 2 — Vapi)

-

---

## 8. Open Questions

- [ ] Which specific turns should use Sonnet vs Haiku before submission?
- [ ] Vapi voice — which TTS voice fits the studio's tone?
- [ ] Should agent confirm booking via a summary before finalizing?