const axios = require("axios");
const { getIdcsToken } = require("./idcsServices");
const crypto = require("crypto");
const REFRESH_PEPPER = process.env.REFRESH_TOKEN_PEPPER_OCID;
if (!REFRESH_PEPPER) {
    throw new Error("REFRESH_TOKEN_PEPPER_OCID is missing");
}

function refreshDigest(refresh_token) {
    return crypto
        .createHmac("sha256", String(REFRESH_PEPPER))
        .update(String(refresh_token))
        .digest("hex");
}

async function callGateway(method, path, { params, data } = {}) {
    const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
    const token = await getIdcsToken(url);
    const res = await axios({
        url,
        method,
        params,
        data,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    return res.data;
}


function authTokensCreate({ user_id, refresh_token, device_id, days = 30 }) {
    if (!device_id) throw new Error("device_id is required");

    const token_hash = refreshDigest(refresh_token);

    return callGateway("POST", "authTokens/create", {
        data: {
            user_id: Number(user_id),
            token_hash,
            device_id: String(device_id),
            days: Number(days),
        },
    });
}

function authTokensValidate({ refresh_token, device_id }) {
    if (!device_id) throw new Error("device_id is required");

    const token_hash = refreshDigest(refresh_token);

    return callGateway("POST", "authTokens/validate", {
        data: {
            token_hash,
            device_id: String(device_id),
        },
    });
}

function authTokensRevoke({ refresh_token, device_id }) {
    if (!device_id) throw new Error("device_id is required");

    const token_hash = refreshDigest(refresh_token);

    return callGateway("POST", "authTokens/revoke", {
        data: {
            token_hash,
            device_id: String(device_id),
        },
    });
}

function authTokensRevokeByUserDevice({ user_id, device_id }) {
    if (!device_id) throw new Error("device_id is required");
    if (!Number.isFinite(Number(user_id))) {
        throw new Error("user_id must be numeric");
    }

    return callGateway("POST", "authTokens/revokeByUserDevice", {
        data: {
            user_id: Number(user_id),
            device_id: String(device_id),
        },
    });
}
function sendMobileOtp(mobile_number) {
  return callGateway("POST", "sendMobileOtp", {
    data: { mobile_number },
  });
}

function verifyMobileOtp(mobile, otp) {
  return callGateway("POST", "verifyMobileOtp", {
    data: {
      mobile_number: mobile,
      otp_code: otp,
    },
  });
}

function sendEmailOtp(email) {
  return callGateway("POST", "sendEmailOtp", {
    data: { email },
  });
}

function verifyEmailOtp(email, otp) {
  return callGateway("POST", "verifyEmailOtp", {
    data: {
      email,
      otp_code: otp,
    },
  });
}

function ordsLogin({ email, mobile_number }) {
  const data = {};

  if (email) data.email = email;
  if (mobile_number) data.mobile_number = mobile_number;

  return callGateway("POST", "login", { data });
}

function registerClient({ client_code }) {
  return callGateway("POST", "registerClient", {
    data: { client_code },
  });
}

function checkClientCode({ client_code }) {
  return callGateway("POST", "checkClientCode", {
    data: { client_code },
  });
}

function registerExistingClient({ client_code }) {
  return callGateway("POST", "registerExistingClient", {
    data: { client_code },
  });
}

function registerUser({ email, mobile_number, full_name }) {
  if (!email || !mobile_number || !full_name) {
    throw new Error("Please fill all the fields");
  }

  return callGateway("POST", "register", {
    data: {
      email,
      mobile_number,
      full_name,
    },
  });
}

function resendClientCode({ email }) {
  if (!email) {
    throw new Error("Please fill all the fields");
  }

  return callGateway("POST", "resendWalkingCode", {
    params: { email },
  });
}

function getClientEmail({ client_code }) {
  if (!client_code) {
    throw new Error("client_code is required");
  }

  return callGateway("POST", "getExistedClientEmail", {
    data: { client_code },
  });
}

module.exports = {
    authTokensCreate,
    authTokensValidate,
    authTokensRevoke,
    authTokensRevokeByUserDevice,
    resendClientCode,
    getClientEmail,
    sendMobileOtp,
    verifyMobileOtp,
    sendEmailOtp,
    verifyEmailOtp,
    ordsLogin,
    registerClient,
    checkClientCode,
    registerUser,
    registerExistingClient,
};
