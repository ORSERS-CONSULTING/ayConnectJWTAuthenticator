const crypto = require('crypto');
const { signAccessToken } = require('../utils/jwt');
const store = require('../store/refreshStore');
const {
  sendMobileOtp, verifyMobileOtp, sendEmailOtp, verifyEmailOtp, ordsLogin, getClientEmail, registerClient, checkClientCode, registerUser, registerExistingClient, resendClientCode
} = require('../services/ordsServices');
const { sendSms } = require('../services/etisalatServices');

/** Public: send OTP (mobile or email) */
// async function sendOtp(req, res) {
//   const { channel, target } = req.body || {};
//   if (!channel || !target) return res.status(400).json({ message: 'channel & target required' });

//   try {
//     const data = channel === 'mobile'
//       ? await sendMobileOtp(target)
//       : await sendEmailOtp(target);

//     // Return whatever ORDS returns (ideally you do NOT echo the OTP back!)
//     return res.json(data);
//   } catch (e) {
//     const code = e.response?.status ?? 500;
//     return res.status(code).json(e.response?.data ?? { message: e.message });
//   }
// }

async function sendOtp(req, res) {
  const { channel, target } = req.body || {};
  if (!channel || !target) return res.status(400).json({ message: 'channel & target required' });

  try {
    if (channel === 'mobile') {
      const data = await sendMobileOtp(target);

      const otp =
        data.generated_otp ??
        null;

      if (otp) {
        const msg = `Your OTP is ${otp}`;
        try {
          await sendSms({ to: String(target), message: msg });
        } catch (err) {
          console.error('Etisalat SMS failed:', err?.message || err);
          // If you want to fail hard when SMS fails, uncomment:
          // return res.status(502).json({ message: 'SMS delivery failed' });
        }
      }

      // Don't echo OTP back
      return res.json({ sent: true });
    }

    // Email channel (ORDS handles email send)
    const data = await sendEmailOtp(target);
    return res.json({ sent: true, ...data });

  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}
/** Public: verify OTP -> issue App JWT + refresh */
async function verifyOtp(req, res) {
  const { channel, target, otp } = req.body || {};
  if (!channel || !target || !otp) {
    return res.status(400).json({ message: 'channel, target, otp required' });
  }

  try {
    const data = channel === 'mobile'
      ? await verifyMobileOtp(target, otp)              // sends { mobile_number, otp_code }
      : await verifyEmailOtp(target, otp);             // sends { email, otp_code }

    // Normalize status from ORDS
    const status = String(
      data.verification_status ?? data.VERIFICATION_STATUS ?? data.status ?? ''
    ).toUpperCase();

    const verified = /(VERIFIED|SUCCESS|VALID|MATCH)/.test(status);

    if (!verified) {
      return res.status(401).json({ verified: false, status });
    }

    // ✅ Only verification result — NO app tokens here
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

  const access_token = signAccessToken({ sub: String(user_id), role, email }, '30m');
  const refresh_token = crypto.randomBytes(64).toString('hex');
  store.put(refresh_token, String(user_id));

  return res.json({ access_token, refresh_token });
}

async function refresh(req, res) {
  const { refresh_token } = req.body || {};
  const userId = refresh_token && store.get(refresh_token);
  if (!userId) return res.status(401).json({ message: 'Invalid refresh token' });

  const access_token = signAccessToken({ sub: userId, role: 'user' }, '30m');
  return res.json({ access_token });
}

async function login(req, res) {
  try {
    let { email, mobile_number, channel, target } = req.body || {};
    if (!email && !mobile_number && channel && target) {
      if (String(channel).toLowerCase() === 'email') email = target;
      if (String(channel).toLowerCase() === 'mobile') mobile_number = target;
    }
    // enforce “exactly one of”:
    // const hasEmail = !!email;
    // const hasMobile = !!mobile_number;
    // if (hasEmail === hasMobile) {
    //   return res.status(400).json({ message: 'Provide exactly one of email or mobile_number' });
    // }

    const data = await ordsLogin({ email, mobile_number });
    // Normalize fields from ORDS response
    // const userId = Number(
    //   data.out_user_id ?? data.OUT_USER_ID ?? data.user_id ?? data.USER_ID
    // );

    console.log(data)
    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = (data.out_mobile ?? data.OUT_MOBILE) ?? null;
    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_client_code = (data.out_client_code ?? data.OUT_CLIENT_CODE) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;

    if (!out_user_id) {
      return res.status(401).json({ message: 'Login failed' });
    }

    // Issue your app tokens
    const access_token = signAccessToken({ sub: String(out_user_id), role: 'user', email: out_email }, '30m');
    const refresh_token = crypto.randomBytes(64).toString('hex');
    store.put(refresh_token, String(out_user_id));

    return res.json({
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
    console.log(data)
    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = (data.out_mobile ?? data.OUT_MOBILE) ?? null;
    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_client_code = (data.out_client_code ?? data.OUT_CLIENT_CODE) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;

    if (!out_user_id) {
      return res.status(401).json({ message: data.response_message });
    }

    // Issue your app tokens
    const access_token = signAccessToken({ sub: String(out_user_id), role: 'user', email: out_email }, '30m');
    const refresh_token = crypto.randomBytes(64).toString('hex');
    store.put(refresh_token, String(out_user_id));

    return res.json({
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

    console.log(data)
    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = (data.out_mobile ?? data.OUT_MOBILE) ?? null;
    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_client_code = (data.out_client_code ?? data.OUT_CLIENT_CODE) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;

    if (!out_user_id) {
      return res.status(401).json({ message: 'Login failed' });
    }

    // Issue your app tokens
    const access_token = signAccessToken({ sub: String(out_user_id), role: 'user', email: out_email }, '30m');
    const refresh_token = crypto.randomBytes(64).toString('hex');
    store.put(refresh_token, String(out_user_id));

    return res.json({
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
    // ORDS returns OUT params: { out_email, out_mobile_number }
    return res.json({
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

    console.log(data)
    return res.json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    const payload = e.response?.data ?? { message: e.message };
    return res.status(code).json(payload);  // <-- don’t swallow errors
  }
}

async function registerExistingClientFromMainDB(rew, res) {
  try {
    let { client_code } = req.body || {};
    if (!client_code) {
      return res.status(400).json({ message: 'Provide client code please.' });
    }

    const data = await registerExistingClient({ client_code });

    console.log(data)
    const out_email = (data.out_email ?? data.OUT_EMAIL) ?? null;
    const out_name = (data.out_name ?? data.OUT_NAME) ?? null;

    if (!out_email) {
      return res.status(401).json({ message: 'Login failed' });
    }

    return res.json({
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

    // Try the direct field first
    let status = chk?.status;

    // If not there, try response (which may be a JSON string)
    if (!status && chk?.response) {
      const r = chk.response;
      if (typeof r === 'string') {
        try { status = JSON.parse(r).status; } catch (e) { /* log if needed */ }
      } else if (typeof r === 'object') {
        status = r.status;
      }
    }
    return res.json({ status });

  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}



module.exports = { sendOtp, verifyOtp, getLoginClientEmail, getClientCode, issueToken, refresh, login, loginClient, clienCodeExist, register, registerExistingClientFromMainDB };
