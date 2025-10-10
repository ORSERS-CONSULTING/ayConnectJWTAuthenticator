// require('dotenv').config();
// const express = require('express');
// const jwt = require('jsonwebtoken');
// const crypto = require('crypto');
// const bodyParser = require('body-parser');

// const app = express();
// app.use(bodyParser.json());

// const JWT_SECRET = process.env.JWT_SECRET;
// let refreshTokensStore = {};

// app.post('/issue-token', (req, res) => {
//     const { user_id, role } = req.body;
//     const payload = { user_id, role };
//     // if (email) payload.email = email;
//     // if (mobile_number) payload.mobile_number = mobile_number;

//     const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '30m' });
//     const refreshToken = crypto.randomBytes(64).toString('hex');
//     refreshTokensStore[refreshToken] = user_id;

//     console.log('Issuing tokens for:', payload);
//     res.json({ access_token: accessToken, refresh_token: refreshToken });
// });

// app.post('/refresh', (req, res) => {
//     const { refresh_token } = req.body;
//     if (!refresh_token || !refreshTokensStore[refresh_token]) {
//         return res.status(401).json({ message: 'Invalid refresh token' });
//     }

//     const user_id = refreshTokensStore[refresh_token];
//     const payload = { user_id, role: 'user' };  // optionally store role per user

//     const newAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '30m' });

//     res.json({ access_token: newAccessToken });
// });

// app.post('/login', (req, res) => {
    
// })

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
