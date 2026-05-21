// In the next step we’ll wire these to API Gateway/ORDS via services/ords.service.js

const {
  ordsGetServices,
  ordsGetUserDocs,
  ordsGetBeneficiaries,
  ordsCreateBeneficiary,
  ordsGetDocumentTypes,
  uploadDocuments,
  ordsGetDepartments,
  ordsGetUserAvatar,
  ordsUploadUserAvatar,
  ordsGetUserDetails,
  ordsUpdateUserDetails,
  ordsInitiateService,
  ordsGetServiceStatus,
  ordsRegisterPushToken,
  ordsGetNotifications,
  ordsUpdateBeneficiary,
  ordsDownloadUserDoc,
  ordsMedia,
  ordsGetRequests,
  ordsMarkNotificationRead,
  ordsClearPushToken,
  ordsDownloadInvoicePdf,
  ordsGetInvoices,
  ordsGetParkingInfo,
} = require("../services/ayconnectServices");

async function updateBeneficiary(req, res) {
  try {
    const user_id = String(req.user?.id || "");

    const b = req.body || req.query || {};

    const beneficiary_id = Number(b.beneficiary_id);

    if (!user_id) return res.status(401).json({ message: "No user in token" });

    if (!beneficiary_id) {
      return res.status(400).json({ message: "beneficiary_id is required" });
    }

    const updateBody = {};
    if (b.full_name != null) updateBody.full_name = b.full_name;
    if (b.relationship != null) updateBody.relationship = b.relationship;

    const data = await ordsUpdateBeneficiary(
      { beneficiary_id, user_id },
      updateBody,
    );

    return res.status(200).json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

// GET /ayconnect/docs/download?doc_id=...
// GET /ayconnect/downloadUserDoc?doc_id=...
async function downloadUserDoc(req, res) {
  try {

    const user_id = String(req.user?.id || "");
    const doc_id = Number(req.query?.doc_id);

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!doc_id) {
      return res.status(400).json({ message: "doc_id is required" });
    }

    // 🔹 Call ORDS (returns stream)
    const upstream = await ordsDownloadUserDoc({ doc_id, user_id });

    if (upstream.status >= 400) {
      return res.status(upstream.status).json({
        message: "Failed to download document",
      });
    }

    // 🔹 Forward headers
    res.setHeader(
      "Content-Type",
      upstream.headers["content-type"] || "application/octet-stream",
    );

    if (upstream.headers["content-length"]) {
      res.setHeader("Content-Length", upstream.headers["content-length"]);
    }

    res.setHeader(
      "Content-Disposition",
      upstream.headers["content-disposition"] || "inline",
    );

    // 🔥 STREAM
    upstream.data.pipe(res);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json({ message: e.message });
  }
}

// GET /ayconnect/requests
// Optional: ?instance_svc_id=...
async function getRequests(req, res) {
  try {

    const user_id = String(req.user?.id || "");
    const q = req.query || req.body || {};

    let instance_svc_id = null;
    if (q.instance_svc_id != null) {
      instance_svc_id = Number(q.instance_svc_id);
    }


    const start = Date.now();

    const data = await ordsGetRequests({
      user_id,
      instance_svc_id,
    });
    // 🔥 log size
    const size = JSON.stringify(data).length;

    return res.status(200).json(data);
  } catch (e) {
    console.error("❌ ERROR:", e.response?.status, e.message);

    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

// GET /ayconnect/media?path=...
async function media(req, res) {
  try {
    const path = String(req.query?.path || "");
    if (!path) {
      return res.status(400).json({ message: "path is required" });
    }

    const upstream = await ordsMedia({ path });

    if (upstream.status >= 400) {
      return res.status(upstream.status).end();
    }

    // 🔹 Forward headers
    const headers = upstream.headers || {};

    if (headers["content-type"]) {
      res.setHeader("Content-Type", headers["content-type"]);
    }

    if (headers["content-length"]) {
      res.setHeader("Content-Length", headers["content-length"]);
    }

    res.setHeader(
      "Content-Disposition",
      headers["content-disposition"] || "inline",
    );

    // 🔹 STREAM, DO NOT JSON
    upstream.data.pipe(res);
  } catch (e) {
    const code = e.response?.status ?? 500;
    res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function markNotificationRead(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const b = req.body || req.query || {};

    const notif_id = b.notif_id != null ? String(b.notif_id) : null;

    if (!user_id) {
      return res.status(401).json({ message: "No user in token" });
    }

    let data;

    if (notif_id) {
      // ✅ mark single notification
      data = await ordsMarkNotificationRead({ user_id, notif_id });
    } else {
      // ✅ mark ALL notifications
      data = await ordsMarkNotificationRead({ user_id });
      // OR (better if you split it):
      // data = await ordsMarkAllNotificationsRead({ user_id });
    }

    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch { }
    }

    return res.status(200).json({
      success: true,
      mode: notif_id ? "single" : "all",
      result: parsed,
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getServices(req, res) {
  try {
    // 🔹 same pattern as markNotificationRead
    const user_id = String(req.user?.id || "");
    const b = req.query || req.body || {};


    // 🔹 pass it (even if empty)
    const data = await ordsGetServices(user_id);

    // 🔹 parse response if needed (same pattern you used)
    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch { }
    }

    return res.status(200).json({
      success: true,
      user_id: user_id || null,
      result: parsed,
    });

  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getDocumentTypes(_req, res) {
  try {
    const data = await ordsGetDocumentTypes();
    // ORDS might already send { items: [...] }. If it sends plain array, normalize it.
    const items = Array.isArray(data) ? data : (data.items ?? data);
    return res.json({ items });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getDepartments(_req, res) {
  try {
    const data = await ordsGetDepartments();
    // ORDS might already send { items: [...] }. If it sends plain array, normalize it.
    const items = Array.isArray(data) ? data : (data.items ?? data);
    return res.json({ items });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getUserDocs(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    if (!user_id) return res.status(401).json({ message: "No user in token" });

    const data = await ordsGetUserDocs(user_id);
    return res.json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function uploadUserDocuments(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const b = req.body || {};
    const body = {
      user_id: user_id,
      beneficiary_id: Number(b.beneficiary_id), // ✅ REQUIRED
      document_id: Number(b.document_id),
      file_name: b.file_name,
      file_type: b.file_type,
      file_base64: b.file_base64,
      uploaded_by: b.uploaded_by,
      original_file_name: b.original_file_name,
      document_display_name: b.document_display_name,
      expiry_date: b.expiry_date,
    };

    const missing = [
      "user_id",
      "document_id",
      "file_name",
      "file_type",
      "file_base64",
    ].filter((k) => !body[k]);
    if (missing.length) {
      console.warn("[uploadUserDocuments] Missing fields:", missing);
      return res
        .status(400)
        .json({ message: `Missing fields: ${missing.join(", ")}` });
    }

    if (
      typeof body.file_base64 === "string" &&
      body.file_base64.startsWith("data:")
    ) {
      body.file_base64 = body.file_base64.split(",")[1] || body.file_base64;
    }

    const approxBytes = Math.ceil(
      (body.file_base64.replace(/=+$/, "").length * 3) / 4,
    );

    console.info("[uploadUserDocuments] Upload started", {
      user_id: body.user_id,
      document_id: body.document_id,
      file_name: body.file_name,
      file_type: body.file_type,
      approx_size_kb: Math.round(approxBytes / 1024),
      env: process.env.NODE_ENV,
    });

    const resp = await uploadDocuments(body);

    console.info("[uploadUserDocuments] Upload response meta", {
      status: resp?.status,
      headers: Object.keys(resp?.headers || {}),
    });

    const is2xx = resp.status >= 200 && resp.status < 300;
    const raw = resp.data; // string (possibly empty) because responseType:'text'
    let parsed = null;

    // Try to parse JSON if present
    if (typeof raw === "string" && raw.trim().length) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* not JSON */
      }
    }

    // Try to extract ID from Location header if ORDS sent one
    const location = resp.headers?.location || resp.headers?.Location;
    let idFromLocation = null;
    if (typeof location === "string") {
      const m = location.match(/\/(\d+)(?:\?.*)?$/);
      if (m) idFromLocation = Number(m[1]);
    }

    // Success policy: any 2xx = success, but prefer explicit flags/ids if present
    const uploadedExplicit =
      parsed?.uploaded === true ||
      typeof parsed?.id === "number" ||
      typeof parsed?.document_id === "number" ||
      typeof idFromLocation === "number";

    const uploaded = is2xx && (uploadedExplicit || true); // accept empty 2xx as success
    const resolvedId =
      parsed?.id ?? parsed?.document_id ?? idFromLocation ?? null;
    console.info("[uploadUserDocuments] Upload result summary", {
      success: uploaded,
      resolvedId,
      upstreamStatus: resp.status,
    });
    if (!uploaded) {
      console.error("[uploadUserDocuments] Upstream did not confirm upload", {
        status: resp.status,
        headers: resp.headers,
        bodyPreview: typeof raw === "string" ? raw.slice(0, 300) : raw,
      });
      return res.status(resp.status || 200).json({
        uploaded: false,
        message: "Upstream did not confirm upload",
        upstream: {
          status: resp.status,
          headers: resp.headers,
          body: raw ?? "",
        },
      });
    }

    // 201 if created-ish, else 200
    const outStatus = resp.status === 201 ? 201 : is2xx ? 201 : 200;

    return res.status(outStatus).json({
      uploaded: true,
      id: resolvedId,
      upstream: {
        status: resp.status,
        headers: resp.headers,
        body: parsed ?? raw ?? "",
      },
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    console.error("[/uploadUserDocuments] ERROR", {
      status: e.response?.status,
      data: e.response?.data,
      message: e.message,
      stack: e.stack,
    });
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

// --- GET avatar (stream image) ---
async function getUserAvatar(req, res) {
  try {
    const user_id = String(req.user?.id || "");

    if (!user_id) return res.status(401).send("No user");

    const upstream = await ordsGetUserAvatar(user_id);

    if (upstream.status >= 400) {
      // ORDS might return JSON error; just proxy status
      return res.status(upstream.status).json({ message: "Avatar not found" });
    }

    // Forward headers (content-type/length if available)
    const ct = upstream.headers["content-type"] || "image/jpeg";
    res.setHeader("Content-Type", ct);
    if (upstream.headers["content-length"]) {
      res.setHeader("Content-Length", upstream.headers["content-length"]);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");

    // Stream the image
    upstream.data.pipe(res);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json({ message: e.message });
  }
}

async function uploadUserAvatar(req, res) {
  try {
    const user_id = String(req.user?.id || "");

    if (!user_id) return res.status(401).json({ message: "No user in token" });

    const b = req.body || {};

    // 1) multipart
    let file_buffer = req.file?.buffer || null;
    let mime_type = req.file?.mimetype || null;

    // 2) raw binary (from express.raw)
    if (!file_buffer && req.is("image/*")) {
      // express.raw gives Buffer in req.body
      file_buffer = Buffer.isBuffer(req.body) ? req.body : null;
      mime_type = req.headers["content-type"] || mime_type;
    }

    // 3) JSON base64
    if (!file_buffer && typeof b.file_base64 === "string") {
      const base64 = b.file_base64.includes(",")
        ? b.file_base64.split(",")[1]
        : b.file_base64;
      file_buffer = Buffer.from(base64, "base64");
      mime_type = b.mime_type || mime_type;
    }

    if (!file_buffer || !mime_type) {
      return res.status(400).json({
        message:
          "Provide avatar via RAW (Content-Type: image/*), multipart field 'avatar', or JSON {file_base64, mime_type}",
      });
    }
    if (!/^image\//i.test(String(mime_type))) {
      return res.status(415).json({ message: "mime_type must be image/*" });
    }
    if (file_buffer.length > 20 * 1024 * 1024) {
      return res.status(413).json({ message: "Max 20MB allowed" });
    }

    const upstream = await ordsUploadUserAvatar(
      user_id,
      file_buffer,
      mime_type,
    );
    const ok = upstream.status >= 200 && upstream.status < 300;

    let out = upstream.data;
    try {
      out = typeof out === "string" && out ? JSON.parse(out) : out;
    } catch { }
    return res.status(ok ? 200 : upstream.status).json(
      out ?? {
        message: ok ? "Avatar uploaded successfully" : "Upload failed",
      },
    );
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getUserDetails(req, res) {
  try {
    const user_id = String(req.user?.id || "");

    if (!user_id) return res.status(401).json({ message: "No user in token" });

    const data = await ordsGetUserDetails(user_id);
    // ordsGetUserDetails already returns parsed JSON via callGateway
    return res.status(200).json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}


async function updateUserDetails(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    if (!user_id) return res.status(401).json({ message: "No user in token" });

    const body = req.body || {};
    const allowed = ["full_name", "mobile_number", "email", "emirates_id"];
    const payload = {};
    allowed.forEach((k) => {
      if (body[k] != null) payload[k] = body[k];
    });

    if (!Object.keys(payload).length) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const upstream = await ordsUpdateUserDetails(user_id, payload);
    const ok = upstream.status >= 200 && upstream.status < 300;

    // `callGatewayJson` tried to parse JSON; fall back to a default message
    return res.status(ok ? 200 : upstream.status).json(
      upstream.data ?? {
        message: ok ? "User details updated successfully" : "Update failed",
      },
    );
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getBeneficiaries(req, res) {
  try {
    const user_id = String(req.user?.id || "");

    if (!user_id) return res.status(401).json({ message: "No user in token" });

    const data = await ordsGetBeneficiaries(user_id);
    // ORDS may return {items:[...]} or a raw array
    const items = Array.isArray(data) ? data : (data.items ?? data);

    // Optional: sort SELF first, like your SQL does
    const sorted = Array.isArray(items)
      ? [...items].sort((a, b) => (a.type === "SELF" ? -1 : 1))
      : items;

    return res.status(200).json({ items: sorted });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function createBeneficiary(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const q = req.body || req.query || {};
    const type = String(q.type || "").toUpperCase();
    const full_name = q.full_name ?? null;
    const relationship = q.relationship ?? null;

    if (!user_id) return res.status(401).json({ message: "No user in token" });
    if (!type) return res.status(400).json({ message: "type is required" });
    if (type === "DEPENDENT" && !full_name) {
      return res
        .status(400)
        .json({ message: "full_name is required for DEPENDENT" });
    }

    const upstream = await ordsCreateBeneficiary({
      user_id,
      type,
      full_name,
      relationship,
    });

    // upstream = { status, headers, data, raw }
    const status = upstream.status || 200;
    const data = upstream.data ?? {};

    // Normalize a friendly shape for the app
    // Your ORDS OUTs: out_beneficiary_id, out_type, out_full_name, out_relationship, response_message
    const out = {
      beneficiary_id: data.out_beneficiary_id ?? data.beneficiary_id ?? null,
      type: data.out_type ?? type,
      full_name: data.out_full_name ?? full_name ?? null,
      relationship: data.out_relationship ?? relationship ?? null,
      message: data.response_message ?? data.message ?? null,
      upstream: data, // keep everything for debugging if you like
    };

    return res.status(status).json(out);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getInvoices(req, res) {
  const start = Date.now();
  const traceId = `GET-INVOICES-${Date.now()}`;

  try {
    const user_id = String(req.user?.id || "");
    const q = req.query || {};

    if (!user_id) {
      return res.status(401).json({ message: "No user in token" });
    }

    let request_id = null;

    if (q.request_id != null) {
      request_id = Number(q.request_id);

      if (Number.isNaN(request_id)) {
        console.warn(`❌ [${traceId}] Invalid request_id`, { value: q.request_id });
        return res.status(400).json({ message: "invalid request_id" });
      }
    }

    const ordsStart = Date.now();

    const data = await ordsGetInvoices({
      user_id,
      request_id,
    });
    // ---------- Parsing ----------
    let parsed = data;

    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);

      } catch (err) {
        console.error(`❌ [${traceId}] Failed to parse response_body`, {
          raw: data.response_body?.slice(0, 200),
          error: err.message,
        });
        parsed = [];
      }
    }

    const items = Array.isArray(parsed) ? parsed : [];


    return res.status(200).json({ items });

  } catch (e) {
    console.error(`❌ [${traceId}] ERROR`, {
      status: e.response?.status,
      message: e.message,
      data: e.response?.data,
      duration: `${Date.now() - start}ms`,
    });

    const code = e.response?.status ?? 500;

    return res.status(code).json(
      e.response?.data ?? { message: e.message }
    );
  }
}


// POST /ayconnect/initiateService
async function initiateService(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const b = req.body || req.query || {};

    const service_id = b.service_id ?? null;
    const beneficiary_id = b.beneficiary_id ?? null;
    const procedure_id = b.procedure_id ?? null;

    if (!user_id)
      return res
        .status(401)
        .json({ success: false, message: "No user in token" });
    if (!service_id)
      return res
        .status(400)
        .json({ success: false, message: "service_id is required" });
    if (!beneficiary_id)
      return res
        .status(400)
        .json({ success: false, message: "beneficiary_id is required" });

    // 🔹 Call ORDS backend
    const data = await ordsInitiateService(
      service_id,
      user_id,
      beneficiary_id,
      procedure_id,
    );

    // 🔹 Parse ORDS JSON wrapper
    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn("[initiateService] JSON parse failed for response_body");
      }
    }

    // 🔹 SUCCESS → return fields from PL/SQL EXACTLY AS THEY ARE
    if (parsed?.success === true) {
      return res.status(200).json({
        success: true,
        action: parsed.action,
        instance_svc_id: parsed.instance_svc_id,
        request_id: parsed.request_id,
        application_id: parsed.application_id ?? null,
        proc_instance_id: parsed.proc_instance_id ?? null,
        message: "Service initiated successfully",
      });
    }

    // 🔹 FAILED
    return res.status(500).json({
      success: false,
      message: parsed?.error || parsed?.message || "Failed to initiate service",
      upstream: parsed,
    });
  } catch (e) {
    console.error("[initiateService] ERROR", e.message);

    const code = e.response?.status ?? 500;

    return res.status(code).json(
      e.response?.data ?? {
        success: false,
        message: e.message,
      },
    );
  }
}

// GET /ayconnect/getServiceStatus
async function getServiceStatus(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const q = req.query || req.body || {};

    const service_id = q.service_id ?? null;

    if (!user_id) return res.status(401).json({ message: "No user in token" });
    if (!service_id)
      return res.status(400).json({ message: "service_id is required" });

    const data = await ordsGetServiceStatus(user_id, service_id);

    // Normalize ORDS-style response
    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn("[getServiceStatus] Could not parse response_body JSON");
      }
    }

    if (parsed?.error) {
      return res.status(404).json({
        success: false,
        message: parsed.error,
        status: "NOT_FOUND",
      });
    }

    // Expected shape: { user_id, service_id, status }
    return res.status(200).json({
      success: true,
      user_id: parsed.user_id,
      service_id: parsed.service_id,
      status: parsed.status,
      beneficiary_id: parsed.beneficiary_id,
      instance_svc_id: parsed.instance_svc_id,
      request_id: parsed.request_id,
      proc_instance_id: parsed.proc_instance_id,
    });
  } catch (e) {
    console.error("[getServiceStatus] ERROR", e.message);
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function registerPushToken(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const b = req.body || req.query || {};

    const expo_push_token = b.expo_push_token;

    if (!user_id) {
      return res.status(401).json({ message: "No user in token" });
    }
    if (!expo_push_token) {
      return res.status(400).json({ message: "expo_push_token is required" });
    }

    const data = await ordsRegisterPushToken({ user_id, expo_push_token });

    let parsed = data;

    // Unwrap ORDS response_body if present
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn("[registerPushToken] Could not parse response_body JSON");
      }
    }

    if (parsed?.status === "ok") {
      return res.status(200).json({
        success: true,
        message: "Push token registered",
        user_id,
      });
    }

    return res.status(500).json({
      success: false,
      message: parsed?.error || "Failed to register push token",
      upstream: parsed,
    });
  } catch (e) {
    console.error("[registerPushToken] ERROR", e.message);
    const code = e.response?.status ?? 500;
    return res.status(code).json(
      e.response?.data ?? {
        message: e.message,
      },
    );
  }
}

async function getNotifications(req, res) {
  try {
    const user_id = String(req.user?.id || "");

    if (!user_id) {
      return res.status(401).json({ message: "No user in token" });
    }

    const data = await ordsGetNotifications(user_id);

    // ORDS may wrap responses inside { response_body: "<json>" }
    let parsed = data;

    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn("[getNotifications] Could not parse response_body JSON");
      }
    }

    // Ensure consistent output shape
    return res.status(200).json(parsed);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function clearPushToken(req, res) {
  try {
    const token = req.query?.token;

    if (!token) {
      return res.status(400).json({ message: "token query param is required" });
    }

    const data = await ordsClearPushToken({ token });

    // ORDS usually returns 204 No Content
    if (!data || data.status === 204) {
      return res.status(204).send();
    }

    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn("[clearPushToken] Could not parse response_body JSON");
      }
    }

    return res.status(200).json({
      success: true,
      message: "Push token cleared",
      upstream: parsed,
    });
  } catch (e) {
    console.error("[clearPushToken] ERROR", e.message);
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function downloadInvoicePdf(req, res) {
  const start = Date.now();

  try {
    const user_id = String(req.user?.id || "");
    const request_id = Number(req.query?.request_id);

    if (!user_id) {
      console.warn("❌ [API] Missing user_id");
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!request_id) {
      console.warn("❌ [API] Missing request_id");
      return res.status(400).json({ message: "request_id is required" });
    }

    const ordsStart = Date.now();

    const upstream = await ordsDownloadInvoicePdf({
      request_id,
      user_id,
    });

    if (!upstream) {
      console.error("❌ [API] Upstream is null (ORDS failed)");
      return res.status(500).json({
        message: "Failed to fetch invoice from ORDS",
      });
    }

    if (upstream.status >= 400) {
      console.error("❌ [API] ORDS returned error", upstream.status);
      return res.status(upstream.status).json({
        message: "Failed to download invoice",
      });
    }

    // 🔹 Headers
    res.setHeader(
      "Content-Type",
      upstream.headers["content-type"] || "application/pdf",
    );

    if (upstream.headers["content-length"]) {
      res.setHeader("Content-Length", upstream.headers["content-length"]);
    }

    res.setHeader(
      "Content-Disposition",
      upstream.headers["content-disposition"] ||
      'inline; filename="invoice.pdf"',
    );

    upstream.data.on("end", () => {
      console.log("✅ [API] Stream completed in", Date.now() - start, "ms");
    });

    upstream.data.on("error", (err) => {
      console.error("❌ [API] Stream error", err.message);
    });

    upstream.data.pipe(res);
  } catch (e) {
    console.error("❌ [API] downloadInvoicePdf ERROR", {
      message: e.message,
      code: e.code,
    });

    const code = e.response?.status ?? 500;
    return res.status(code).json({ message: e.message });
  }
}
// GET /ayconnect/parking/info?plate_number=...
async function getParkingInfo(req, res) {
  try {
    const plate_number = String(req.query?.plate_number || "");
    const plate_category = String(req.query?.plate_category || "");
    const plate_area_name = String(req.query?.plate_area_name || "");

    if (!plate_number || !plate_category || !plate_area_name) {
      return res.status(400).json({
        message:
          "plate_number, plate_category and plate_area_name are required",
      });
    }

    const data = await ordsGetParkingInfo({
      plate_number,
      plate_category,
      plate_area_name,
    });

    return res.status(200).json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

module.exports = {
  getServices,
  getUserDocs,
  createBeneficiary,
  getBeneficiaries,
  getDocumentTypes,
  uploadUserDocuments,
  getDepartments,
  getUserAvatar,
  uploadUserAvatar,
  getUserDetails,
  updateUserDetails,
  initiateService,
  getServiceStatus,
  registerPushToken,
  getNotifications,
  updateBeneficiary,
  downloadUserDoc,
  getRequests,
  media,
  markNotificationRead,
  clearPushToken,
  downloadInvoicePdf,
  getInvoices,
  getParkingInfo,
};
