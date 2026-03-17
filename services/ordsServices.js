const axios = require("axios");
const { getIdcsToken } = require("./idcsServices");
const crypto = require("crypto");
const REFRESH_PEPPER = process.env.REFRESH_TOKEN_PEPPER_OCID;
if (!REFRESH_PEPPER) {
  throw new Error("REFRESH_TOKEN_PEPPER_OCID is missing");
}
// function sha256Hex(str) {
//   return crypto.createHash("sha256").update(String(str) + REFRESH_PEPPER).digest("hex");
// }

// ✅ Standard: peppered verifier via HMAC
function refreshDigest(refresh_token) {
  return crypto
    .createHmac("sha256", String(REFRESH_PEPPER))
    .update(String(refresh_token))
    .digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function callGatewayBinary(
  method,
  path,
  rawBuffer,
  contentType,
  { params } = {},
) {
  const url = `${process.env.GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);

  return axios({
    method, // "PUT"
    url,
    params, // { user_id, content_type }
    data: rawBuffer, // -> :body
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
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

function authTokensCreate({ user_id, refresh_token, device_id, days = 30 }) {
  if (!device_id) throw new Error("device_id is required");

  const token_hash = refreshDigest(refresh_token);
  return callGateway("POST", "authTokens/create", {
    params: {
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
    params: {
      token_hash,
      device_id: String(device_id),
    },
  });
}

function authTokensRevoke({ refresh_token, device_id }) {
  if (!device_id) throw new Error("device_id is required");

  const token_hash = refreshDigest(refresh_token);
  return callGateway("POST", "authTokens/revoke", {
    params: {
      token_hash,
      device_id: String(device_id),
    },
  });
}

function sendMobileOtp(mobile_number) {
  return callGateway("POST", "sendMobileOtp", { params: { mobile_number } });
}
function verifyMobileOtp(mobile, otp) {
  return callGateway("POST", "verifyMobileOtp", {
    params: { mobile_number: mobile, otp_code: otp },
  });
}
function sendEmailOtp(email) {
  return callGateway("POST", "sendEmailOtp", { params: { email } });
}
function verifyEmailOtp(email, otp) {
  return callGateway("POST", "verifyEmailOtp", {
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
  return callGateway("POST", "registerClient", { params: { client_code } });
}
function checkClientCode({ client_code }) {
  return callGateway("POST", "checkClientCode", { params: { client_code } });
}
function registerExistingClient({ client_code }) {
  return callGateway("POST", "registerExistingClient", {
    params: { client_code },
  });
}
function registerUser({ email, mobile_number, full_name }) {
  if (!email || !mobile_number || !full_name) {
    throw new Error("Please fill all the fileds");
  }

  return callGateway("POST", "register", {
    params: { email, mobile_number, full_name },
  });
}
function resendClientCode({ email }) {
  if (!email) {
    throw new Error("Please fill all the fileds");
  }

  return callGateway("POST", "resendWalkingCode", { params: { email } });
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
// function ordsGetProcedures() {
//   return callGateway("GET", "getProcedures");
// }
function ordsGetUserDocs(user_id) {
  return callGateway("GET", "showUserDocuments", {
    params: { user_id: Number(user_id) },
  });
}
function ordsGetDocumentTypes() {
  // no params needed; still goes through callGateway which adds the IDCS token
  return callGateway("GET", "documentTypes");
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
  return callGatewayUpload("uploadDocuments", docPayload); // <-- set the RIGHT path
}

async function ordsUploadUserAvatar(user_id, fileBuffer, mimeType) {
  const PATH = "uploadAvatar";
  return callGatewayBinary("PUT", PATH, fileBuffer, mimeType, {
    params: { user_id: Number(user_id), content_type: mimeType },
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
    params: { user_id: Number(user_id) }, // matches :user_id
    headers: { Authorization: `Bearer ${token}` },
    responseType: "stream", // or "arraybuffer" if you prefer
    validateStatus: () => true,
  });
}

function ordsGetUserDetails(user_id) {
  if (!user_id) throw new Error("user_id is required");
  return callGateway("GET", "getUserDetail", {
    params: { user_id: Number(user_id) },
  });
}

async function ordsUpdateUserDetails(user_id, fields = {}) {
  if (!user_id) throw new Error("user_id is required");

  const payload = {};
  ["full_name", "mobile_number", "email", "emirates_id"].forEach((k) => {
    if (fields[k] != null) payload[k] = fields[k];
  });

  // ORDS route is POST
  return callGatewayJson("POST", "updateUser", {
    params: { user_id: Number(user_id) }, // or { userid } if your gateway renamed it
    data: payload,
  });
}

function ordsGetBeneficiaries(user_id) {
  if (!user_id) throw new Error("user_id is required");
  // ORDS: GET /beneficiaries?user_id=...
  return callGateway("GET", "beneficiaries", {
    params: { user_id: Number(user_id) },
  });
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
function ordsUpdateBeneficiary({ beneficiary_id, user_id }, body = {}) {
  if (!user_id) throw new Error("user_id is required");
  if (!beneficiary_id) throw new Error("beneficiary_id is required");

  const params = { beneficiary_id, user_id };

  // 🔥 IMPORTANT: send update fields as BODY
  return callGateway("PUT", "beneficiaries", {
    params,
    data: body,
  });
}

async function ordsDownloadUserDoc({ doc_id, user_id }) {
  if (!user_id) throw new Error("user_id is required");
  if (!doc_id) throw new Error("doc_id is required");

  const PATH = "downloadUserDoc";
  const url = `${process.env.GATEWAY_BASE_URL}/${PATH}`;
  const token = await getIdcsToken(url);

  return axios({
    method: "GET",
    url,
    params: {
      doc_id: Number(doc_id),
      user_id: Number(user_id),
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: "stream", // ✅ CRITICAL
    validateStatus: () => true, // let caller decide
  });
}

function ordsGetRequests({ instance_svc_id, user_id }) {
  if (!user_id) throw new Error("user_id is required");

  const params = { user_id };

  // ✅ only include instance_svc_id if provided
  if (instance_svc_id != null) {
    params.instance_svc_id = instance_svc_id;
  }

  return callGateway("GET", "getRequests", { params });
}

async function ordsMedia({ path }) {
  if (!path) throw new Error("path is required");

  const url = `${process.env.GATEWAY_BASE_URL}/media`;
  const token = await getIdcsToken(url);

  return axios({
    method: "GET",
    url,
    params: { path },
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: "stream", // 🔥 IMPORTANT
    validateStatus: () => true,
  });
}

function ordsMarkNotificationRead({ user_id, notif_id }) {
  if (!user_id) throw new Error("user_id is required");

  const params = { user_id };

  // ✅ only include notif_id if provided
  if (notif_id != null) {
    params.notif_id = notif_id;
  }

  return callGateway("POST", "markNotificationRead", { params });
}

// function ordsGetActiveRuns(user_id) {
//   if (!user_id) throw new Error("user_id is required");
//   return callGateway("GET", "procedures", {
//     params: { user_id: Number(user_id) },
//   });
// }

// Current step for a specific procedure instance
// function ordsGetCurrentStep(procInstanceId) {
//   if (!procInstanceId) throw new Error("procInstanceId is required");
//   // ORDS expects ?id=...
//   return callGateway("GET", "procedureInstancesCurrentStep", {
//     params: { id: Number(procInstanceId) },
//   });
// }

// function ordsEnsureRun({
//   user_id,
//   procedure_id,
//   service_id,
//   order_ref,
//   beneficiary_id,
// }) {
//   if (!user_id) throw new Error("user_id is required");

//   const params = { user_id: Number(user_id) };
//   if (procedure_id != null) params.procedure_id = Number(procedure_id);
//   if (service_id != null) params.service_id = Number(service_id);
//   if (beneficiary_id != null) params.beneficiary_id = Number(beneficiary_id);
//   if (order_ref) params.order_ref = String(order_ref);

//   // ORDS handler is PL/SQL with IN params via URI
//   // return callGateway("POST", "procedures", { params });
// }
function ordsInitiateService(
  service_id,
  user_id,
  beneficiary_id,
  procedure_id = null,
) {
  if (!service_id || !user_id || !beneficiary_id)
    throw new Error("service_id, user_id, and beneficiary_id are required");

  const params = {
    p_service_id: Number(service_id),
    p_user_id: Number(user_id),
    p_beneficiary_id: Number(beneficiary_id),
  };

  // Optional procedure_id
  if (procedure_id) params.p_procedure_id = Number(procedure_id);

  return callGateway("POST", "initiateService", { params });
}

function ordsGetServiceStatus(user_id, service_id) {
  if (!user_id || !service_id)
    throw new Error("user_id and service_id are required");

  const params = {
    p_user_id: Number(user_id),
    p_service_id: Number(service_id),
  };

  // ORDS endpoint: getServiceStatus?p_user_id=...&p_service_id=...
  return callGateway("GET", "getServiceStatus", { params });
}

function ordsProcessPayment(request_id) {
  if (!request_id) throw new Error("request_id is required");

  return callGateway("POST", "processPayment", {
    params: { request_id: Number(request_id) },
  });
}
function ordsRegisterPushToken({ user_id, expo_push_token }) {
  if (!user_id) throw new Error("user_id is required");
  if (!expo_push_token) throw new Error("expo_push_token is required");

  return callGateway("POST", "registerPushToken", {
    params: {
      user_id: Number(user_id),
      expo_push_token: String(expo_push_token),
    },
  });
}
function ordsGetNotifications(user_id) {
  if (!user_id) throw new Error("user_id is required");

  return callGateway("GET", "getNotifications", {
    params: { user_id: Number(user_id) },
  });
}

async function ordsInitPayment({
  user_id,
  payment_type,
  reference_id,
  amount,
}) {
  if (!user_id || !payment_type || !reference_id || !amount) {
    throw new Error("Missing required payment fields");
  }

  return callGateway("POST", "initiatePayment", {
    params: {
      user_id: Number(user_id),
      payment_type,
      reference_id: String(reference_id),
      amount: Number(amount),
    },
  });
}

async function ordsUpdatePaymentSession({
  payment_id,
  mpgs_order_id,
  mpgs_session_id,
}) {
  if (!payment_id || !mpgs_order_id || !mpgs_session_id) {
    throw new Error("Missing MPGS session fields");
  }

  return callGateway("POST", "updatePaymentSession", {
    params: {
      payment_id: Number(payment_id),
      mpgs_order_id,
      mpgs_session_id,
    },
  });
}

async function ordsDownloadInvoicePdf({ request_id, user_id }) {
  if (!user_id) throw new Error("user_id is required");
  if (!request_id) throw new Error("request_id is required");

  const PATH = "getInvoicePdf";
  const url = `${process.env.GATEWAY_BASE_URL}/${PATH}`;
  const token = await getIdcsToken(url);

  return axios({
    method: "GET",
    url,
    params: {
      request_id: Number(request_id),
      user_id: Number(user_id),
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: "stream", // ✅ REQUIRED for PDF
    validateStatus: () => true, // caller handles status
  });
}

async function ordsUpdatePaymentStatus({
  payment_id,
  status,
  mpgs_transaction_id,
  result_reason,
}) {
  if (!payment_id || !status) {
    throw new Error("payment_id and status are required");
  }

  return callGateway("POST", "updatePaymentStatus", {
    params: {
      payment_id: Number(payment_id),
      status,
      mpgs_transaction_id,
      result_reason,
    },
  });
}

async function ordsGetPayment(payment_id) {
  if (!payment_id) throw new Error("payment_id is required");

  const res = await callGateway("GET", "getPaymentStatus", {
    params: { payment_id: Number(payment_id) },
  });
  return res?.items?.[0] || null;
}
function ordsGetInvoices({ user_id, request_id }) {
  if (!user_id) throw new Error("user_id is required");

  const params = { user_id: Number(user_id) };

  if (request_id != null) {
    params.request_id = Number(request_id);
  }

  return callGateway("GET", "getInvoices", { params });
}

function ordsClearPushToken({ token }) {
  if (!token) throw new Error("token is required");
  return callGateway("POST", "deletePushToken", {
    params: {
      token: String(token),
    },
  });
}
function ordsGetParkingInfo({ plate_number }) {
  if (!plate_number) throw new Error("plate_number is required");

  return callGateway("GET", "getParkingInfo", {
    params: { plate_number },
  });
}
function ordsInitiateParkingPayment({ entry_guid, amount }) {
  if (!entry_guid || amount == null) {
    throw new Error("entry_guid and amount are required");
  }

  return callGateway("POST", "initiateParkingPayment", {
    params: {
      entry_guid,
      amount: Number(amount),
    },
  });
}
function ordsUpdateParkingSession({
  payment_id,
  mpgs_order_id,
  mpgs_session_id,
}) {
  if (!payment_id) throw new Error("payment_id is required");

  return callGateway("POST", "updateParkingSession", {
    params: {
      payment_id: Number(payment_id),
      mpgs_order_id,
      mpgs_session_id,
    },
  });
}
function ordsUpdateParkingStatus({
  payment_id,
  payment_status,
  amount_paid,
  mpgs_txn_id,
  deadline_to_leave,
}) {
  if (!payment_id || !payment_status) {
    throw new Error("payment_id and payment_status are required");
  }

  return callGateway("POST", "updateParkingStatus", {
    params: {
      payment_id: Number(payment_id),
      payment_status,
      amount_paid: amount_paid != null ? Number(amount_paid) : null,
      mpgs_txn_id: mpgs_txn_id || null,
      deadline_to_leave: deadline_to_leave || null,
    },
  });
}
async function ordsGetParkingPayment(payment_id) {
  if (!payment_id) throw new Error("payment_id is required");

  const res = await callGateway("GET", "getParkingPaymentStatus", {
    params: { payment_id: Number(payment_id) },
  });

  return res?.items?.[0] || null;
}
module.exports = {
  callGateway,
  // ordsGetActiveRuns,
  // ordsEnsureRun,
  // ordsGetCurrentStep,
  ordsGetUserAvatar,
  ordsGetBeneficiaries,
  ordsCreateBeneficiary,
  ordsUploadUserAvatar,
  ordsGetUserDetails,
  ordsUpdateUserDetails,
  ordsUpdateBeneficiary,
  ordsDownloadUserDoc,
  ordsMedia,
  authTokensCreate,
  authTokensValidate,
  authTokensRevoke,
  ordsGetRequests,
  ordsMarkNotificationRead,
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
  ordsGetDepartments,
  ordsInitiateService,
  ordsGetServiceStatus,
  ordsRegisterPushToken,
  ordsGetNotifications,
  ordsInitPayment,
  ordsUpdatePaymentSession,
  ordsUpdatePaymentStatus,
  ordsGetPayment,
  ordsClearPushToken,
  ordsDownloadInvoicePdf,
  ordsGetInvoices,
  ordsGetParkingInfo,
  ordsInitiateParkingPayment,
  ordsUpdateParkingSession,
  ordsUpdateParkingStatus,
  ordsGetParkingPayment,
};
