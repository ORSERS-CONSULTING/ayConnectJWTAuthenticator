const router = require("express").Router();
const express = require("express");
const { authUser } = require("../middleware/authUser");

const {
  initPayment,
  verifyPayment,
  serveCheckoutPage,
  paymentReturn
} = require("../controllers/paymentController");

// Init payment (create ORDS + MPGS session)
router.post("/init", express.json(), authUser, initPayment);

// Verify payment after checkout
router.post("/verify", express.json(), verifyPayment);

// ✅ Hosted Checkout Page (NO AUTH, NO JSON)
router.get("/checkout", serveCheckoutPage);
router.get("/payments/return", paymentReturn);

module.exports = router;
