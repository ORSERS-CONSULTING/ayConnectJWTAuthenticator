const crypto = require('crypto');
const { signAccessToken } = require('../utils/jwt');

const {
  sendMobileOtp,
  verifyMobileOtp,
  sendEmailOtp,
  verifyEmailOtp,
  ordsLogin,
  getClientEmail,
  registerClient,
  checkClientCode,
  registerUser,
  registerExistingClient,
  resendClientCode,
  authTokensCreate,
  authTokensValidate,
  authTokensRevoke,
} = require('../services/ordsServices');

const { sendSms } = require('../services/etisalatServices');

const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

async function persistRefreshToken(userId, refresh_token) {
  await authTokensCreate({
    user_id: Number(userId),
    refresh_token,
    days: REFRESH_DAYS,
  });
}

async function sendOtp(req, res) {
  const { channel, target } = req.body || {};
  if (!channel || !target) return res.status(400).json({ message: 'channel & target required' });

  try {
    if (channel === 'mobile') {
      const data = await sendMobileOtp(target);

      const otp = data.generated_otp ?? null;

      if (otp) {
        const msg = `Your OTP is ${otp}`;
        try {
          await sendSms({ to: String(target), message: msg });
        } catch (err) {
          console.error('Etisalat SMS failed:', err?.message || err);
        }
      }

      return res.json({ sent: true });
    }

    const data = await sendEmailOtp(target);
    return res.json({ sent: true, ...data });

  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

/** Public: verify OTP */
async function verifyOtp(req, res) {
  const { channel, target, otp } = req.body || {};
  if (!channel || !target || !otp) {
    return res.status(400).json({ message: 'channel, target, otp required' });
  }

  try {
    const data = channel === 'mobile'
      ? await verifyMobileOtp(target, otp)
      : await verifyEmailOtp(target, otp);

    const raw = (data.verification_status ?? data.VERIFICATION_STATUS ?? data.status ?? '').trim();
    const status = raw.toUpperCase();

    const OK = new Set(['VERIFIED', 'SUCCESS', 'VALID', 'MATCH']);
    const verified = OK.has(status);

    if (!verified) {
      return res.status(401).json({ verified: false, status });
    }

    return res.json({ verified: true, status });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

/** Optional: keep these if you still want them */
async function issueToken(req, res) {
  const { user_id, role = 'user', email } = req.body || {};
  if (!user_id) return res.status(400).json({ message: 'user_id required' });

  const access_token = signAccessToken({ sub: String(user_id), role, email });
  const refresh_token = crypto.randomBytes(64).toString('hex');

  await persistRefreshToken(user_id, refresh_token);

  return res.json({ access_token, refresh_token });
}

/** ✅ UPDATED: refresh now validates from DB via ORDS */
async function refresh(req, res) {
  const { refresh_token } = req.body || {};

  console.log("🔁 /auth/refresh", {
    pid: process.pid,
    hasToken: !!refresh_token,
    starts: refresh_token ? refresh_token.slice(0, 10) : null,
  });

  if (!refresh_token) {
    return res.status(400).json({ message: "refresh_token required" });
  }

  try {
    const data = await authTokensValidate({ refresh_token });

    const userId = Number(data?.user_id);
    if (!userId) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const access_token = signAccessToken({ sub: String(userId), role: 'user' });
    return res.json({ access_token });

  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function logout(req, res) {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ message: "refresh_token required" });

  try {
    await authTokensRevoke({ refresh_token });   // ✅ marks it revoked in DB
    return res.json({ ok: true });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}


async function login(req, res) {
  try {
    let { email, mobile_number, channel, target } = req.body || {};
    if (!email && !mobile_number && channel && target) {
      if (String(channel).toLowerCase() === 'email') email = target;
      if (String(channel).toLowerCase() === 'mobile') mobile_number = target;
    }

    const data = await ordsLogin({ email, mobile_number });

    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = (data.out_mobile ?? data.OUT_MOBILE) ?? null;
    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_client_code = (data.out_client_code ?? data.OUT_CLIENT_CODE) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;
    const response_message =
      data.response_message ??
      data.RESPONSE_MESSAGE ??
      'Login failed';

    if (!out_user_id) {
      return res.status(401).json({ message: response_message });
    }

    const access_token = signAccessToken(
      { sub: String(out_user_id), role: 'user', email: out_email },
      '30m'
    );

    const refresh_token = crypto.randomBytes(64).toString('hex');
    await persistRefreshToken(out_user_id, refresh_token); // ✅ UPDATED

    return res.json({
      message: response_message,
      access_token,
      refresh_token,
      profile: {
        user_id: out_user_id,
        mobile: out_mobile,
        email: out_email,
        client_code: out_client_code,
        full_name: out_name,
      }
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function register(req, res) {
  try {
    let { email, mobile_number, full_name } = req.body || {}

    if (!email || !mobile_number || !full_name) {
      return res.status(400).json({ message: 'Please fill all the fileds' });
    }

    const data = await registerUser({ email, mobile_number, full_name });

    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = (data.out_mobile ?? data.OUT_MOBILE) ?? null;
    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_client_code = (data.out_client_code ?? data.OUT_CLIENT_CODE) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;
    const response_message =
      data.response_message ??
      data.RESPONSE_MESSAGE ??
      'Registration failed';

    if (!out_user_id) {
      return res.status(401).json({ message: response_message });
    }

    const access_token = signAccessToken(
      { sub: String(out_user_id), role: 'user', email: out_email },
      '30m'
    );

    const refresh_token = crypto.randomBytes(64).toString('hex');
    await persistRefreshToken(out_user_id, refresh_token); // ✅ UPDATED

    return res.json({
      message: response_message,
      access_token,
      refresh_token,
      profile: {
        user_id: out_user_id,
        mobile: out_mobile,
        email: out_email,
        client_code: out_client_code,
        full_name: out_name,
      }
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function loginClient(req, res) {
  try {
    let { client_code } = req.body || {};
    if (!client_code) {
      return res.status(400).json({ message: 'Provide client code please.' });
    }
    const data = await registerClient({ client_code });

    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = (data.out_mobile ?? data.OUT_MOBILE) ?? null;
    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_client_code = (data.out_client_code ?? data.OUT_CLIENT_CODE) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;
    const response_message =
      data.response_message ??
      data.RESPONSE_MESSAGE ??
      'Client does not exist';

    if (!out_user_id) {
      return res.status(401).json({ message: response_message });
    }

    const access_token = signAccessToken(
      { sub: String(out_user_id), role: 'user', email: out_email },
      '30m'
    );

    const refresh_token = crypto.randomBytes(64).toString('hex');
    await persistRefreshToken(out_user_id, refresh_token); // ✅ UPDATED

    return res.json({
      message: response_message,
      access_token,
      refresh_token,
      profile: {
        user_id: out_user_id,
        mobile: out_mobile,
        email: out_email,
        client_code: out_client_code,
        full_name: out_name,
      }
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getLoginClientEmail(req, res) {
  try {
    let { client_code } = req.body || {};
    if (!client_code) {
      return res.status(400).json({ message: 'Provide client code please.' });
    }

    const data = await getClientEmail({ client_code });

    const response_message =
      data.response_message ??
      data.RESPONSE_MESSAGE ??
      'Invalid client code.';

    // ✅ FIXED: removed invalid out_user_id check (it wasn't defined here)

    return res.json({
      message: response_message,
      email: data?.out_email ?? null,
      mobile: data?.out_mobile_number ?? null,
    });
  } catch (e) {
    console.error('getLoginClientEmail error:', e.response?.data || e.message);
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getClientCode(req, res) {
  try {
    let { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: 'Please provide email.' });
    }

    const data = await resendClientCode({ email });
    return res.json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    const payload = e.response?.data ?? { message: e.message };
    return res.status(code).json(payload);
  }
}

async function registerExistingClientFromMainDB(req, res) {
  try {
    let { client_code } = req.body || {};
    if (!client_code) {
      return res.status(400).json({ message: 'Provide client code please.' });
    }

    const data = await registerExistingClient({ client_code });

    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;
    const response_message =
      data.response_message ??
      data.RESPONSE_MESSAGE ??
      'Client does not exist';

    if (!out_email) {
      return res.status(404).json({ message: 'Login failed' });
    }

    return res.json({
      message: response_message,
      profile: {
        email: out_email,
        full_name: out_name,
      }
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function clienCodeExist(req, res) {
  try {
    let { client_code } = req.body || {};
    if (!client_code) {
      return res.status(400).json({ message: 'Provide client code please.' });
    }

    const chk = await checkClientCode({ client_code });
    let status = chk?.status;

    if (!status) {
      return res.status(500).json({ ok: false, message: "Invalid ORDS response." });
    }

    if (status === "NOT_FOUND") {
      return res.status(404).json({ ok: false, status, message: "Invalid client code." });
    }

    return res.json({
      ok: true,
      status,
      message:
        status === "AYC_USERS"
          ? "Client already registered."
          : "Client found in main system.",
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { ok: false, message: e.message });
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  getLoginClientEmail,
  getClientCode,
  issueToken,
  refresh,
  login,
  loginClient,
  clienCodeExist,
  register,
  registerExistingClientFromMainDB,
  logout
};
