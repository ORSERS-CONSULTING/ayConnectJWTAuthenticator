const router = require("express").Router();
const { authUser } = require("../middleware/authUser");
const { createPayment } = require("../controllers/paymentController");

// POST /pay
router.post("/pay", authUser, createPayment);

module.exports = router;
