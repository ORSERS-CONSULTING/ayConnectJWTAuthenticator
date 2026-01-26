const router = require("express").Router();
const express = require("express");
const multer = require("multer");
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB cap
const { authUser } = require("../middleware/authUser");
const ctrl = require("../controllers/ayconnectController");
const rawImages = express.raw({
  type: ["image/*", "application/octet-stream"],
  limit: "20mb",
});
router.get("/services", authUser, ctrl.getServices);
router.get("/user-docs", authUser, ctrl.getUserDocs);
router.get("/document-types", authUser, ctrl.getDocumentTypes);
router.get("/getProcedures", authUser, ctrl.getProcedures);
router.get("/getDepartments", authUser, ctrl.getDepartments);
router.post("/uploadUserDocuments", authUser, ctrl.uploadUserDocuments);
router.get("/user/avatar", authUser, ctrl.getUserAvatar);
router.put(
  "/user/avatar",
  authUser,
  rawImages, // handles raw binary uploads
  upload.single("avatar"), // handles multipart form-data (field "avatar")
  ctrl.uploadUserAvatar
);
router.get("/user/details", authUser, ctrl.getUserDetails);
router.post("/user/details", authUser, express.json(), ctrl.updateUserDetails);
router.get("/beneficiaries", authUser, ctrl.getBeneficiaries);
router.post("/beneficiaries", authUser, ctrl.createBeneficiary);
router.put("/beneficiaries", authUser, ctrl.updateBeneficiary);
router.get("/runs/active", authUser, ctrl.getActiveRuns);
router.get("/procedure-instances/current-step", authUser, ctrl.getCurrentStep);
router.post("/procedures", authUser, express.json(), ctrl.ensureRun);
router.post("/initiateService", authUser, express.json(), ctrl.initiateService);
router.get("/getServiceStatus", authUser, ctrl.getServiceStatus);
router.post("/registerPushToken", authUser, ctrl.registerPushToken);
router.get("/getNotifications", authUser, ctrl.getNotifications);
router.get("/downloadUserDoc", authUser, ctrl.downloadUserDoc);
router.get("/getRequests", authUser, ctrl.getRequests);
router.get("/media", ctrl.media);
router.post("/markNotificationRead", authUser, ctrl.markNotificationRead);
router.post("/clearPushToken", authUser, ctrl.clearPushToken);
router.get("/downloadInvoicePdf", authUser, ctrl.downloadInvoicePdf);
module.exports = router;
