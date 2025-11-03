const axios = require("axios");
const { getIdcsToken } = require("./idcsServices");
// function peek(s, n = 200) {
//   return s && s.length > n ? s.slice(0, n) + "…(truncated)" : s || "";
// }
// function mask(s) {
//   return s && s.length > 24 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s || "";
// }

// Canonicalize to your app's enum
function normalizeToAppStatus(rawStatus) {
  const s = String(rawStatus || "").toUpperCase();

  if (s === "PAID" || s === "SUCCESS" || s === "SUCCEEDED") return "PAID";

  // Treat anything non-terminal as pending payment
  if (
    s === "PENDING_PAYMENT" ||
    s === "PENDING" ||
    s === "PROCESSING" ||
    s.startsWith("REQUIRES_") // Stripe: requires_payment_method, requires_action, etc.
  )
    return "PENDING_PAYMENT";

  return "FAILED";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function callGatewayBinary(method, path, rawBuffer, contentType, { params } = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);

  return axios({
    method, // "PUT"
    url,
    params,           // { user_id, content_type }
    data: rawBuffer,  // -> :body
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    validateStatus: () => true,
    responseType: "text",
    transformResponse: [(x) => x],
    maxBodyLength: 50 * 1024 * 1024,
    maxContentLength: 50 * 1024 * 1024,
  });
}




async function callGateway(method, path, { params, data } = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);
  const res = await axios({
    url,
    method,
    params,
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
async function forwardToOrds(rawBodyBuffer, stripeSignature) {
  const url = `${process.env.GATEWAY_BASE_URL}/webhook`;

  const token = await getIdcsToken(url);

  return axios.post(url, rawBodyBuffer, {
    headers: {
      "Content-Type": "application/json", // keep JSON
      Stripe_Signature: stripeSignature, // original
      X_Stripe_Signature: stripeSignature, // copy for gateways that strip the first
      Authorization: `Bearer ${token}`, // satisfy API Gateway
    },
    transformRequest: [(d) => d], // DO NOT touch raw body
    maxBodyLength: Infinity,
    timeout: 15000,
    validateStatus: () => true,
  });
}
async function getPaymentResult(requestId) {
  if (requestId == null) throw new Error("requestId is required");

  // If your ORDS uses POST + ?request_id=..., keep this URL.
  // If you later switch to a path param style, change to /requests/:id.
  const url = `${process.env.GATEWAY_BASE_URL}/getPaymentResult`;
  const token = await getIdcsToken(url);

  const res = await axios({
    method: "POST",
    url,
    params: { request_id: requestId }, // <-- matches your current ORDS route
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
    timeout: 15000,
  });

  if (res.status === 404) return { status: "PENDING_PAYMENT" };
  if (res.status < 200 || res.status >= 300) {
    const msg =
      typeof res.data === "string"
        ? res.data
        : res.data?.error || res.data?.message || JSON.stringify(res.data);
    throw new Error(`getPaymentResult failed (${res.status}): ${msg}`);
  }

  // -------- Unwrap any ORDS shape (object | string | {response_body: string}) --------
  let payload = res.data ?? {};

  // case A: raw string body
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {}
  }

  // case B: wrapper with response_body/responseBody
  if (payload && typeof payload.response_body === "string") {
    try {
      payload = JSON.parse(payload.response_body);
    } catch {}
  } else if (payload && typeof payload.responseBody === "string") {
    try {
      payload = JSON.parse(payload.responseBody);
    } catch {}
  }

  const raw = payload?.status;
  const norm = normalizeToAppStatus(raw);

  
  // drop any conflicting status-like fields, return normalized LAST
  const {
    status: _s1,
    state: _s2,
    payment_status: _s3,
    order_status: _s4,
    result: _s5,
    ...rest
  } = payload || {};

  return { ...rest, status: norm };
}

async function callGatewayUpload(path, data = {}, extraHeaders = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };

  const b64Len =
    typeof data.file_base64 === "string" ? data.file_base64.length : 0;

  const res = await axios({
    method: "POST",
    url,
    data,
    headers,
    maxBodyLength: 50 * 1024 * 1024,
    maxContentLength: 50 * 1024 * 1024,
    validateStatus: () => true, // we handle all statuses
    responseType: "text", // keep raw string (empty possible)
    transformResponse: [(x) => x], // do not auto-parse JSON
  });

  // res.data may be "" (empty string). Avoid Object.keys on a string.
  const preview =
    typeof res.data === "string"
      ? res.data.length
        ? `${res.data.slice(0, 120)}…`
        : "<empty>"
      : "<non-string>";

  return res; // keep full axios response (status, headers, data)
}

