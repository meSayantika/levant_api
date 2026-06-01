/**
 * =============================================
 * SYNERGIC PAY - Web Dashboard Routes
 * =============================================
 * 
 * Routes for admin dashboard pages.
 * Protected by verifyWebAuth middleware.
 * Prefix: /admin
 */

const express = require("express");
const router = express.Router();
const { verifyWebAuth } = require("../../middlewares/auth.middleware");
const dashboardController = require("../../controllers/web/dashboardController");

// ---- Dashboard Page (Protected) ----
router.get("/dashboard", verifyWebAuth, dashboardController.renderDashboard);

module.exports = router;
