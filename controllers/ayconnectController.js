// In the next step we’ll wire these to API Gateway/ORDS via services/ords.service.js

const { ordsGetServices, ordsGetUserDocs, ordsGetDocumentTypes, uploadDocuments, ordsGetProcedures, ordsGetDepartments } = require('../services/ordsServices');

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
    // allow user_id to be omitted and default from the app JWT
    const userFromToken = String(req.user?.id || req.user?.sub || '');
    const b = req.body || {};

    const body = {
      user_id: b.user_id ?? userFromToken,                // required (defaults from token)
      document_id: Number(b.document_id),                 // required
      file_name: b.file_name,                             // required
      file_type: b.file_type,                             // required
      file_base64: b.file_base64,                         // required

      // optional extras — forwarded as-is
      uploaded_by: b.uploaded_by,
      original_file_name: b.original_file_name,
      document_display_name: b.document_display_name,
      expiry_date: b.expiry_date,
    };

    // basic validation
    const missing = ['user_id','document_id','file_name','file_type','file_base64']
      .filter(k => !body[k]);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    // strip "data:*;base64," if present
    if (typeof body.file_base64 === 'string' && body.file_base64.startsWith('data:')) {
      body.file_base64 = body.file_base64.split(',')[1] || body.file_base64;
    }

    // ~20MB guard (optional)
    const approxBytes = Math.ceil((body.file_base64.length * 3) / 4);
    if (approxBytes > 20 * 1024 * 1024) {
      return res.status(413).json({ message: 'File too large (max ~20MB)' });
    }

    const data = await uploadDocuments(body); // <— forwards ALL fields to ORDS
    return res.json(data);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

module.exports = { getServices, getUserDocs, getDocumentTypes, uploadUserDocuments, getProcedures, getDepartments };

