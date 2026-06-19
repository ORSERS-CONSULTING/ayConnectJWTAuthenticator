
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
  ordsDownloadInvoicePdf,
  ordsGetInvoices,
  ordsGetParkingInfo,
  ordsGetApplicationDocument,
  ordsApplicationDocumentExists,
  ordsDeleteAccount
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


async function downloadUserDoc(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const doc_id = Number(req.query?.doc_id);


    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!Number.isFinite(doc_id) || doc_id <= 0) {
      return res.status(400).json({ message: "Valid doc_id is required" });
    }

    const upstream = await ordsDownloadUserDoc({ doc_id, user_id });


    if (upstream.status >= 400) {
      return res.status(upstream.status).json({
        message: "Failed to download document",
      });
    }

    res.setHeader(
      "Content-Type",
      upstream.headers["content-type"] || "application/octet-stream"
    );

    if (upstream.headers["content-length"]) {
      res.setHeader("Content-Length", upstream.headers["content-length"]);
    }

    res.setHeader(
      "Content-Disposition",
      upstream.headers["content-disposition"] ||
        `attachment; filename="document-${doc_id}"`
    );

    upstream.data.on("error", (err) => {
      console.error("[downloadUserDoc] stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Download stream failed" });
      } else {
        res.destroy(err);
      }
    });

    upstream.data.pipe(res);
  } catch (e) {
    console.error("[downloadUserDoc] error:", e.response?.data || e.message);

    const code = e.response?.status ?? 500;
    return res.status(code).json({
      message: e.response?.data?.message || e.message || "Download failed",
    });
  }
}


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
      data = await ordsMarkNotificationRead({ user_id, notif_id });
    } else {
      // ✅ mark ALL notifications
      data = await ordsMarkNotificationRead({ user_id });
 
    }

    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {}
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
    const user_id = String(req.user?.id || "");
    const b = req.query || req.body || {};

    const data = await ordsGetServices(user_id);
    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {}
    }
    return res.status(200).json(parsed);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function getDocumentTypes(_req, res) {
  try {
    const data = await ordsGetDocumentTypes();
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
      beneficiary_id: Number(b.beneficiary_id), 
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
    const raw = resp.data; 
    let parsed = null;

    if (typeof raw === "string" && raw.trim().length) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* not JSON */
      }
    }

    const location = resp.headers?.location || resp.headers?.Location;
    let idFromLocation = null;
    if (typeof location === "string") {
      const m = location.match(/\/(\d+)(?:\?.*)?$/);
      if (m) idFromLocation = Number(m[1]);
    }

    const uploadedExplicit =
      parsed?.uploaded === true ||
      typeof parsed?.id === "number" ||
      typeof parsed?.document_id === "number" ||
      typeof idFromLocation === "number";

    const uploaded = is2xx && (uploadedExplicit || true); 
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

async function getUserAvatar(req, res) {
  try {
    const user_id = String(req.user?.id || "");

    if (!user_id) return res.status(401).send("No user");

    const upstream = await ordsGetUserAvatar(user_id);

    if (upstream.status >= 400) {
      return res.status(upstream.status).json({ message: "Avatar not found" });
    }

    const ct = upstream.headers["content-type"] || "image/jpeg";
    res.setHeader("Content-Type", ct);
    if (upstream.headers["content-length"]) {
      res.setHeader("Content-Length", upstream.headers["content-length"]);
    }
    res.setHeader("Cache-Control", "public, max-age=86400");

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

    let file_buffer = req.file?.buffer || null;
    let mime_type = req.file?.mimetype || null;

    if (!file_buffer && req.is("image/*")) {
      file_buffer = Buffer.isBuffer(req.body) ? req.body : null;
      mime_type = req.headers["content-type"] || mime_type;
    }

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
    } catch {}
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
    const items = Array.isArray(data) ? data : (data.items ?? data);

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

    const status = upstream.status || 200;
    const data = upstream.data ?? {};

    const out = {
      beneficiary_id: data.out_beneficiary_id ?? data.beneficiary_id ?? null,
      type: data.out_type ?? type,
      full_name: data.out_full_name ?? full_name ?? null,
      relationship: data.out_relationship ?? relationship ?? null,
      message: data.response_message ?? data.message ?? null,
      upstream: data, 
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
        console.warn(`❌ [${traceId}] Invalid request_id`, {
          value: q.request_id,
        });
        return res.status(400).json({ message: "invalid request_id" });
      }
    }

    const ordsStart = Date.now();

    const data = await ordsGetInvoices({
      user_id,
      request_id,
    });
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

    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

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

    const data = await ordsInitiateService(
      service_id,
      user_id,
      beneficiary_id,
      procedure_id,
    );

    let parsed = data;
    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn("[initiateService] JSON parse failed for response_body");
      }
    }

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

