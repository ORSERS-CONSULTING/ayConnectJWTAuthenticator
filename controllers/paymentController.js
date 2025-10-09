const { initPayment } = require("../services/ordsServices");

async function createPayment(req, res) {
  try {
    const body = req.body || {};
    const ctx = {
      userId: req.user?.id || req.user?.sub || null,
      serviceId: body.service_id,
      procedureId: body.procedure_id,
      requestId: body.request_id,
      email: body.email,
      name: body.name,
    };

    if (!body.amount || !body.currency) {
      return res.status(400).json({ message: "amount and currency are required" });
    }

    const data = await initPayment(body, ctx);
    return res.status(200).json(data);
  } catch (e) {
    console.error("[createPayment] ERROR:", e);
    const code = e.response?.status ?? 500;
    return res.status(code).json({ message: e.message, details: e.response?.data });
  }
}


module.exports = { createPayment };