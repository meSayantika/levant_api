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
        let totalSubMerchants = 0;
        let totalTransactions = 0;
        let totalRevenue = 0;
        let activeQRCodes = 0;
        let chartData = { labels: [], data: [] };

        // --- Sub Merchant count & Graph Data ---
        try {
            const subCount = await F_Select(0, `SELECT COUNT(*) AS TOTAL FROM SUB_MERCHANTS`, []);
            totalSubMerchants = (subCount && subCount.length > 0) ? subCount[0].TOTAL : 0;

            const graphQuery = `
                SELECT TO_CHAR(CREATED_AT, 'DD-Mon') AS LABEL, COUNT(*) AS CNT
                FROM SUB_MERCHANTS
                WHERE CREATED_AT >= TRUNC(SYSDATE) - 6
                GROUP BY TO_CHAR(CREATED_AT, 'DD-Mon')
                ORDER BY MIN(CREATED_AT) ASC
            `;
            const graphResult = await F_Select(0, graphQuery, []);
            if (graphResult && graphResult.length > 0) {
                chartData.labels = graphResult.map(row => row.LABEL);
                chartData.data = graphResult.map(row => row.CNT);
            }
        } catch (dbErr) {
            console.warn("[DashboardController] Could not fetch submerchant count:", dbErr.message);
        }

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
                totalSubMerchants,
                totalTransactions,
                totalRevenue,
                activeQRCodes,
                chartData
            }
        });

    } catch (err) {
        console.error("[DashboardController] renderDashboard Error:", err.message);
        return res.render("pages/dashboard", {
            title: "Dashboard | Synergic Pay",
            user: req.user,
            metrics: {
                totalSubMerchants: 0,
                totalTransactions: 0,
                totalRevenue: 0,
                activeQRCodes: 0,
                chartData: { labels: [], data: [] }
            }
        });
    }
}

module.exports = {
    renderDashboard
};
