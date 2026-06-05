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

// ---- Sub Merchant Form (Protected) ----
router.get("/merchants", verifyWebAuth, (req, res) => {
    res.render("pages/submerchant/submerchant", {
        title: "Sub Merchant Onboarding | Synergic Pay",
        user: req.user,
        currentRoute: "/admin/merchants",
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
});

module.exports = router;
