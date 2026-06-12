/**
 * =============================================
 * SYNERGIC PAY - Web Sub Merchant Routes
 * =============================================
 */

const express = require("express");
const router = express.Router();
const { verifyWebAuth } = require("../../middlewares/auth.middleware");
const submerchantController = require("../../controllers/web/submerchantController");
const kycController = require("../../controllers/web/kycController");

// ---- Sub Merchant Onboarding Form Submission ----
// Protected by verifyWebAuth
router.post("/submerchant_onboard", verifyWebAuth, submerchantController.processCreateSubMerchant);
router.post("/api/regenerate_code", verifyWebAuth, submerchantController.regenerateSubmerchantCode);

module.exports = router;
