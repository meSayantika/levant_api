/**
 * =============================================
 * SYNERGIC PAY - Web Menu Routes
 * =============================================
 * 
 * Routes for the Menu Management screen.
 * Protected by verifyWebAuth middleware.
 * Prefix: /admin
 */

const express = require("express");
const router = express.Router();
const { verifyWebAuth } = require("../../middlewares/auth.middleware");
const menuController = require("../../controllers/web/menuController");

// ---- Menu Management Page (Protected) ----
router.get("/menu-management", verifyWebAuth, menuController.renderMenuManagement);

// ---- Process Menu Creation (AJAX) ----
router.post("/api/menu/create", verifyWebAuth, menuController.processCreateMenu);

module.exports = router;
