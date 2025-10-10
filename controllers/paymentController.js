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

// async function triggerStripeWebhook(req, res) {
//   try {
//     const result = await callStripeWebhook(); // directly call your service
//     return res.status(200).json({ ok: true, message: "Webhook called successfully" });
//   } catch (e) {
//     console.error("[triggerStripeWebhook] ERROR:", e);
//     const code = e.response?.status ?? 500;
//     return res.status(code).json({
//       ok: false,
//       message: e.message,
//       details: e.response?.data,
//     });
//   }
// }
async function proxyStripeToOrds(req, res) {
  try {
    const stripeSig = req.headers["stripe-signature"];
    if (!stripeSig) return res.status(400).send("Missing Stripe-Signature");

    // req.body is a Buffer because of express.raw on the route
    const r = await forwardToOrds(req.body, stripeSig);

    // Pass through ORDS' response code/body
    return res.status(r.status).send(r.data ?? "OK");
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).send(e.response?.data || e.message);
  }
}

module.exports = { createPayment, proxyStripeToOrds };