const router = require("express").Router();
const express = require("express");
const path = require("path");
const { authUser, optionalAuthUser } = require("../middleware/authUser");

const {
  initPayment,
  verifyPayment,
  paymentReturn,
  paymentWebhook,
} = require("../controllers/paymentController");

// paymentRoutes.js
router.post("/init", optionalAuthUser, initPayment);
router.post("/verify", verifyPayment);
router.get("/return", paymentReturn);
router.post("/webhook", paymentWebhook);

// 4️⃣ Hosted Checkout UI (browser loads Checkout.js)
router.get("/checkout", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/mpgs-checkout.html"));
});

module.exports = router;
