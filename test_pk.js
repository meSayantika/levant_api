const { F_Select } = require('./models/oracleModel.js');
async function test() {
    try {
        const sql = `SELECT cols.column_name FROM all_constraints cons, all_cons_columns cols WHERE cols.table_name = 'SUB_MERCHANTS' AND cons.constraint_type = 'P' AND cons.constraint_name = cols.constraint_name AND cons.owner = cols.owner`;
        const res = await F_Select(0, sql);
        console.log(res);
    } catch(e) {
        console.log("Error:", e);
    }
    process.exit();
}
test();
