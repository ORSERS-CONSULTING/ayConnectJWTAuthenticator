// index.js
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const ayRoutes = require('./routes/ayconnectRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// If behind proxy/API Gateway, trust the first proxy hop so X-Forwarded-For is used safely.
app.set('trust proxy', 1);

// === Office IP logic ===
const OFFICE_IP = '94.206.200.125';

// Normalize & detect client IP (works with proxies and ::ffff: prefix)
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const ip = (xff ? xff.split(',')[0].trim() : req.ip) || '';
  return ip.replace('::ffff:', '');
}
function isOffice(req) {
  return getClientIp(req) === OFFICE_IP;
}

// === Payment route first (with its own parsers) ===
app.use('/payment', express.urlencoded({ extended: true, limit: '25mb' }), paymentRoutes);

// === Global middleware for the rest of the app ===
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cors());

// === Rate Limiting ===
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  skip: (req) => isOffice(req), // office IP = unlimited
  message: 'Too many requests – please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  skip: (req) => isOffice(req), // office IP = unlimited
  message: 'Too many login attempts – please wait',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth', authLimiter);

const heavyUseLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 500,
  skip: (req) => isOffice(req), // office IP = unlimited
  message: 'Too many requests to AYCONNECT – please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/ayconnect', heavyUseLimiter);

// === Routes ===
app.use('/auth', authRoutes);
app.use('/ayconnect', ayRoutes);

// === Health and Debug Routes ===
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/debug/ip', (req, res) => {
  res.json({
    ip: req.ip,
    clientIp: getClientIp(req),
    xff: req.header('x-forwarded-for'),
    socket: req.socket.remoteAddress,
    isOffice: isOffice(req),
  });
});

// === Start Server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`JWT service running on port ${PORT}`));
