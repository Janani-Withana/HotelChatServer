const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
dotenv.config(); // Load .env variables

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Firebase Admin Init
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// ✅ Root health check
app.get('/', (req, res) => {
  res.send('🌐 Hotel Chat Server is running!');
});

// ✅ Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Send Email to Guest
app.post('/send-email', async (req, res) => {
  const { name, email, room, hotel } = req.body;

  if (!name || !email || !room || !hotel) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const deepLink = `https://hotelguestmodule-62806.web.app/verify.html?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&room=${encodeURIComponent(room)}&hotel=${encodeURIComponent(hotel)}`;

  const mailOptions = {
    from: `"Ocean View Hotels" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Welcome to ${hotel}, ${name}!`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
        <h2 style="color: #e22828;">Welcome to ${hotel}!</h2>
        <p>Dear ${name},</p>
        <p>You have successfully checked in to <strong>${room}</strong>.</p>
        <p>To start chatting with our assistant, click the button below:</p>
        <p style="text-align: center;">
          <a href="${deepLink}" style="background-color: #e22828; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">Click to Verify</a>
        </p>
        <p>If the button doesn't work, copy and paste the following URL in your browser:</p>
        <code>${deepLink}</code>
        <p>Enjoy your stay!<br>The ${hotel} Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📩 Email sent to ${email}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Email send error:', error);
    res.status(500).json({ error: 'Email send failed' });
  }
});

// ✅ Notify assistants when guest sends message
app.post('/notify-assistants', async (req, res) => {
  console.log('📨 Received POST /notify-assistants');
  try {
    const { guestEmail, message } = req.body;

    if (!guestEmail || !message) {
      return res.status(400).json({ error: 'Missing guestEmail or message' });
    }

    const guestDoc = await db.collection('guests').doc(guestEmail).get();
    if (!guestDoc.exists) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    const guestData = guestDoc.data();
    const hotel = guestData.hotel;

    if (!hotel) {
      return res.status(400).json({ error: 'Hotel not set for guest' });
    }

    const assistantsSnapshot = await db.collection('assistants')
      .where('hotel', '==', hotel)
      .get();

    const tokens = [];
    assistantsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) tokens.push(data.fcmToken);
    });

    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No assistants with valid FCM tokens' });
    }

    const results = await Promise.all(tokens.map(token => {
      console.log(`🚀 Sending to token: ${token}`); // 🔍 Log before sending

      return admin.messaging().send({
        token,
        notification: {
          title: `New message from ${guestData.name || guestEmail}`,
          body: message,
        },
        data: {
          guestEmail,
          hotel,
        }
      })
        .then(() => {
          console.log(`✅ Successfully sent to token: ${token}`); // ✅ Log success
          return { token, success: true };
        })
        .catch(err => {
          console.error(`❌ Error sending to token: ${token}`, err.code); // ❌ Log error
          return { token, success: false, error: err.code };
        });
    }));


    const successCount = results.filter(r => r.success).length;
    console.log('✅ Notification sent to assistants:', successCount);
    res.json({ success: true, sent: successCount });

  } catch (error) {
    console.error('❌ Error notifying assistants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Notify guest when assistant replies
app.post('/notify-guest', async (req, res) => {
  console.log('📨 Received POST /notify-guest');
  try {
    const { guestEmail, message } = req.body;

    if (!guestEmail || !message) {
      return res.status(400).json({ error: 'Missing guestEmail or message' });
    }

    const tokensSnapshot = await db.collection('guest_tokens')
      .where('email', '==', guestEmail)
      .get();

    const tokens = tokensSnapshot.docs.map(doc => doc.id);
    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No guest FCM tokens found' });
    }

    const results = await Promise.all(tokens.map(token =>
      admin.messaging().send({
        token,
        notification: {
          title: 'Assistant replied',
          body: message,
        },
        data: {
          guestEmail,
          role: 'guest',
        }
      }).then(() => ({ token, success: true }))
        .catch(err => {
          console.error(`❌ Error sending to guest token ${token}:`, err.code);
          return { token, success: false };
        })
    ));

    const successCount = results.filter(r => r.success).length;
    console.log('✅ Notification sent to guest:', successCount);
    res.json({ success: true, sent: successCount });

  } catch (error) {
    console.error('❌ Error notifying guest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend listening at http://localhost:${PORT}`);
});
