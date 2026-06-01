/**
 * =============================================
 * SYNERGIC PAY - API v1 Routes Placeholder
 * =============================================
 * 
 * Placeholder for versioned API routes.
 * Mount additional API route modules here as needed.
 * All routes here are prefixed with /api/v1 in server.js.
 */

const express = require("express");
const router = express.Router();
const { verifyApiAuth } = require("../../../middlewares/auth.middleware");

// ---- Health Check (Public) ----
router.get("/health", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Synergic Pay API v1 is running.",
        timestamp: new Date().toISOString()
    });
});

// ---- Example Protected Route ----
router.get("/profile", verifyApiAuth, (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Authenticated successfully.",
        user: req.user
    });
});

module.exports = router;
