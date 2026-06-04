const axios = require("axios");
const { getIdcsToken } = require("./idcsServices");

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


function ordsGetServices(user_id) {
  return callGateway("GET", "getServices", {
    params: { user_id: Number(user_id) },
  });
}

function ordsGetDepartments() {
  return callGateway("GET", "getDepartments");
}

function ordsGetUserDocs(user_id) {
  return callGateway("GET", "showUserDocuments", {
    params: { user_id: Number(user_id) },
  });
}
function ordsGetDocumentTypes() {
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
    responseType: "stream",
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

  return callGateway("GET", "getServiceStatus", { params });
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

async function ordsDownloadInvoicePdf({ request_id, user_id }) {
  try {
    if (!user_id) throw new Error("user_id is required");
    if (!request_id) throw new Error("request_id is required");

    const PATH = "getInvoicePdf";
    const url = `${process.env.GATEWAY_BASE_URL}/${PATH}`;

    const token = await getIdcsToken(url);

    const response = await axios({
      method: "GET",
      url,
      params: {
        request_id: Number(request_id),
        user_id: Number(user_id),
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
      responseType: "stream",
      validateStatus: () => true,
    });

    return response;
  } catch (e) {
    console.error("❌ [ORDS DOWNLOAD ERROR]", {
      message: e.message,
      code: e.code,
      response: e.response?.data,
    });

    return null; // 🔥 critical
  }
}


function ordsGetInvoices({ user_id, request_id }) {
  if (!user_id) throw new Error("user_id is required");

  const params = { user_id: Number(user_id) };

  if (request_id != null) {
    params.request_id = Number(request_id);
  }

  return callGateway("GET", "getInvoices", { params });
}

function ordsGetParkingInfo({ plate_number, plate_category, plate_area_name }) {
  if (!plate_number || !plate_category || !plate_area_name) {
    throw new Error(
      "plate_number, plate_category and plate_area_name are required",
    );
  }

  return callGateway("POST", "getParkingInfo", {
    data: {
      plate_number,
      plate_category,
      plate_area_name,
    },
  });
}
async function ordsGetApplicationDocument({
  request_id,
  user_id,
}) {
  if (!request_id) {
    throw new Error("request_id is required");
  }

  if (!user_id) {
    throw new Error("user_id is required");
  }

  const PATH = "getApplicationDoc";

  const url = `${process.env.GATEWAY_BASE_URL}/${PATH}`;

  const token = await getIdcsToken(url);
  const response = await axios({
    method: "GET",
    url,
    params: {
      request_id: Number(request_id),
      user_id: Number(user_id),
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: "stream",
    validateStatus: () => true,
  });

  return response;
}

function ordsApplicationDocumentExists({ request_id, user_id }) {
  if (!request_id) {
    throw new Error("request_id is required");
  }

  if (!user_id) {
    throw new Error("user_id is required");
  }

  return callGateway("GET", "applicationDocumentExists", {
    params: {
      request_id: Number(request_id),
      user_id: Number(user_id),
    },
  });
}

module.exports = {
  ordsGetUserAvatar,
  ordsGetBeneficiaries,
  ordsCreateBeneficiary,
  ordsUploadUserAvatar,
  ordsGetUserDetails,
  ordsUpdateUserDetails,
  ordsUpdateBeneficiary,
  ordsDownloadUserDoc,
  ordsMedia,
  ordsGetRequests,
  ordsMarkNotificationRead,
  ordsGetServices,
  ordsGetUserDocs,
  ordsGetDocumentTypes,
  uploadDocuments,
  ordsGetDepartments,
  ordsInitiateService,
  ordsGetServiceStatus,
  ordsRegisterPushToken,
  ordsGetNotifications,
  ordsDownloadInvoicePdf,
  ordsGetInvoices,
  ordsGetParkingInfo,
  ordsGetApplicationDocument,
  ordsApplicationDocumentExists
};
