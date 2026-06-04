/**
 * =============================================
 * SYNERGIC PAY - Server Entry Point
 * =============================================
 * 
 * Express.js application with:
 *   - EJS + express-ejs-layouts for server-rendered views
 *   - Helmet, CORS, cookie-parser security middleware
 *   - Web routes (admin panel) at /admin
 *   - API v1 routes at /api/v1
 *   - Root redirect to /admin/login
 */

// ---- Load Environment Variables ----
require("dotenv").config();

// ---- Core Dependencies ----
const express = require("express");
const path = require("path");
const expressLayouts = require("express-ejs-layouts");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");

// ---- Initialize Express App ----
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
//  SECURITY MIDDLEWARE
// ============================================

// Helmet — set various HTTP headers for security
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://code.jquery.com",
                "https://cdn.jsdelivr.net"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://fonts.googleapis.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdn.jsdelivr.net"
            ],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS — configure allowed origins
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

// ============================================
//  BODY PARSING & COOKIES
// ============================================

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies (for API routes)
app.use(express.json({ limit: "10mb" }));

app.use(cookieParser(process.env.COOKIE_SECRET));

// Import your new logger middleware
const {levantLogger} = require('./middlewares/logger.middleware')

// Import Webhook Routes
const webhookRoutes = require('./routes/api/v1/webhook.routes');

app.use('/api/v1/webhooks', levantLogger,webhookRoutes);

// We initialize CSRF here. Everything BELOW this line requires a CSRF token.
// const csrfProtection = csrf({ cookie: true });
// app.use(csrfProtection);

// Cookie Parser

// ============================================
//  STATIC FILES
// ============================================

app.use(express.static(path.join(__dirname, "public")));

// ============================================
//  VIEW ENGINE (EJS + Layouts)
// ============================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Express EJS Layouts configuration
app.use(expressLayouts);
app.set("layout", "layout");           // Default layout file: views/layout.ejs
app.set("layout extractScripts", true); // Extract <script> tags to bottom
app.set("layout extractStyles", true);  // Extract <style> tags to head

// ============================================
//  ROUTES
// ============================================

// ---- Root Route: Redirect to Admin Login ----
app.get("/", (req, res) => {
    return res.redirect("/admin/login");
});

// ---- Web Routes (Admin Panel) — prefix: /admin ----
const webRoutes = require("./routes/web/index");
app.use("/admin", webRoutes);

// ---- API v1 Routes — prefix: /api/v1 ----
const apiV1Routes = require("./routes/api/v1/index");
app.use("/api/v1", apiV1Routes);

// ============================================
//  ERROR HANDLING
// ============================================

// 404 — Page Not Found
app.use((req, res) => {
    // Respond based on request type
    if (req.originalUrl.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: "API endpoint not found."
        });
    }

    // Redirect to login route so it can handle existing token redirect or render properly
    return res.redirect("/admin/login");
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("[Server] Unhandled Error:", err.stack);

    if (req.originalUrl.startsWith("/api/")) {
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }

    return res.redirect("/admin/login");
});

// ============================================
//  START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║         🚀  SYNERGIC PAY SERVER              ║
║                                              ║
║    Status :  Running                         ║
║    Port   :  ${PORT}                            ║
║    Mode   :  ${process.env.NODE_ENV || "development"}                   ║
║    URL    :  http://localhost:${PORT}            ║
║                                              ║
╚══════════════════════════════════════════════╝
    `);
});

module.exports = app;
