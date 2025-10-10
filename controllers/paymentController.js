const { initPayment } = require("../services/ordsServices");
const axios = require('axios');

async function createPayment(req, res) {
  try {
    const b = req.body || {};
    if (b.amount == null || !b.currency) {
      return res.status(400).json({ message: "amount and currency are required" });
    }

    const ctx = {
      userId: req.user?.id || req.user?.sub || null,
      serviceId: b.service_id,
      procedureId: b.procedure_id,
      requestId: b.request_id,
      email: b.email,
      name: b.name,
    };

    const data = await initPayment(
      { amount: b.amount, currency: b.currency, description: b.description, serviceCode: b.service_code },
      ctx
    );

    return res.status(200).json(data);
  } catch (e) {
    console.error("[createPayment] ERROR:", e);
    const code = e.response?.status ?? 500;
    return res.status(code).json({ message: e.message, details: e.response?.data });
  }
}

async function callStripeWebhook() {
  const url = `${process.env.GATEWAY_BASE_URL}/webhook`;
  const res = await axios.post(url);
  console.log('Webhook called:', res.status);
}

module.exports = { createPayment, callStripeWebhook };