import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import session from "express-session";

const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(session({
  secret: "crm_secret_2026",
  resave: false,
  saveUninitialized: false
}));

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
/* 🔐 AUTH MIDDLEWARE            */
/* ============================= */
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

/* ============================= */
/* 🔹 LOGIN PAGE                 */
/* ============================= */
app.get("/login", (req, res) => {
  res.send(`
  <html>
  <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;font-family:Arial;">
    <div style="background:#fff;padding:40px;border-radius:8px;width:300px;text-align:center;">
      <h2>WhatsApp CRM Login</h2>
      <input id="username" placeholder="Username" style="width:100%;padding:10px;margin-bottom:10px"/><br/>
      <input id="password" type="password" placeholder="Password" style="width:100%;padding:10px;margin-bottom:15px"/><br/>
      <button onclick="login()" style="padding:10px 20px;background:#25D366;border:none;color:white;width:100%">Login</button>

      <script>
        async function login() {
          const res = await fetch('/login', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              username: document.getElementById('username').value,
              password: document.getElementById('password').value
            })
          });

          if(res.ok){
            window.location = "/";
          } else {
            alert("Invalid credentials");
          }
        }
      </script>
    </div>
  </body>
  </html>
  `);
});

/* ============================= */
/* 🔹 LOGIN API                  */
/* ============================= */
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  req.session.user = {
    username,
    phoneKey: user.phoneKey
  };

  res.json({ success: true });
});

/* ============================= */
/* 🔹 LOGOUT                     */
/* ============================= */
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

/* ============================= */
/* 🔹 WEBHOOK VERIFICATION       */
/* ============================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
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
        }
      }

      return res.sendStatus(200);
    }

    res.sendStatus(404);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

/* ============================= */
/* 🔹 GET MESSAGES               */
/* ============================= */
app.get("/messages", requireLogin, (req, res) => {
  const phoneKey = req.session.user.phoneKey;
  res.json(messages[phoneKey] || []);
});

/* ============================= */
/* 🔹 SEND MESSAGE               */
/* ============================= */
app.post("/send", requireLogin, async (req, res) => {
  const { to, text } = req.body;
  const phoneKey = req.session.user.phoneKey;
  const phoneId = PHONE_NUMBERS[phoneKey];

  if (!to || !text) {
    return res.status(400).json({ error: "Missing fields" });
  }

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
/* 🔹 DASHBOARD UI (PROTECTED)   */
/* ============================= */
app.get("/", requireLogin, (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<title>WhatsApp CRM</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body {
  margin:0;
  font-family:Segoe UI, sans-serif;
  display:flex;
  height:100vh;
  background:#e5ddd5;
}

.sidebar {
  width:30%;
  background:#fff;
  border-right:1px solid #ddd;
  display:flex;
  flex-direction:column;
}

.sidebar-header {
  padding:15px;
  background:#075E54;
  color:white;
  display:flex;
  justify-content:space-between;
  align-items:center;
}

.contacts {
  flex:1;
  overflow-y:auto;
}

.contact {
  padding:15px;
  border-bottom:1px solid #f1f1f1;
  cursor:pointer;
}

.contact:hover {
  background:#f5f5f5;
}

.chat {
  width:70%;
  display:flex;
  flex-direction:column;
}

.chat-header {
  padding:15px;
  background:#075E54;
  color:white;
  font-weight:bold;
}

.messages {
  flex:1;
  padding:20px;
  overflow-y:auto;
  display:flex;
  flex-direction:column;
}

.message {
  margin-bottom:10px;
  padding:10px 14px;
  border-radius:8px;
  max-width:60%;
  font-size:14px;
  position:relative;
}

.incoming {
  background:#fff;
  align-self:flex-start;
}

.outgoing {
  background:#dcf8c6;
  align-self:flex-end;
}

.time {
  font-size:10px;
  color:#666;
  margin-top:4px;
}

.input-area {
  display:flex;
  padding:10px;
  background:#f0f0f0;
}

.input-area input {
  flex:1;
  padding:10px;
  border-radius:20px;
  border:1px solid #ccc;
  outline:none;
}

.input-area button {
  margin-left:10px;
  padding:10px 20px;
  border:none;
  border-radius:20px;
  background:#25D366;
  color:white;
  cursor:pointer;
}
</style>
</head>

<body>

<div class="sidebar">
  <div class="sidebar-header">
    <span>WhatsApp CRM</span>
    <a href="/logout" style="color:white;text-decoration:none;font-size:13px;">Logout</a>
  </div>
  <div class="contacts" id="contacts"></div>
</div>

<div class="chat">
  <div class="chat-header" id="chatHeader">Select a contact</div>
  <div class="messages" id="chatMessages"></div>
  <div class="input-area">
    <input type="text" id="messageInput" placeholder="Type a message..." />
    <button onclick="sendMessage()">Send</button>
  </div>
</div>

<script>
let selectedContact = null;
let allMessages = [];

async function loadMessages() {
  const res = await fetch('/messages', {
  credentials:'include'
});
  allMessages = await res.json();
  renderContacts();
  if(selectedContact) renderChat(selectedContact);
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
    '<div class="message ' + (m.type === "outgoing" ? "outgoing" : "incoming") + '">' +
      m.text +
      '<div class="time">' + new Date(m.timestamp).toLocaleTimeString() + '</div>' +
    '</div>'
  ).join("");

  chatDiv.scrollTop = chatDiv.scrollHeight;
}

async function sendMessage() {
  const text = document.getElementById("messageInput").value;
  if(!selectedContact || !text) return;

  await fetch('/send', {
    method:'POST',
    credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      to:selectedContact,
      text:text
    })
  });

  document.getElementById("messageInput").value="";
  loadMessages();
}

loadMessages();
setInterval(loadMessages, 3000);
</script>

</body>
</html>`);
});

/* ============================= */
/* 🔹 START SERVER               */
/* ============================= */
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
