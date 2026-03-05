import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(bodyParser.json());
app.use(cors());

/* ✅ IMPORTANT FOR RENDER */
const PORT = process.env.PORT || 3000;

/* 🔐 ENV VARIABLES (SET THESE IN RENDER) */
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

let messages = [];

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
    console.log("Webhook verification failed");
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
      const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (msg) {
        const from = msg.from;
        const text = msg.text?.body || "Non-text message";

        messages.push({
          from,
          text,
          time: new Date().toLocaleString()
        });

        console.log("Message received:", from, text);
      }

      return res.sendStatus(200);
    } else {
      return res.sendStatus(404);
    }
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

/* ============================= */
/* 🔹 GET ALL MESSAGES           */
/* ============================= */
app.get("/messages", (req, res) => {
  res.json(messages);
});

/* ============================= */
/* 🔹 SEND REPLY                 */
/* ============================= */
app.post("/send", async (req, res) => {
  const { to, text } = req.body;

  if (!to || !text) {
    return res.status(400).json({ error: "Missing 'to' or 'text'" });
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
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

    console.log("Message sent to:", to);
    res.json({ success: true });

  } catch (error) {
    console.error("Send error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

/* ============================= */
/* 🔹 SIMPLE WEB UI              */
/* ============================= */
app.get("/", (req, res) => {
  res.send(`
    <html>
    <body>
      <h2>WhatsApp CRM Inbox</h2>
      <div id="messages"></div>

      <h3>Send Reply</h3>
      <input id="to" placeholder="Phone number (e.g. 919999999999)" />
      <input id="text" placeholder="Message" />
      <button onclick="send()">Send</button>

      <script>
        async function load() {
          const res = await fetch('/messages');
          const data = await res.json();
          document.getElementById('messages').innerHTML =
            data.map(m => "<p><b>"+m.from+"</b>: "+m.text+" ("+m.time+")</p>").join("");
        }

        async function send() {
          await fetch('/send', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              to: document.getElementById('to').value,
              text: document.getElementById('text').value
            })
          });
          alert("Message Sent!");
        }

        load();
        setInterval(load, 3000);
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