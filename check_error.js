require('dotenv').config();
const fs = require('fs');
const { F_Select } = require('./models/oracleModel');

async function run() {
    try {
        const query = `SELECT * FROM (SELECT CUST_CD, EMAIL, RAW_RESPONSE AS ERR FROM SUB_MERCHANTS WHERE RAW_RESPONSE LIKE '%<script> Sfdump%' ORDER BY CUST_CD DESC) WHERE ROWNUM = 1`;
        const result = await F_Select(0, query, {});
        if(result && result.length > 0) {
            fs.writeFileSync('levant_error.html', result[0].ERR);
            console.log("Written to levant_error.html");
        }
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
