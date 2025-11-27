const {
  initPayment,
  forwardToOrds,
  getPaymentResult,
} = require("../services/ordsServices");
const axios = require("axios");

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
      stepOrder: b.step_order,              
      email: b.email,
      name: b.name,
    };

    const data = await initPayment(
      {
        amount: b.amount,
        currency: b.currency,
        description: b.description,
        serviceCode: b.service_code,
      },
      ctx
    );
    return res.status(200).json(data);
  } catch (e) {
    console.error("[createPayment] ERROR:", e);
    const code = e.response?.status ?? 500;
    return res
      .status(code)
      .json({ message: e.message, details: e.response?.data });
  }
}

async function proxyStripeToOrds(req, res) {
  try {
    const stripeSig = req.headers["stripe-signature"];
    if (!stripeSig) return res.status(400).send("Missing Stripe-Signature");

    const r = await forwardToOrds(req.body, stripeSig);
    return res.status(r.status).send(r.data ?? "OK");
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res.status(code).send(e.response?.data || e.message);
  }
}

async function getPaymentResultController(req, res) {
  try {
    const id = req.params.id;
    const out = await getPaymentResult(id);
    return res.status(200).json(out);
  } catch (e) {
    const code = e.response?.status ?? 500;
    return res
      .status(code)
      .json({ message: e.message, details: e.response?.data });
  }
}

module.exports = {
  createPayment,
  proxyStripeToOrds,
  getPaymentResultController,
};
