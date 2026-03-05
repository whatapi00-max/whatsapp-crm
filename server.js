
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(bodyParser.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

/* 🔐 ENV VARIABLES */
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

/* 📱 MULTIPLE WHATSAPP NUMBERS */
const PHONE_NUMBERS = {
  user1: "921097607763091",
  user2: "PHONE_ID_2",
  user3: "PHONE_ID_3",
  user4: "PHONE_ID_4",
  user5: "PHONE_ID_5"
};

/* 🔐 LOGIN USERS */
const USERS = {
  admin1: { password: "1234", phoneKey: "user1" },
  admin2: { password: "12345", phoneKey: "user2" },
  admin3: { password: "123456", phoneKey: "user3" },
  admin4: { password: "1234567", phoneKey: "user4" },
  admin5: { password: "12345678", phoneKey: "user5" }
};

/* 📨 STORE MESSAGES PER NUMBER */
let messages = {
  user1: [],
  user2: [],
  user3: [],
  user4: [],
  user5: []
};

/* ============================= */
/* 🔹 LOGIN ROUTE                */
/* ============================= */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = USERS[username];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ success: true, phoneKey: user.phoneKey });
});

/* ============================= */
/* 🔹 WEBHOOK VERIFICATION       */
/* ============================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/* ============================= */
/* 🔹 RECEIVE MESSAGES           */
/* ============================= */
app.post("/webhook", (req, res) => {
  try {
    const body = req.body;

    if (body.object) {
      const value = body.entry?.[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];
      const phoneId = value?.metadata?.phone_number_id;

      if (msg && phoneId) {

        const phoneKey = Object.keys(PHONE_NUMBERS)
          .find(key => PHONE_NUMBERS[key] === phoneId);

        if (phoneKey) {
          messages[phoneKey].push({
            from: msg.from,
            text: msg.text?.body || "Non-text",
            type: "incoming",
            timestamp: Date.now()
          });

          console.log("Message received:", msg.from);
        }
      }

      return res.sendStatus(200);
    }

    res.sendStatus(404);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

/* ============================= */
/* 🔹 GET MESSAGES               */
/* ============================= */
app.get("/messages/:phoneKey", (req, res) => {
  const { phoneKey } = req.params;
  res.json(messages[phoneKey] || []);
});

/* ============================= */
/* 🔹 SEND MESSAGE               */
/* ============================= */
app.post("/send", async (req, res) => {
  const { to, text, phoneKey } = req.body;

  if (!to || !text || !phoneKey) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const phoneId = PHONE_NUMBERS[phoneKey];

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    messages[phoneKey].push({
      from: to,
      text,
      type: "outgoing",
      timestamp: Date.now()
    });

    res.json({ success: true });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Send failed" });
  }
});

/* ============================= */
/* 🔹 SIMPLE WEB UI              */
/* ============================= */
app.get("/", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>WhatsApp CRM</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        display: flex;
        height: 100vh;
        background: #f0f2f5;
      }

      .sidebar {
        width: 30%;
        background: #ffffff;
        border-right: 1px solid #ddd;
        overflow-y: auto;
      }

      .contact {
        padding: 15px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
      }

      .contact:hover {
        background: #f5f5f5;
      }

      .chat {
        width: 70%;
        display: flex;
        flex-direction: column;
      }

      .chat-header {
        padding: 15px;
        background: #075E54;
        color: white;
        font-weight: bold;
      }

      .messages {
        flex: 1;
        padding: 15px;
        overflow-y: auto;
      }

      .message {
        margin-bottom: 10px;
        padding: 10px;
        border-radius: 8px;
        max-width: 60%;
      }

      .incoming {
        background: #ffffff;
      }

      .outgoing {
        background: #dcf8c6;
        align-self: flex-end;
      }

      .input-area {
        display: flex;
        padding: 10px;
        background: #fff;
        border-top: 1px solid #ddd;
      }

      .input-area input {
        flex: 1;
        padding: 10px;
      }

      .input-area button {
        padding: 10px 15px;
        background: #25D366;
        border: none;
        color: white;
        cursor: pointer;
      }
    </style>
  </head>
  <body>

    <div class="sidebar" id="contacts"></div>

    <div class="chat">
      <div class="chat-header" id="chatHeader">Select a contact</div>
      <div class="messages" id="chatMessages"></div>
      <div class="input-area">
        <input type="text" id="messageInput" placeholder="Type message..." />
        <button onclick="sendMessage()">Send</button>
      </div>
    </div>

    <script>
      let selectedContact = null;
      let allMessages = [];

      async function loadMessages() {
        const res = await fetch('/messages');
        allMessages = await res.json();
        renderContacts();
        if (selectedContact) renderChat(selectedContact);
      }

      function renderContacts() {
        const contactsDiv = document.getElementById("contacts");
        const uniqueContacts = [...new Set(allMessages.map(m => m.from))];

        contactsDiv.innerHTML = uniqueContacts.map(c =>
          '<div class="contact" onclick="selectContact(\\'' + c + '\\')">' + c + '</div>'
        ).join("");
      }

      function selectContact(contact) {
        selectedContact = contact;
        document.getElementById("chatHeader").innerText = contact;
        renderChat(contact);
      }

      function renderChat(contact) {
        const chatDiv = document.getElementById("chatMessages");
        const msgs = allMessages.filter(m => m.from === contact);

        chatDiv.innerHTML = msgs.map(m =>
  '<div class="message ' + (m.type === "outgoing" ? "outgoing" : "incoming") + '">' 
  + m.text + 
  '</div>'
).join("");

        chatDiv.scrollTop = chatDiv.scrollHeight;
      }

      async function sendMessage() {
        const text = document.getElementById("messageInput").value;
        if (!selectedContact || !text) return;

        await fetch('/send', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            to: selectedContact,
            text: text
          })
        });

        document.getElementById("messageInput").value = "";
        loadMessages();
      }

      loadMessages();
      setInterval(loadMessages, 3000);
    </script>

  </body>
  </html>
  `);
});

/* ============================= */
/* 🔹 START SERVER               */
/* ============================= */
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
