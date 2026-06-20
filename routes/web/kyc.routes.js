/**
 * =============================================
 * SYNERGIC PAY - Web KYC Routes
 * =============================================
 */

const express = require("express");
const router = express.Router();
const { verifyWebAuth } = require("../../middlewares/auth.middleware");
const kycController = require("../../controllers/web/kycController");
const pdfController = require("../../controllers/web/pdfController");

// ---- KYC Routes ----
router.get("/generate_kyc", verifyWebAuth, kycController.renderGenerateKycPage);
router.post("/api/search_submerchant", verifyWebAuth, kycController.searchSubmerchant);
router.get("/api/generate_access_key", verifyWebAuth, kycController.generateAccessKey);

router.get("/upload_kyc", verifyWebAuth, kycController.renderUploadKycPage);
router.post("/api/upload_kyc", verifyWebAuth, kycController.uploadKyc.any(), kycController.processUploadKyc);
router.post("/api/generate_gst_agreement", verifyWebAuth, pdfController.generateGstAgreement);

module.exports = router;
