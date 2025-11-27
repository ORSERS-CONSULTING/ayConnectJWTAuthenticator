// In the next step we’ll wire these to API Gateway/ORDS via services/ords.service.js

const {
  ordsGetServices,
  ordsGetUserDocs,
  ordsEnsureRun,
  ordsGetActiveRuns,
  ordsGetCurrentStep,
  ordsGetBeneficiaries,
  ordsCreateBeneficiary,
  ordsGetDocumentTypes,
  uploadDocuments,
  ordsGetProcedures,
  ordsGetDepartments,
  ordsGetUserAvatar,
  ordsUploadUserAvatar,
  ordsGetUserDetails,
  ordsUpdateUserDetails,
  ordsInitiateService,
  ordsGetServiceStatus,
} = require("../services/ordsServices");

async function getServices(_req, res) {
  try {
    const data = await ordsGetServices();
    return res.json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getDocumentTypes(_req, res) {
  try {
    const data = await ordsGetDocumentTypes();
    // ORDS might already send { items: [...] }. If it sends plain array, normalize it.
    const items = Array.isArray(data) ? data : data.items ?? data;
    return res.json({ items });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getProcedures(_req, res) {
  try {
    const data = await ordsGetProcedures();
    // ORDS might already send { items: [...] }. If it sends plain array, normalize it.
    const items = Array.isArray(data) ? data : data.items ?? data;
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
    const items = Array.isArray(data) ? data : data.items ?? data;
    return res.json({ items });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getUserDocs(req, res) {
  try {
    const userId = String(req.user?.id || req.user?.sub || "");
    if (!userId) return res.status(401).json({ message: "No user in token" });

    const data = await ordsGetUserDocs(userId);
    return res.json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function uploadUserDocuments(req, res) {
  try {
    const userFromToken = String(req.user?.id || req.user?.sub || "");
    const b = req.body || {};

    const body = {
      user_id: b.user_id ?? userFromToken,
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
      (body.file_base64.replace(/=+$/, "").length * 3) / 4
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
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const user_id = String(req.query?.user_id || fromToken);
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
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const user_id = String(req.query?.user_id || fromToken);
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
      mime_type
    );
    const ok = upstream.status >= 200 && upstream.status < 300;

    let out = upstream.data;
    try {
      out = typeof out === "string" && out ? JSON.parse(out) : out;
    } catch {}
    return res.status(ok ? 200 : upstream.status).json(
      out ?? {
        message: ok ? "Avatar uploaded successfully" : "Upload failed",
      }
    );
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getUserDetails(req, res) {
  try {
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const user_id = String(req.query?.user_id || fromToken);
    if (!user_id) return res.status(401).json({ message: "No user in token" });

    const data = await ordsGetUserDetails(user_id);
    // ordsGetUserDetails already returns parsed JSON via callGateway
    return res.status(200).json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

/**
 * POST /ayconnect/user/details?user_id=...
 * Accepts JSON: { full_name, mobile_number, email, emirates_id }
 */
async function updateUserDetails(req, res) {
  try {
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const user_id = String(req.query?.user_id || fromToken);
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
      }
    );
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getBeneficiaries(req, res) {
  try {
    // prefer the authenticated user; fall back to explicit query param for admin/testing
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const user_id = String(req.query?.user_id || fromToken);
    if (!user_id) return res.status(401).json({ message: "No user in token" });

    const data = await ordsGetBeneficiaries(user_id);
    // ORDS may return {items:[...]} or a raw array
    const items = Array.isArray(data) ? data : data.items ?? data;

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
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const q = req.body || req.query || {}; // support JSON body or query
    const user_id = String(q.user_id || fromToken);
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

async function getCurrentStep(req, res) {
  try {
    // accept either ?id=... or ?proc_instance_id=...
    const procInstanceId =
      req.query?.id || req.query?.proc_instance_id || req.query?.procInstanceId;

    if (!procInstanceId) {
      return res
        .status(400)
        .json({ message: "id (proc_instance_id) is required" });
    }

    const data = await ordsGetCurrentStep(procInstanceId);

    // ORDS returns { items: [ row ] }
    const row = Array.isArray(data) ? data[0] : data.items?.[0] ?? data;
    if (!row)
      return res
        .status(404)
        .json({ message: "No current step (maybe all done)" });

    return res.status(200).json({
      instance_svc_id: row.instance_svc_id ?? row.id ?? null,
      proc_instance_id: row.proc_instance_id ?? Number(procInstanceId),
      service_id: row.service_id ?? null,
      order_index: row.order_index ?? null,
      status: row.status ?? null,
      beneficiary_id: row.beneficiary_id ?? null,
      beneficiary_name: row.beneficiary_name ?? null,
      docs_status: row.docs_status ?? null,
      fee_amount: row.fee_amount ?? null,
      paid_amount: row.paid_amount ?? null,
      updated_at: row.updated_at ?? null,
      is_completed: row.is_completed ?? null,
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

// GET /ayconnect/runs/active?user_id=...
async function getActiveRuns(req, res) {
  try {
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const user_id = String(req.query?.user_id || fromToken);

    if (!user_id) {
      return res.status(401).json({ message: "No user in token" });
    }

    console.log("[active-runs] user_id=", user_id);

    const data = await ordsGetActiveRuns(user_id);

    // ORDS may return { items: [...] } or an array
    const items = Array.isArray(data) ? data : data?.items ?? [];
    console.log("[active-runs] raw items length from ORDS:", items.length);

    // Map to a clean, consistent shape that matches the mobile type expectations:
    // - ensure top-level `id`
    // - pass through `service_id`/`procedure_id`
    // - prefer `progress_pct` if present
    const normalized = items.map((x) => ({
      run_type: x.run_type, // "PROCEDURE" | "SERVICE"
      id: x.id ?? x.proc_instance_id ?? null, // <— ensure id
      procedure_id: x.procedure_id ?? null,
      service_id: x.service_id ?? null,
      status: x.status ?? null,
      started_at: x.started_at ?? null,
      updated_at: x.updated_at ?? null,
      progress: Number(x.progress_pct ?? x.progress ?? 0), // 0..100 (procedure rows may have it)
      beneficiary_id: x.beneficiary_id ?? null,
      beneficiary_name: x.beneficiary_name ?? null,
      label: x.display_name ?? x.name ?? null,
    }));

    // quick visibility log (first few)
    console.log(
      "[active-runs] normalized sample:",
      normalized.slice(0, 3).map((r) => ({
        run_type: r.run_type,
        id: r.id,
        service_id: r.service_id,
        status: r.status,
      }))
    );

    return res.status(200).json({ items: normalized });
  } catch (e) {
    const code = e?.response?.status ?? 500;
    const body = e?.response?.data ?? { message: e.message };
    console.error("[active-runs] ERROR", code, body);
    return res.status(code).json(body);
  }
}

async function ensureRun(req, res) {
  try {
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const b = req.body || req.query || {};

    const user_id = b.user_id ?? fromToken;
    const procedure_id = b.procedure_id ?? null;
    const service_id = b.service_id ?? null;
    const order_ref = b.order_ref ?? null;
    const beneficiary_id = b.beneficiary_id ?? null;

    if (!user_id) return res.status(401).json({ message: "No user in token" });

    // Validation consistent with your PL/SQL
    if (procedure_id == null) {
      // standalone: need service_id OR order_ref
      if (!service_id && !order_ref) {
        return res.status(400).json({
          message:
            "service_id or order_ref is required for a standalone service",
        });
      }
    } else {
      // procedure: need first-step reference
      if (!service_id && !order_ref) {
        return res.status(400).json({
          message:
            "service_id or order_ref is required for a procedure's first step",
        });
      }
    }

    const data = await ordsEnsureRun({
      user_id,
      procedure_id,
      service_id,
      order_ref,
      beneficiary_id,
    });
    // ORDS PL/SQL OUTs: out_proc_instance_id, out_instance_svc_id, status_code, response_message
    const status = Number(data.status_code ?? 200);

    const out = {
      run_type: data.out_proc_instance_id ? "PROCEDURE" : "SERVICE",
      proc_instance_id: data.out_proc_instance_id ?? null,
      instance_svc_id: data.out_instance_svc_id ?? null,
      message: data.response_message ?? null,
    };

    return res.status(status).json(out);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}
// POST /ayconnect/initiateService
async function initiateService(req, res) {
  try {
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const b = req.body || req.query || {};

    const user_id = b.user_id ?? fromToken;
    const service_id = b.service_id ?? null;
    const beneficiary_id = b.beneficiary_id ?? null;
    const procedure_id = b.procedure_id ?? null;

    if (!user_id) return res.status(401).json({ message: "No user in token" });
    if (!service_id)
      return res.status(400).json({ message: "service_id is required" });
    if (!beneficiary_id)
      return res.status(400).json({ message: "beneficiary_id is required" });

    console.log("[initiateService] Starting →", {
      user_id,
      service_id,
      beneficiary_id,
      procedure_id,
    });

    // 🔹 Call ORDS backend with all required params
    const data = await ordsInitiateService(
      service_id,
      user_id,
      beneficiary_id,
      procedure_id
    );

    console.log("[initiateService] Upstream data:", data);

    // 🔹 Normalize wrapped ORDS response
    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn(
          "[initiateService] Could not parse inner response_body JSON"
        );
      }
    }

    if (parsed?.success === true) {
      return res.status(200).json({
        success: true,
        request_id: parsed.request_id,
        service_id: parsed.service_id,
        procedure_id: parsed.procedure_id,
        beneficiary_id: parsed.beneficiary_id,
        message: "Service initiated successfully",
      });
    }

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
      }
    );
  }
}
// GET /ayconnect/getServiceStatus
async function getServiceStatus(req, res) {
  try {
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const q = req.query || req.body || {};

    const user_id = q.user_id ?? fromToken;
    const service_id = q.service_id ?? null;

    if (!user_id) return res.status(401).json({ message: "No user in token" });
    if (!service_id)
      return res.status(400).json({ message: "service_id is required" });

    console.log("[getServiceStatus] Starting →", { user_id, service_id });

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
async function processPayment(req, res) {
  try {
    const request_id = req.body?.request_id || req.query?.request_id;

    // -----------------------------------------------------
    // Validate request_id
    // -----------------------------------------------------
    if (!request_id) {
      console.warn("[processPayment] Missing request_id");
      return res.status(400).json({ message: "request_id is required" });
    }

    console.log("[processPayment] START", {
      method: req.method,
      path: req.originalUrl,
      request_id,
    });

    // -----------------------------------------------------
    // Call ORDS
    // -----------------------------------------------------
    console.log("[processPayment] Calling ORDS → ordsProcessPayment()", {
      request_id,
    });

    const data = await ordsProcessPayment(request_id);

    console.log("[processPayment] ORDS raw response:", {
      status: data?.status,
      headers: data?.headers,
      raw: data?.raw,
      data: data?.data,
    });

    // -----------------------------------------------------
    // Parse ORDS response_body JSON
    // -----------------------------------------------------
    let parsed = data;
    if (typeof data?.response_body === "string") {
      console.log("[processPayment] Parsing response_body…");

      try {
        parsed = JSON.parse(data.response_body);
      } catch (err) {
        console.warn("[processPayment] Failed to parse response_body JSON", {
          error: err.message,
          bodyPreview: data.response_body?.slice(0, 200),
        });
      }
    }

    console.log("[processPayment] Parsed payload:", parsed);

    // -----------------------------------------------------
    // SUCCESS
    // -----------------------------------------------------
    if (parsed?.success === true) {
      console.log("[processPayment] SUCCESS — Payment marked as PAID", {
        request_id,
      });

      return res.status(200).json({
        success: true,
        message: "Service marked as PAID",
        request_id,
      });
    }

    // -----------------------------------------------------
    // FAILURE CASE
    // -----------------------------------------------------
    console.warn("[processPayment] FAILURE — ORDS did not confirm success", {
      request_id,
      parsed,
    });

    return res.status(500).json({
      success: false,
      message:
        parsed?.message || parsed?.error || "Failed to update payment status",
      upstream: parsed,
    });
  } catch (e) {
    // -----------------------------------------------------
    // UNCAUGHT ERROR
    // -----------------------------------------------------
    console.error("[processPayment] ERROR", {
      error: e.message,
      stack: e.stack,
      upstreamStatus: e.response?.status,
      upstreamData: e.response?.data,
    });

    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function registerPushToken(req, res) {
  try {
    const fromToken = String(req.user?.id || req.user?.sub || "");
    const b = req.body || req.query || {};

    const user_id = b.user_id ?? fromToken;
    const expo_push_token = b.expo_push_token;

    if (!user_id) {
      return res.status(401).json({ message: "No user in token" });
    }
    if (!expo_push_token) {
      return res.status(400).json({ message: "expo_push_token is required" });
    }

    console.log("[registerPushToken] →", { user_id, expo_push_token });

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
      }
    );
  }
}

module.exports = {
  getServices,
  ensureRun,
  getUserDocs,
  getActiveRuns,
  getCurrentStep,
  createBeneficiary,
  getBeneficiaries,
  getDocumentTypes,
  uploadUserDocuments,
  getProcedures,
  getDepartments,
  getUserAvatar,
  uploadUserAvatar,
  getUserDetails,
  updateUserDetails,
  initiateService,
  getServiceStatus,
  processPayment,
  registerPushToken,
};
