require('dotenv').config();
const { F_Select } = require('./models/oracleModel');

async function run() {
    try {
        const query = `SELECT COUNT(*) AS TOTAL FROM SUB_MERCHANTS`;
        const result = await F_Select(0, query, {});
        console.log("Total Merchants:", result[0].TOTAL);
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
