/**
 * =============================================
 * SYNERGIC PAY - Dashboard Controller
 * =============================================
 * 
 * Renders the admin dashboard with summary metrics
 * fetched from the database using F_Select.
 */

const { F_Select } = require("../../models/oracleModel");

/**
 * GET /admin/dashboard
 * Render the dashboard page with summary statistics.
 */
async function renderDashboard(req, res) {
    try {
        // ---- Fetch summary metrics from DB (Primary DB = 0) ----
        let totalUsers = 0;
        let totalTransactions = 0;
        let totalRevenue = 0;
        let activeQRCodes = 0;

        // --- User count ---
        // (Table not decided yet, show 0)
        // try {
        //     const userCount = await F_Select(0, `SELECT COUNT(*) AS TOTAL FROM MD_ADMIN_USER`, []);
        //     totalUsers = (userCount && userCount.length > 0) ? userCount[0].TOTAL : 0;
        // } catch (dbErr) {
        //     console.warn("[DashboardController] Could not fetch user count:", dbErr.message);
        // }

        // TODO: Replace table/column names below with your actual tables once they exist.
        // --- Transaction count ---
        // Uncomment and update when the transactions table is available:
        // try {
        //     const txnCount = await F_Select(0, `SELECT COUNT(*) AS TOTAL FROM YOUR_TRANSACTIONS_TABLE`, []);
        //     totalTransactions = (txnCount && txnCount.length > 0) ? txnCount[0].TOTAL : 0;
        // } catch (dbErr) {
        //     console.warn("[DashboardController] Could not fetch transaction count:", dbErr.message);
        // }

        // --- Revenue ---
        // Uncomment and update when the transactions table is available:
        // try {
        //     const revenue = await F_Select(0, `SELECT NVL(SUM(AMOUNT), 0) AS TOTAL FROM YOUR_TRANSACTIONS_TABLE WHERE STATUS = 'SUCCESS'`, []);
        //     totalRevenue = (revenue && revenue.length > 0) ? revenue[0].TOTAL : 0;
        // } catch (dbErr) {
        //     console.warn("[DashboardController] Could not fetch revenue:", dbErr.message);
        // }

        // --- Active QR Codes ---
        // Uncomment and update when the QR codes table is available:
        // try {
        //     const qrCount = await F_Select(0, `SELECT COUNT(*) AS TOTAL FROM YOUR_QR_CODES_TABLE WHERE STATUS = 'ACTIVE'`, []);
        //     activeQRCodes = (qrCount && qrCount.length > 0) ? qrCount[0].TOTAL : 0;
        // } catch (dbErr) {
        //     console.warn("[DashboardController] Could not fetch QR count:", dbErr.message);
        // }

        // ---- Render dashboard with metrics ----
        return res.render("pages/dashboard", {
            title: "Dashboard | Synergic Pay",
            user: req.user,
            metrics: {
                totalUsers,
                totalTransactions,
                totalRevenue,
                activeQRCodes
            }
        });

    } catch (err) {
        console.error("[DashboardController] renderDashboard Error:", err.message);
        return res.render("pages/dashboard", {
            title: "Dashboard | Synergic Pay",
            user: req.user,
            metrics: {
                totalUsers: 0,
                totalTransactions: 0,
                totalRevenue: 0,
                activeQRCodes: 0
            }
        });
    }
}

module.exports = {
    renderDashboard
};
