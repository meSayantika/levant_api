/**
 * =============================================
 * SYNERGIC PAY - Authentication Middleware
 * =============================================
 * 
 * Two-pronged auth strategy:
 *   1. verifyWebAuth  — Cookie-based for /admin routes
 *   2. verifyApiAuth  — Bearer JWT for /api routes
 */

const jwt = require("jsonwebtoken");
const { fetchUserMenu } = require("./menu.middleware");

/**
 * Middleware: Verify Web (Admin Panel) Authentication.
 * Checks for a valid JWT stored in an HTTP-only cookie named 'sp_token'.
 * On failure, redirects to /admin/login.
 */
function verifyWebAuth(req, res, next) {
    try {
        const token = req.cookies.sp_token;

        // No token found — redirect to login
        if (!token) {
            return res.redirect("/admin/login");
        }

        // Verify the JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach decoded user info to request object
        req.user = decoded;

        // Fetch dynamic user menus and attach to res.locals.menus, then call next()
        return fetchUserMenu(req, res, next);
    } catch (err) {
        console.error("[Auth Middleware] Web auth failed:", err.message);
        // Invalid or expired token — clear cookie and redirect
        res.clearCookie("sp_token");
        return res.redirect("/admin/login");
    }
}

/**
 * Middleware: Verify API (Mobile/Integration) Authentication.
 * Checks for a valid Bearer token in the Authorization header.
 * On failure, returns a 401 JSON response.
 */
function verifyApiAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        // No Authorization header
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided."
            });
        }

        // Extract the token (strip "Bearer " prefix)
        const token = authHeader.split(" ")[1];

        // Verify the JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach decoded user info to request object
        req.user = decoded;

        return next();
    } catch (err) {
        console.error("[Auth Middleware] API auth failed:", err.message);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token."
        });
    }
}

module.exports = { verifyWebAuth, verifyApiAuth };
