// index.js (or app.js)
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const ayRoutes   = require('./routes/ayconnectRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// Mount payments FIRST so /payment/webhook keeps RAW body
app.use("/payment", paymentRoutes);

// Then global parsers for everything else
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cors());
app.use('/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use('/auth', authRoutes);
app.use('/ayconnect', ayRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(3000, () => console.log('JWT service with refresh running on port 3000'));
module.exports = app;