async function callGatewayJson(method, path, { params, data } = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);

  const res = await axios({
    method: "POST",
    url,
    params,
    data,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    validateStatus: () => true, // we’ll handle non-2xx ourselves
    responseType: "text", // keep raw (could be "", JSON, or JSON string)
    transformResponse: [(x) => x], // do not auto-parse
  });

  // Try to parse JSON if possible; otherwise keep as text
  let parsed;
  try {
    parsed = res.data ? JSON.parse(res.data) : {};
  } catch {
    parsed = { __raw: res.data }; // non-JSON response
  }

  return {
    status: res.status,
    headers: res.headers,
    data: parsed,
    raw: res.data,
  };
}

function sendMobileOtp(mobile_number) {
  return callGateway("POST", "send-mobile-otp", { params: { mobile_number } });
}
function verifyMobileOtp(mobile, otp) {
  return callGateway("POST", "verify-mobile-otp", {
    params: { mobile_number: mobile, otp_code: otp },
  });
}
function sendEmailOtp(email) {
  return callGateway("POST", "send-email-otp", { params: { email } });
}
function verifyEmailOtp(email, otp) {
  return callGateway("POST", "verify-email-otp", {
    params: { email, otp_code: otp },
  });
}
function ordsLogin({ email, mobile_number }) {
  const params = {};
  if (email) params.email = email;
  if (mobile_number) params.mobile_number = mobile_number;
  // only the present one will be sent as a query param
  return callGateway("POST", "login", { params });
}
function registerClient({ client_code }) {
  return callGateway("POST", "register-client", { params: { client_code } });
}
function checkClientCode({ client_code }) {
  return callGateway("POST", "check-client-code", { params: { client_code } });
}
function registerExistingClient({ client_code }) {
  return callGateway("POST", "register-existing-client", {
    params: { client_code },
  });
}
function registerUser({ email, mobile_number, full_name }) {
  if (!email || !mobile_number || !full_name) {
    throw new Error("Please fill all the fileds");
  }

  return callGateway("POST", "register", { params: {email, mobile_number, full_name} });
}
function resendClientCode({ email }) {
  if (!email) {
    throw new Error("Please fill all the fileds");
  }

  return callGateway("POST", "resend-Walking-Code", { params: { email } });
}
function getClientEmail({ client_code }) {
  if (!client_code) {
    throw new Error("client_code is required");
  }
  return callGateway("POST", "getExistedClientEmail", {
    params: { client_code },
  });
}
function ordsGetServices() {
  return callGateway("GET", "getServices");
}
function ordsGetDepartments() {
  return callGateway("GET", "getDepartments");
}
function ordsGetProcedures() {
  return callGateway("GET", "getProcedures");
}
function ordsGetUserDocs(user_id) {
return callGateway("GET", "show-user-documents", { params: { user_id: Number(user_id) } });
}
function ordsGetDocumentTypes() {
  // no params needed; still goes through callGateway which adds the IDCS token
  return callGateway("GET", "document-types");
}

function uploadDocuments(docPayload) {
  // ensure pure base64 (no data: prefix)
  if (
    typeof docPayload.file_base64 === "string" &&
    docPayload.file_base64.startsWith("data:")
  ) {
    docPayload = {
      ...docPayload,
      file_base64:
        docPayload.file_base64.split(",")[1] || docPayload.file_base64,
    };
  }

  // TODO: confirm correct upstream path
  return callGatewayUpload("upload-documents", docPayload); // <-- set the RIGHT path
}
async function initPayment(payPayload, ctx = {}) {
  const body = {
    amount: Number(payPayload.amount),
    currency: payPayload.currency,
    description:
      payPayload.description ?? `Service ${payPayload.serviceCode ?? ""}`,

    // ✅ Align JSON shape 1:1 with ORDS parser paths
    context: {
      user_id: ctx.user_id ?? ctx.userId ?? 0,
      service_id: ctx.service_id ?? ctx.serviceId ?? 0,
      procedure_id: ctx.procedure_id ?? ctx.procedureId ?? null,
      request_id: ctx.request_id ?? ctx.requestId ?? null,
      step_order: ctx.step_order ?? ctx.stepOrder ?? null,  // ✅ added
      email: ctx.email ?? "test.user@example.com",
      name: ctx.name ?? "Test User",
    },
  };

  const idempotency = body.context.request_id
    ? String(body.context.request_id)
    : undefined;

  const headers = idempotency ? { "Idempotency-Key": idempotency } : undefined;

  const res = await callGatewayJson("POST", "pay", { data: body, headers });
  const { status, data } = res;

  if (status < 200 || status >= 300) {
    throw new Error(
      data?.error ||
        data?.message ||
        `Payment initialization failed (status ${status})`
    );
  }

  // unwrap ORDS response {response_body: "<json string>"}
  let parsed = data;
  if (typeof data?.response_body === "string") {
    try {
      parsed = JSON.parse(data.response_body);
    } catch {
      throw new Error("response_body was not valid JSON");
    }
  }

  const clientSecret =
    parsed.paymentIntent ?? parsed.client_secret ?? parsed.clientSecret;
  const customerId = parsed.customer ?? parsed.customer_id ?? parsed.customerId;
  const ephemeralKey = parsed.ephemeralKey ?? parsed.ephemeral_key;
  const requestId =
    parsed.requestId ?? parsed.request_id ?? body.context.request_id ?? null;

  if (!clientSecret || !customerId || !ephemeralKey) {
    throw new Error(
      `Malformed payment response. Keys: ${Object.keys(parsed || {}).join(", ")}`
    );
  }

  return { clientSecret, customerId, ephemeralKey, requestId };
}


