const crypto = require("crypto");
const { signAccessToken } = require("../utils/jwt");

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
  authTokensRevokeByUserDevice,
} = require("../services/authServices");

const { sendSms } = require("../services/etisalatServices");
const { normalizeUaeMobile } = require("../utils/normalizeMobile");

const days = process.env.REFRESH_TOKEN_DAYS;

async function persistRefreshToken(userId, refresh_token, device_id) {
  await authTokensCreate({
    user_id: Number(userId),
    refresh_token,
    device_id,
    days,
  });
}

async function sendOtp(req, res) {
  const { channel, target } = req.body || {};

  if (!channel || !target) {
    return res.status(400).json({ message: "channel & target required" });
  }

  try {
    if (channel === "mobile") {
      const normalized = normalizeUaeMobile(target);
      const data = await sendMobileOtp(normalized);

      const otp = data.generated_otp ?? null;

      if (otp) {
        const msg = `Your OTP is ${otp}`;
        try {
          await sendSms({
            opts: {
              to: String(normalized),
              message: msg,
            },
          });
        } catch (err) {
          console.error("Etisalat SMS failed in sendOtp:", {
            message: err?.message,
            status: err?.response?.status,
            data: err?.response?.data,
          });
        }
      }

      return res.json({ sent: true });
    }

    const data = await sendEmailOtp(target);
    return res.json({ sent: true, ...data });
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function verifyOtp(req, res) {
  const { channel, target, otp } = req.body || {};

  if (!channel || !target || !otp) {
    return res.status(400).json({ message: "channel, target, otp required" });
  }

  try {
    const normalizedTarget =
      channel === "mobile" ? normalizeUaeMobile(target) : target;

    const data =
      channel === "mobile"
        ? await verifyMobileOtp(normalizedTarget, otp)
        : await verifyEmailOtp(normalizedTarget, otp);

    const raw = (
      data.verification_status ??
      data.VERIFICATION_STATUS ??
      data.status ??
      ""
    ).trim();

    const status = raw.toUpperCase();
    const OK = new Set(["VERIFIED", "SUCCESS", "VALID", "MATCH"]);
    const verified = OK.has(status);

    if (!verified) {
      return res.status(401).json({ verified: false, status });
    }

    return res.json({ verified: true, status });
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function refresh(req, res) {
  const { refresh_token, device_id } = req.body || {};

  if (!refresh_token) {
    return res.status(400).json({ message: "refresh_token required" });
  }

  if (!device_id) {
    return res.status(400).json({ message: "device_id required" });
  }

  try {
    const data = await authTokensValidate({ refresh_token, device_id });

    const userId = Number(data?.user_id);
    if (!userId) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const access_token = signAccessToken({
      sub: String(userId),
      role: "user",
    });

    const new_refresh_token = crypto.randomBytes(64).toString("hex");

    await authTokensRevoke({ refresh_token, device_id });

    await authTokensCreate({
      user_id: Number(userId),
      refresh_token: new_refresh_token,
      device_id,
      days,
    });

    return res.json({
      access_token,
      refresh_token: new_refresh_token,
    });
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function logout(req, res) {
  const { refresh_token, device_id } = req.body || {};


  if (!refresh_token) {
    return res.status(400).json({ message: "refresh_token required" });
  }

  if (!device_id) {
    return res.status(400).json({ message: "device_id required" });
  }

  try {
    const result = await authTokensRevoke({ refresh_token, device_id });

    return res.json({ ok: true });
  } catch (e) {
    console.error("❌ LOGOUT ERROR:", e.response?.data || e.message);

    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}


async function login(req, res) {
  try {
    let { email, mobile_number, channel, target, device_id } = req.body || {};

    if (!device_id) {
      return res.status(400).json({ message: "device_id required" });
    }

    if (!email && !mobile_number && channel && target) {
      if (String(channel).toLowerCase() === "email") {
        email = target;
      }
      if (String(channel).toLowerCase() === "mobile") {
        mobile_number = target;
      }
    }

    if (mobile_number) {
      mobile_number = normalizeUaeMobile(mobile_number);
    }

    const data = await ordsLogin({ email, mobile_number });
    console.log("🔐 ORDS LOGIN RESPONSE:", data);

    console.log("hello1");
    const out_user_id = Number(data.user_id ?? data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = data.mobile ?? data.out_mobile ?? data.OUT_MOBILE ?? null;
    const out_email = data.email ?? data.out_email ?? data.OUT_EMAIL ?? null;
    const out_client_code =
      data.client_code ?? data.out_client_code ?? data.OUT_CLIENT_CODE ?? null;
    const out_name = data.name ?? data.out_name ?? data.OUT_NAME ?? null;

    const response_message =
      data.message ?? data.response_message ?? data.RESPONSE_MESSAGE ?? "Login failed";
    if (!out_user_id) {
      return res.status(401).json({ message: response_message });
    }

    console.log("hello2");
    const access_token = signAccessToken(
      { sub: String(out_user_id), role: "user", email: out_email },
      "30m"
    );

    const refresh_token = crypto.randomBytes(64).toString("hex");

    console.log("hello");
    await authTokensRevokeByUserDevice({
      user_id: out_user_id,
      device_id,
    });
    console.log("hello");
    await persistRefreshToken(out_user_id, refresh_token, device_id);

    console.log("hello");
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
      },
    });
    
    console.log("hello");
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function register(req, res) {
  try {
    let { email, mobile_number, full_name, device_id } = req.body || {};

    if (!device_id) {
      return res.status(400).json({ message: "device_id required" });
    }

    if (!email || !mobile_number || !full_name) {
      return res.status(400).json({ message: "Please fill all the fileds" });
    }

    mobile_number = normalizeUaeMobile(mobile_number);

    const data = await registerUser({ email, mobile_number, full_name });

    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = data.out_mobile ?? data.OUT_MOBILE ?? null;
    const out_email = data.out_email ?? data.OUT_EMAIL ?? null;
    const out_client_code = data.out_client_code ?? data.OUT_CLIENT_CODE ?? null;
    const out_name = data.out_name ?? data.OUT_NAME ?? null;
    const response_message =
      data.response_message ?? data.RESPONSE_MESSAGE ?? "Registration failed";

    if (!out_user_id) {
      return res.status(401).json({ message: response_message });
    }

    const access_token = signAccessToken(
      { sub: String(out_user_id), role: "user", email: out_email },
      "30m"
    );

    const refresh_token = crypto.randomBytes(64).toString("hex");

    await authTokensRevokeByUserDevice({
      user_id: out_user_id,
      device_id,
    });

    await persistRefreshToken(out_user_id, refresh_token, device_id);

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
      },
    });
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function loginClient(req, res) {
  try {
    let { client_code, device_id } = req.body || {};

    if (!device_id) {
      return res.status(400).json({ message: "device_id required" });
    }

    if (!client_code) {
      return res.status(400).json({ message: "Provide client code please." });
    }

    const data = await registerClient({ client_code });

    const out_user_id = Number(data.out_user_id ?? data.OUT_USER_ID);
    const out_mobile = data.out_mobile ?? data.OUT_MOBILE ?? null;
    const out_email = data.out_email ?? data.OUT_EMAIL ?? null;
    const out_client_code = data.out_client_code ?? data.OUT_CLIENT_CODE ?? null;
    const out_name = data.out_name ?? data.OUT_NAME ?? null;
    const response_message =
      data.response_message ?? data.RESPONSE_MESSAGE ?? "Client does not exist";

    if (!out_user_id) {
      return res.status(401).json({ message: response_message });
    }

    const access_token = signAccessToken(
      { sub: String(out_user_id), role: "user", email: out_email },
      "30m"
    );

    const refresh_token = crypto.randomBytes(64).toString("hex");

    await authTokensRevokeByUserDevice({
      user_id: out_user_id,
      device_id,
    });

    await persistRefreshToken(out_user_id, refresh_token, device_id);

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
      },
    });
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function getLoginClientEmail(req, res) {
  try {
    let { client_code } = req.body || {};

    if (!client_code) {
      return res.status(400).json({ message: "Provide client code please." });
    }

    const data = await getClientEmail({ client_code });

    const response_message =
      data.response_message ?? data.RESPONSE_MESSAGE ?? "Invalid client code.";

    return res.json({
      message: response_message,
      email: data?.out_email ?? null,
      mobile: data?.out_mobile_number ?? null,
    });
  } catch (e) {
    console.error("getLoginClientEmail error:", e.response?.data || e.message);
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function getClientCode(req, res) {
  try {
    let { email } = req.body || {};

    email = email?.trim();

    if (!email) {
      return res.status(400).json({
        message: "Please provide email.",
      });
    }

    const data = await resendClientCode({ email });

    const message =
      data?.response_message ??
      data?.RESPONSE_MESSAGE ??
      data?.message ??
      "Request processed.";

    const success =
      /your client code has been sent to your email/i.test(message);

    return res.status(success ? 200 : 400).json({
      ...data,
      message,
    });
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    const payload = e.response?.data ?? e.upstream?.data ?? { message: e.message };
    return res.status(code).json(payload);
  }
}

async function registerExistingClientFromMainDB(req, res) {
  try {
    let { client_code } = req.body || {};

    if (!client_code) {
      return res.status(400).json({ message: "Provide client code please." });
    }

    const data = await registerExistingClient({ client_code });

    const out_email = data.out_email ?? data.OUT_EMAIL ?? null;
    const out_name = data.out_name ?? data.OUT_NAME ?? null;
    const response_message =
      data.response_message ?? data.RESPONSE_MESSAGE ?? "Client does not exist";

    if (!out_email) {
      return res.status(404).json({ message: "Login failed" });
    }

    return res.json({
      message: response_message,
      profile: {
        email: out_email,
        full_name: out_name,
      },
    });
  } catch (e) {
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { message: e.message });
  }
}

async function clienCodeExist(req, res) {
  try {
    let { client_code } = req.body || {};

    if (!client_code) {
      return res.status(400).json({ message: "Provide client code please." });
    }

    const chk = await checkClientCode({ client_code });
    let status = chk?.status;

    if (!status) {
      return res
        .status(500)
        .json({ ok: false, message: "User doesn't exist" });
    }

    if (status === "NOT_FOUND") {
      return res
        .status(404)
        .json({ ok: false, status, message: "User doesn't exist" });
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
    const code = e.response?.status ?? e.upstream?.status ?? 500;
    return res
      .status(code)
      .json(e.response?.data ?? e.upstream?.data ?? { ok: false, message: e.message });
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  getLoginClientEmail,
  getClientCode,
  refresh,
  login,
  loginClient,
  clienCodeExist,
  register,
  registerExistingClientFromMainDB,
  logout,
};