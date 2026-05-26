import express from "express";
import * as dotenv from "dotenv";
import { runAgent, Message } from "./agent/agent";

dotenv.config();

const app = express();
app.use(express.json());

// Store conversation history per session (in memory for demo)
const sessions: Record<string, Message[]> = {};

// --- Basic Chat UI ---
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Solstice Pilates — AI Receptionist</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f0eb;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100vh;
      padding: 20px;
    }
    h1 {
      font-size: 1.2rem;
      color: #5a4a3a;
      margin-bottom: 16px;
      font-weight: 500;
      letter-spacing: 0.5px;
    }
    #chat {
      width: 100%;
      max-width: 640px;
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 10px;
    }
    .message {
      padding: 10px 14px;
      border-radius: 12px;
      max-width: 80%;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .user {
      background: #5a4a3a;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .assistant {
      background: white;
      color: #333;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .typing {
      background: white;
      color: #999;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 0.9rem;
    }
    #input-area {
      width: 100%;
      max-width: 640px;
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    #input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 24px;
      font-size: 0.95rem;
      outline: none;
      background: white;
    }
    #input:focus { border-color: #5a4a3a; }
    #send {
      padding: 10px 20px;
      background: #5a4a3a;
      color: white;
      border: none;
      border-radius: 24px;
      cursor: pointer;
      font-size: 0.95rem;
    }
    #send:hover { background: #4a3a2a; }
    #send:disabled { background: #aaa; cursor: not-allowed; }
    #new-session {
      margin-top: 8px;
      font-size: 0.8rem;
      color: #999;
      cursor: pointer;
      text-decoration: underline;
      background: none;
      border: none;
    }
  </style>
</head>
<body>
  <h1>🌿 Solstice Pilates — Receptionist</h1>
  <div id="chat"></div>
  <div id="input-area">
    <input id="input" type="text" placeholder="Type a message..." autocomplete="off" />
    <button id="send">Send</button>
  </div>
  <button id="new-session" onclick="newSession()">Start new session</button>

  <script>
    let sessionId = Date.now().toString();

    function newSession() {
      sessionId = Date.now().toString();
      document.getElementById('chat').innerHTML = '';
      addMessage('assistant', 'Hi, thanks for calling Solstice Pilates! How can I help you today?');
    }

    function addMessage(role, text) {
      const chat = document.getElementById('chat');
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    function setTyping(show) {
      const existing = document.getElementById('typing');
      if (show && !existing) {
        const chat = document.getElementById('chat');
        const div = document.createElement('div');
        div.id = 'typing';
        div.className = 'typing';
        div.textContent = 'Sol is typing...';
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
      } else if (!show && existing) {
        existing.remove();
      }
    }

    async function sendMessage() {
      const input = document.getElementById('input');
      const send = document.getElementById('send');
      const text = input.value.trim();
      if (!text) return;

      addMessage('user', text);
      input.value = '';
      send.disabled = true;
      setTyping(true);

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: text })
        });
        const data = await res.json();
        setTyping(false);
        addMessage('assistant', data.response);
      } catch (err) {
        setTyping(false);
        addMessage('assistant', 'Something went wrong. Please try again.');
      }

      send.disabled = false;
      input.focus();
    }

    document.getElementById('send').onclick = sendMessage;
    document.getElementById('input').onkeydown = (e) => {
      if (e.key === 'Enter') sendMessage();
    };

    // Start with a greeting
    newSession();
  </script>
</body>
</html>
  `);
});

// --- Chat API Endpoint ---
app.post("/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId and message required" });
  }

  // Initialize session if new
  if (!sessions[sessionId]) {
    sessions[sessionId] = [];
  }

  // Add user message to history
  sessions[sessionId].push({ role: "user", content: message });

  try {
    const response = await runAgent(sessions[sessionId]);

    // Add agent response to history
    sessions[sessionId].push({ role: "assistant", content: response });

    res.json({ response });
  } catch (error: any) {
    console.error("Agent error:", error.message);
    res.status(500).json({ error: "Agent failed", details: error.message });
  }
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌿 Solstice Pilates AI Receptionist running`);
  console.log(`   Open http://localhost:${PORT} to chat\n`);
});