// async function waitForPaid(
//   requestId,
//   { timeoutMs = 20000, intervalMs = 1000 } = {}
// ) {
//   const until = Date.now() + timeoutMs;
//   let last = { status: "PENDING_PAYMENT" };

//   while (Date.now() < until) {
//     const current = await getPaymentResult(requestId);
//     const s = String(current.status).toUpperCase();
//     if (s === "PAID" || s === "FAILED") return current;

//     last = { ...current, status: "PENDING_PAYMENT" };
//     await sleep(intervalMs);
//   }
//   return last;
// }

async function ordsUploadUserAvatar(user_id, fileBuffer, mimeType) {
  const PATH = "uploadAvatar";
  return callGatewayBinary("PUT", PATH, fileBuffer, mimeType, {
    params: {  user_id: Number(user_id), content_type: mimeType },
  });
}

async function ordsGetUserAvatar(user_id) {
  if (!user_id) throw new Error("user_id is required");
  // <-- set to your ORDS GET that selects content_type, content (BLOB)
  const PATH = "getUserImage"; // e.g. the ORDS template for your SELECT handler
  const url = `${process.env.GATEWAY_BASE_URL}/${PATH}`;
  const token = await getIdcsToken(url);

  return axios({
    method: "GET",
    url,
    params: {  user_id: Number(user_id) },         // matches :user_id
    headers: { Authorization: `Bearer ${token}` },
    responseType: "stream",      // or "arraybuffer" if you prefer
    validateStatus: () => true,
  });
}

function ordsGetUserDetails(user_id) {
  if (!user_id) throw new Error("user_id is required");
  return callGateway("GET", "getUserDetail", { params: {  user_id: Number(user_id) } });
}

async function ordsUpdateUserDetails(user_id, fields = {}) {
  if (!user_id) throw new Error("user_id is required");

  const payload = {};
  ["full_name", "mobile_number", "email", "emirates_id"].forEach(k => {
    if (fields[k] != null) payload[k] = fields[k];
  });

  // ORDS route is POST
  return callGatewayJson("POST", "updateUser", {
    params: {  user_id: Number(user_id) },   // or { userid } if your gateway renamed it
    data: payload,
  });
}

function ordsGetBeneficiaries(user_id) {
  if (!user_id) throw new Error("user_id is required");
  // ORDS: GET /beneficiaries?user_id=...
  return callGateway("GET", "beneficiaries", { params: {  user_id: Number(user_id) } });
}

function ordsCreateBeneficiary({ user_id, type, full_name, relationship }) {
  if (!user_id) throw new Error("user_id is required");
  if (!type) throw new Error("type is required");

  const params = { user_id, type };
  if (full_name) params.full_name = full_name;
  if (relationship) params.relationship = relationship;

  // use callGateway, not callGatewayJson
  return callGateway("POST", "beneficiaries", { params });
}

function ordsGetActiveRuns(user_id) {
  if (!user_id) throw new Error("user_id is required");
  return callGateway("GET", "procedures", { params: {  user_id: Number(user_id) } });
}

// Current step for a specific procedure instance
function ordsGetCurrentStep(procInstanceId) {
  if (!procInstanceId) throw new Error("procInstanceId is required");
  // ORDS expects ?id=...
  return callGateway("GET", "procedure-instances/current-step", {
    params: { id: Number(procInstanceId) },
  });
}

function ordsEnsureRun({ user_id, procedure_id, service_id, order_ref, beneficiary_id }) {
  if (!user_id) throw new Error("user_id is required");

  const params = { user_id: Number(user_id) };
  if (procedure_id != null) params.procedure_id = Number(procedure_id);
  if (service_id != null) params.service_id = Number(service_id);
  if (beneficiary_id != null) params.beneficiary_id = Number(beneficiary_id);
  if (order_ref) params.order_ref = String(order_ref);

  // ORDS handler is PL/SQL with IN params via URI
  return callGateway("POST", "procedures", { params });
}


module.exports = {
  callGateway,
  forwardToOrds,
  ordsGetActiveRuns,
  ordsEnsureRun,
  ordsGetCurrentStep,
  ordsGetUserAvatar,
  ordsGetBeneficiaries,
  ordsCreateBeneficiary,
  ordsUploadUserAvatar,
  ordsGetUserDetails,
  ordsUpdateUserDetails,
  getPaymentResult,
  initPayment,
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
  ordsGetServices,
  ordsGetUserDocs,
  ordsGetDocumentTypes,
  uploadDocuments,
  ordsGetProcedures,
  ordsGetDepartments,
};
