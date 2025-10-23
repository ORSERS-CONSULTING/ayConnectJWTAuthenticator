// In the next step we’ll wire these to API Gateway/ORDS via services/ords.service.js

const { ordsGetServices, ordsGetUserDocs, ordsGetBeneficiaries, ordsCreateBeneficiary, ordsGetDocumentTypes, uploadDocuments, ordsGetProcedures, ordsGetDepartments, ordsGetUserAvatar, ordsUploadUserAvatar, ordsGetUserDetails, ordsUpdateUserDetails, } = require('../services/ordsServices');

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
    const items = Array.isArray(data) ? data : (data.items ?? data);
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
    const userId = String(req.user?.id || req.user?.sub || '');
    if (!userId) return res.status(401).json({ message: 'No user in token' });

    const data = await ordsGetUserDocs(userId);
    return res.json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

async function uploadUserDocuments(req, res) {
  try {
    const userFromToken = String(req.user?.id || req.user?.sub || '');
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

    const missing = ['user_id', 'document_id', 'file_name', 'file_type', 'file_base64'].filter(k => !body[k]);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    if (typeof body.file_base64 === 'string' && body.file_base64.startsWith('data:')) {
      body.file_base64 = body.file_base64.split(',')[1] || body.file_base64;
    }

    const approxBytes = Math.ceil((body.file_base64.replace(/=+$/, '').length * 3) / 4);



    const resp = await uploadDocuments(body);

    const is2xx = resp.status >= 200 && resp.status < 300;
    const raw = resp.data; // string (possibly empty) because responseType:'text'
    let parsed = null;

    // Try to parse JSON if present
    if (typeof raw === 'string' && raw.trim().length) {
      try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
    }

    // Try to extract ID from Location header if ORDS sent one
    const location = resp.headers?.location || resp.headers?.Location;
    let idFromLocation = null;
    if (typeof location === 'string') {
      const m = location.match(/\/(\d+)(?:\?.*)?$/);
      if (m) idFromLocation = Number(m[1]);
    }

    // Success policy: any 2xx = success, but prefer explicit flags/ids if present
    const uploadedExplicit =
      parsed?.uploaded === true ||
      typeof parsed?.id === 'number' ||
      typeof parsed?.document_id === 'number' ||
      typeof idFromLocation === 'number';

    const uploaded = is2xx && (uploadedExplicit || true); // accept empty 2xx as success
    const resolvedId = parsed?.id ?? parsed?.document_id ?? idFromLocation ?? null;

    if (!uploaded) {
      return res.status(resp.status || 200).json({
        uploaded: false,
        message: 'Upstream did not confirm upload',
        upstream: { status: resp.status, headers: resp.headers, body: raw ?? '' },
      });
    }

    // 201 if created-ish, else 200
    const outStatus = resp.status === 201 ? 201 : (is2xx ? 201 : 200);

    return res.status(outStatus).json({
      uploaded: true,
      id: resolvedId,
      upstream: {
        status: resp.status,
        headers: resp.headers,
        body: parsed ?? raw ?? '',
      },
    });
  } catch (e) {
    const code = e.response?.status ?? 500;
    console.error('[/uploadUserDocuments] ERROR:', e.response?.data ?? e.message);
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
    const fromToken = String(req.user?.id || req.user?.sub || '');
    const user_id = String(req.query?.user_id || fromToken);
    if (!user_id) return res.status(401).json({ message: 'No user in token' });

    const b = req.body || {};

    // 1) multipart
    let file_buffer = req.file?.buffer || null;
    let mime_type = req.file?.mimetype || null;

    // 2) raw binary (from express.raw)
    if (!file_buffer && req.is('image/*')) {
      // express.raw gives Buffer in req.body
      file_buffer = Buffer.isBuffer(req.body) ? req.body : null;
      mime_type = req.headers['content-type'] || mime_type;
    }

    // 3) JSON base64
    if (!file_buffer && typeof b.file_base64 === 'string') {
      const base64 = b.file_base64.includes(',')
        ? b.file_base64.split(',')[1]
        : b.file_base64;
      file_buffer = Buffer.from(base64, 'base64');
      mime_type = b.mime_type || mime_type;
    }

    if (!file_buffer || !mime_type) {
      return res.status(400).json({
        message:
          "Provide avatar via RAW (Content-Type: image/*), multipart field 'avatar', or JSON {file_base64, mime_type}",
      });
    }
    if (!/^image\//i.test(String(mime_type))) {
      return res.status(415).json({ message: 'mime_type must be image/*' });
    }
    if (file_buffer.length > 20 * 1024 * 1024) {
      return res.status(413).json({ message: 'Max 20MB allowed' });
    }

    const upstream = await ordsUploadUserAvatar(user_id, file_buffer, mime_type);
    const ok = upstream.status >= 200 && upstream.status < 300;

    let out = upstream.data;
    try { out = typeof out === 'string' && out ? JSON.parse(out) : out; } catch {}
    return res.status(ok ? 200 : upstream.status).json(
      out ?? { message: ok ? 'Avatar uploaded successfully' : 'Upload failed' }
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
    return res
      .status(ok ? 200 : upstream.status)
      .json(upstream.data ?? { message: ok ? "User details updated successfully" : "Update failed" });
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
    const items = Array.isArray(data) ? data : (data.items ?? data);

    // Optional: sort SELF first, like your SQL does
    const sorted =
      Array.isArray(items)
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
      return res.status(400).json({ message: "full_name is required for DEPENDENT" });
    }

    const upstream = await ordsCreateBeneficiary({ user_id, type, full_name, relationship });

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


module.exports = { getServices, getUserDocs, createBeneficiary, getBeneficiaries, getDocumentTypes, uploadUserDocuments, getProcedures, getDepartments, getUserAvatar, uploadUserAvatar, getUserDetails, updateUserDetails, };

