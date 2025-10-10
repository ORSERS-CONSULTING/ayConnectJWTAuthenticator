const axios = require('axios');
const { getIdcsToken } = require('./idcsServices');
function peek(s, n = 200) {
  return s && s.length > n ? s.slice(0, n) + "…(truncated)" : s || "";
}
function mask(s) {
  return s && s.length > 24 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s || "";
}

async function callGateway(method, path, { params, data } = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  console.log(url)
  const token = await getIdcsToken(url);
  const res = await axios({ url, method, params, data, headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}
async function forwardToOrds(rawBodyBuffer, stripeSignature) {
  const url = `${process.env.GATEWAY_BASE_URL}/webhook`;
  console.log(url);
  const token = await getIdcsToken(url);

  return axios.post(url, rawBodyBuffer, {
    headers: {
      "Content-Type": "application/json",     // keep JSON
      "Stripe-Signature": stripeSignature,    // forward unchanged
      Authorization: `Bearer ${token}`,       // satisfy API Gateway
    },
    transformRequest: [(d) => d],             // DO NOT touch raw body
    maxBodyLength: Infinity,
    timeout: 15000,
    validateStatus: () => true,
  });
}

// async function callStripeWebhook() {
//   const url = `${process.env.GATEWAY_BASE_URL}/webhook`;
//   console.log(url)
//   const token = await getIdcsToken(url);  
//   const res = await axios.post(
//     url,              // ✅ first argument: URL
//     {},               // ✅ second: body (empty object — Stripe will send real payload later)
//     {                 // ✅ third: config
//       headers: {
//         Authorization: `Bearer ${token}`,
//       },
//       timeout: 15000,
//     }
//   );

//   console.log('Webhook called:', res.status);
//   return res;
// }

async function callGatewayUpload(path, data = {}, extraHeaders = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  console.log(url);
  const token = await getIdcsToken(url);

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };

  const b64Len = typeof data.file_base64 === 'string' ? data.file_base64.length : 0;
  console.log('[UPLOAD ->]', 'POST', url, { keys: Object.keys(data), b64Len });

  const res = await axios({
    method: 'POST',
    url,
    data,
    headers,
    maxBodyLength: 50 * 1024 * 1024,
    maxContentLength: 50 * 1024 * 1024,
    validateStatus: () => true,           // we handle all statuses
    responseType: 'text',                 // keep raw string (empty possible)
    transformResponse: [(x) => x],        // do not auto-parse JSON
  });

  // res.data may be "" (empty string). Avoid Object.keys on a string.
  const preview =
    typeof res.data === 'string'
      ? (res.data.length ? `${res.data.slice(0, 120)}…` : '<empty>')
      : '<non-string>';
  console.log('[UPLOAD <-]', res.status, 'body:', preview);

  return res; // keep full axios response (status, headers, data)
}

async function callGatewayJson(method, path, { params, data } = {}) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);

  const res = await axios({
    method: 'POST',
    url,
    params,
    data,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    validateStatus: () => true,     // we’ll handle non-2xx ourselves
    responseType: "text",           // keep raw (could be "", JSON, or JSON string)
    transformResponse: [(x) => x],  // do not auto-parse
  });

  // Try to parse JSON if possible; otherwise keep as text
  let parsed;
  try {
    parsed = res.data ? JSON.parse(res.data) : {};
  } catch {
    parsed = { __raw: res.data }; // non-JSON response
  }

  return { status: res.status, headers: res.headers, data: parsed, raw: res.data };
}

