const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const ayRoutes   = require('./routes/ayconnectRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const app = express();
app.use("/payment", paymentRoutes);
app.use(express.json({ limit: '25mb' }));

// Optional hardening
app.use(cors());
app.use('/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use('/auth', authRoutes);
app.use('/ayconnect', ayRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

module.exports = app;


app.listen(3000, () => console.log('JWT service with refresh running on port 3000'));