async function getServiceStatus(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const q = req.query || req.body || {};

    const service_id = q.service_id ?? null;

    if (!user_id) return res.status(401).json({ message: "No user in token" });
    if (!service_id)
      return res.status(400).json({ message: "service_id is required" });

    const data = await ordsGetServiceStatus(user_id, service_id);

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

    let parsed = data;

    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch {
        console.warn("[getNotifications] Could not parse response_body JSON");
      }
    }

    return res.status(200).json(parsed);
  } catch (e) {
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

async function getApplicationDocument(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const request_id = Number(req.query?.request_id);

    if (!request_id) {

      return res.status(400).json({
        message: "request_id is required",
      });
    }

    if (!user_id) {

      return res.status(401).json({
        message: "No user in token",
      });
    }


    const upstream = await ordsGetApplicationDocument({
      request_id,
      user_id,
    });


    if (upstream.status >= 400) {

      return res.status(upstream.status).end();
    }

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

    upstream.data.pipe(res);
  } catch (e) {
    console.error("❌ getApplicationDocument ERROR:", {
      message: e.message,
      status: e.response?.status,
      data: e.response?.data,
    });

    const code = e.response?.status ?? 500;

    return res.status(code).json(
      e.response?.data ?? {
        message: e.message,
      },
    );
  }
}

async function applicationDocumentExists(req, res) {
  try {
    const user_id = String(req.user?.id || "");
    const request_id = Number(req.query?.request_id);

    if (!user_id) {
      return res.status(401).json({
        success: false,
        exists: false,
        message: "No user in token",
      });
    }

    if (!request_id) {
      return res.status(400).json({
        success: false,
        exists: false,
        message: "request_id is required",
      });
    }

    const data = await ordsApplicationDocumentExists({
      request_id,
      user_id,
    });


    let parsed = data;

    if (typeof data?.response_body === "string") {
      try {
        parsed = JSON.parse(data.response_body);
      } catch (err) {
        console.error("❌ [applicationDocumentExists] parse failed", {
          response_body: data.response_body,
          error: err.message,
        });

        return res.status(500).json({
          success: false,
          exists: false,
          message: "Invalid ORDS response",
        });
      }
    }

    return res.status(200).json({
      success: parsed?.success === true,
      exists: parsed?.exists === true,
    });
  } catch (e) {
    console.error("❌ applicationDocumentExists ERROR:", {
      message: e.message,
      status: e.response?.status,
      data: e.response?.data,
    });

    const code = e.response?.status ?? 500;

    return res.status(code).json(
      e.response?.data ?? {
        success: false,
        exists: false,
        message: e.message,
      },
    );
  }
}


async function deleteAccount(req, res) {
  try {
    const user_id = req.user?.user_id || req.user?.id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const result = await ordsDeleteAccount(user_id);

    if (result.status !== 200) {
      return res.status(result.status || 500).json({
        success: false,
        message:
          result.data?.response_message ||
          result.data?.message ||
          "Failed to delete account",
        details: result.data,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
      data: result.data,
    });
  } catch (error) {
    console.error("❌ [DELETE ACCOUNT] Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete account",
    });
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
  downloadInvoicePdf,
  getInvoices,
  getParkingInfo,
  getApplicationDocument,
  applicationDocumentExists,
  deleteAccount,
};
