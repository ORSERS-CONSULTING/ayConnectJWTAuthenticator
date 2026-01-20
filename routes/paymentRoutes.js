const router = require("express").Router();
const express = require("express");
const path = require("path");
const { authUser } = require("../middleware/authUser");

const {
  initPayment,
  verifyPayment,
  paymentReturn,
} = require("../controllers/paymentController");

// 1️⃣ Init payment (ORDS + MPGS session)
router.post("/init", express.json(), authUser, initPayment);

// 2️⃣ Verify payment
router.post("/verify", express.json(), verifyPayment);

// 3️⃣ MPGS return URL (browser → app)
router.get("/return", paymentReturn);

// 4️⃣ Hosted Checkout UI (browser loads Checkout.js)
router.get("/checkout", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/mpgs-checkout.html")
  );
});

module.exports = router;
