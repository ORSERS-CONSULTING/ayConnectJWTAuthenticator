// index.js
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const ayRoutes   = require('./routes/ayconnectRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// If behind proxy/API Gateway, trust the first proxy hop so X-Forwarded-For is used safely.
app.set('trust proxy', 1);

// === Payment route first (with its own parsers) ===
// Choose the parser that matches your payment provider / integration.
// 1) If payment expects urlencoded form data:
app.use('/payment', express.urlencoded({ extended: true, limit: '25mb' }), paymentRoutes);

// 2) If payment expects JSON payloads (uncomment instead):
// app.use('/payment', express.json({ limit: '25mb' }), paymentRoutes);

// 3) If payment requires raw body for signature verification (e.g., Stripe webhooks):
// app.use('/payment', express.raw({ type: 'application/json', limit: '25mb' }), paymentRoutes);

// Note: only one of the three patterns above should be used depending on your payment integration.
// Keep the line that matches your needs and comment out the others.

// === Global middleware for the rest of the app ===
app.use(express.json({ limit: '25mb' }));      // global JSON parser for other routes
app.use(express.urlencoded({ extended: true, limit: '25mb' })); // optional global urlencoded

app.use(cors());

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(generalLimiter);

// Stronger limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30
});
app.use('/auth', authLimiter);

// Routes after middleware
app.use('/auth', authRoutes);
app.use('/ayconnect', ayRoutes);

// Health and debug
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/debug/ip', (req, res) => res.json({ ip: req.ip, xff: req.header('x-forwarded-for'), socket: req.socket.remoteAddress }));

module.exports = app;

// If you use bootstrap to set envs and then require index, app.listen can be here safely:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`JWT service running on port ${PORT}`));
