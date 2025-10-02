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

    console.log('[/uploadUserDocuments] payload:', {
      ...body,
      file_base64: `[hidden ${approxBytes} bytes]`,
    });

    const resp = await uploadDocuments(body);
    const data = resp?.data ?? resp;

    console.log('[/uploadUserDocuments] upstream response:', data);
    // Be explicit: only success if upstream confirms an upload
    const uploaded = data?.uploaded === true || typeof data?.id === 'number' || typeof data?.document_id === 'number';
    if (!uploaded) {
      return res.status(200).json({ uploaded: false, message: 'Upstream did not confirm upload', raw: data });
    }

    return res.status(201).json({ uploaded: true, id: data.id ?? data.document_id, raw: data });
  } catch (e) {
    const code = e.response?.status ?? 500;
    console.error('[/uploadUserDocuments] ERROR:', e.response?.data ?? e.message);
    return res.status(code).json(e.response?.data ?? { message: e.message });
  }
}

module.exports = { getServices, getUserDocs, getDocumentTypes, uploadUserDocuments, getProcedures, getDepartments };

