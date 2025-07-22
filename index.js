require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Simple Email Endpoint
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
      <h2>Welcome to ${hotel}</h2>
      <p>You have checked in to room ${room}.</p>
      <a href="${deepLink}">Click to Verify</a>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Email send failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