function sendMobileOtp(mobile_number) { return callGateway('POST', 'send-mobile-otp', { params: { mobile_number } }); }
function verifyMobileOtp(mobile, otp) { return callGateway('POST', 'verify-mobile-otp', { params: { mobile_number: mobile, otp_code: otp } }); }
function sendEmailOtp(email) { return callGateway('POST', 'send-email-otp', { params: { email } }); }
function verifyEmailOtp(email, otp) { return callGateway('POST', 'verify-email-otp', { params: { email, otp_code: otp } }); }
function ordsLogin({ email, mobile_number }) {
  const params = {};
  if (email) params.email = email;
  if (mobile_number) params.mobile_number = mobile_number;
  // only the present one will be sent as a query param
  return callGateway('POST', 'login', { params });
}
function registerClient({ client_code }) { return callGateway('POST', 'register-client', { params: { client_code } }) }
function checkClientCode({ client_code }) { return callGateway('POST', 'check-client-code', { params: { client_code } }) }
function registerExistingClient({ client_code }) { return callGateway('POST', 'register-existing-client', { paramS: { client_code } }) }
function registerUser({ email, mobile_number, full_name }) {
  if (!email || !mobile_number || !full_name) {
    throw new Error('Please fill all the fileds');
  }

  return callGateway('POST', 'register', { params });
}
function resendClientCode({ email }) {
  if (!email) {
    throw new Error('Please fill all the fileds');
  }

  return callGateway('POST', 'resend-Walking-Code', { params: { email } })
}
function getClientEmail({ client_code }) {
  if (!client_code) {
    throw new Error('client_code is required');
  }
  return callGateway('POST', 'getExistedClientEmail', { params: { client_code } });
}
function ordsGetServices() {
  return callGateway('GET', 'getServices')
}
function ordsGetDepartments() {
  return callGateway('GET', 'getDepartments')
}
function ordsGetProcedures() {
  return callGateway('GET', 'getProcedures')
}
function ordsGetUserDocs(user_id) {
  return callGateway('GET', 'show-user-documents', { params: { user_id } }); // adjust path/name to your ORDS
}
function ordsGetDocumentTypes() {
  // no params needed; still goes through callGateway which adds the IDCS token
  return callGateway('GET', 'document-types');
}


function uploadDocuments(docPayload) {
  // ensure pure base64 (no data: prefix)
  if (typeof docPayload.file_base64 === 'string' && docPayload.file_base64.startsWith('data:')) {
    docPayload = { ...docPayload, file_base64: docPayload.file_base64.split(',')[1] || docPayload.file_base64 };
  }

  // TODO: confirm correct upstream path
  return callGatewayUpload('upload-documents', docPayload); // <-- set the RIGHT path
}


async function initPayment(payPayload, ctx = {}) {
  const body = {
    amount: Number(payPayload.amount),
    currency: payPayload.currency,
    description: payPayload.description ?? `Service ${payPayload.serviceCode ?? ''}`,
    context: {
      user_id: ctx.user_id ?? ctx.userId ?? 0,
      service_id: ctx.service_id ?? ctx.serviceId ?? 0,
      procedure_id: ctx.procedure_id ?? ctx.procedureId ?? null,
      request_id: ctx.request_id ?? ctx.requestId ?? null,
      email: ctx.email ?? "test.user@example.com",
      name: ctx.name ?? "Test User",
    },
  };

  console.log("[initPayment] ->", {
    ...body,
    // safer log:
    amount: body.amount,
    currency: body.currency,
    description: body.description,
    context: { ...body.context, email: mask(body.context.email) },
  });

  // Optional: support idempotency per request_id
  const idempotency = body.context.request_id ? String(body.context.request_id) : undefined;
  const headers = idempotency ? { 'Idempotency-Key': idempotency } : undefined;

  const res = await callGatewayJson('POST', 'pay', { data: body, headers });
  const { status, data } = res;

  if (status < 200 || status >= 300) {
    throw new Error(
      data?.error || data?.message || `Payment initialization failed (status ${status})`
    );
  }

  // unwrap { response_body: "<json string>" }
  let parsed = data;
  if (typeof data?.response_body === "string") {
    try {
      parsed = JSON.parse(data.response_body);
      console.log("[initPayment] Unwrapped response_body");
    } catch {
      throw new Error("response_body was not valid JSON");
    }
  }

  const clientSecret = parsed.paymentIntent ?? parsed.client_secret ?? parsed.clientSecret;
  const customerId   = parsed.customer      ?? parsed.customer_id   ?? parsed.customerId;
  const ephemeralKey = parsed.ephemeralKey  ?? parsed.ephemeral_key;
  const requestId    = parsed.requestId     ?? parsed.request_id    ?? body.context.request_id ?? null;

  if (!clientSecret || !customerId || !ephemeralKey) {
    throw new Error(`Malformed payment response. Keys: ${Object.keys(parsed || {}).join(", ")}`);
  }

  console.log("[initPayment] <-", {
    clientSecret: mask(clientSecret),
    customerId,
    ephemeralKey: mask(ephemeralKey),
    requestId,
  });

  return { clientSecret, customerId, ephemeralKey, requestId };
}
 

module.exports = { callGateway, forwardToOrds, initPayment, resendClientCode, getClientEmail, sendMobileOtp, verifyMobileOtp, sendEmailOtp, verifyEmailOtp, ordsLogin, registerClient, checkClientCode, registerUser, registerExistingClient, ordsGetServices, ordsGetUserDocs, ordsGetDocumentTypes, uploadDocuments, ordsGetProcedures, ordsGetDepartments };
