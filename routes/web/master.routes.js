/**
 * =============================================
 * SYNERGIC PAY - Master API Proxy Routes
 * =============================================
 * 
 * Proxy routes for external APIs to avoid CORS.
 * Prefix: /admin/master
 */

const express = require("express");
const router = express.Router();
const { verifyWebAuth } = require("../../middlewares/auth.middleware");

// ---- Proxy for External API (States) ----
router.get("/states", verifyWebAuth, async (req, res) => {
    try {
        const response = await fetch("https://app.levanttech.in/api/states", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mid: 21 })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error in proxy states API:", err);
        res.status(500).json({ status: false, error: "Server Error" });
    }
});

// ---- Proxy for External API (Categories) ----
router.get("/categories", verifyWebAuth, async (req, res) => {
    try {
        const response = await fetch("https://app.levanttech.in/api/categories", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mid: 21 })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error in proxy categories API:", err);
        res.status(500).json({ status: false, error: "Server Error" });
    }
});

// ---- Proxy for External API (Business Types) ----
router.get("/business-types", verifyWebAuth, async (req, res) => {
    try {
        const response = await fetch("https://app.levanttech.in/api/business-types", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mid: 21 })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error in proxy business-types API:", err);
        res.status(500).json({ status: false, error: "Server Error" });
    }
});

// ---- Proxy for External API (Entity Types) ----
router.get("/entity-types", verifyWebAuth, async (req, res) => {
    try {
        const response = await fetch("https://app.levanttech.in/api/entity-types", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mid: 21 })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error in proxy business-types API:", err);
        res.status(500).json({ status: false, error: "Server Error" });
    }
});

module.exports = router;
