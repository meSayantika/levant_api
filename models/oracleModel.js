/**
 * =============================================
 * SYNERGIC PAY - Global Oracle DML Module
 * =============================================
 * 
 * Provides globally reusable database functions that 
 * dynamically create/reuse Oracle connection pools 
 * based on DB ID (0, 1, 2).
 * 
 * Exports: F_Select, F_Insert, RunProcedure, F_Delete, F_insert_bulk_data
 */

const oracledb = require("oracledb");
const conString = require("../config/conString");

// ---- Initialize Oracle Client (Thick mode if needed) ----
try {
    oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_URL });
    console.log("[OracleModel] Thick mode initialized with client at:", process.env.ORACLE_CLIENT_URL);
} catch (err) {
    // If already initialized, this is safe to ignore.
    // But if the path is wrong, it will silently fall back to Thin mode!
    console.warn("[OracleModel] initOracleClient warning:", err.message);
}

// Set default fetch type for CLOBs as strings
oracledb.fetchAsString = [oracledb.CLOB];

// ---- Pool Cache ----
const poolCache = {};

/**
 * Get or create an Oracle connection pool for the given DB ID.
 * @param {number} dbId - Database identifier (0, 1, or 2)
 * @returns {Promise<oracledb.Pool>}
 */
async function getPool(dbId) {
    const poolAlias = `pool_${dbId}`;

    // Return existing pool if already created and cached
    if (poolCache[poolAlias]) {
        try {
            // Verify the cached pool is still open/valid
            if (poolCache[poolAlias].status === oracledb.POOL_STATUS_OPEN) {
                return poolCache[poolAlias];
            }
            // Pool exists in cache but is not open — remove stale entry
            delete poolCache[poolAlias];
        } catch (e) {
            delete poolCache[poolAlias];
        }
    }

    // Check oracledb internal cache directly to prevent NJS-046
    try {
        const existingPool = oracledb.getPool(poolAlias);
        if (existingPool) {
            if (existingPool.status === oracledb.POOL_STATUS_OPEN) {
                poolCache[poolAlias] = existingPool;
                return existingPool;
            } else {
                try { 
                    await existingPool.close(0); 
                } catch (closeErr) { 
                    console.warn(`[OracleModel] Warning: Could not close stale pool ${poolAlias}:`, closeErr.message); 
                }
            }
        }
    } catch (getErr) {
        // Safe to ignore: pool doesn't exist internally yet.
        // We log it at debug level just in case.
        if (getErr.message && !getErr.message.includes('NJS-047')) {
            console.debug(`[OracleModel] getPool check for ${poolAlias}:`, getErr.message);
        }
    }

    const config = conString[dbId];
    if (!config) {
        throw new Error(`[OracleModel] No connection config found for DB ID: ${dbId}`);
    }

    try {
        const pool = await oracledb.createPool({
            user: config.user,
            password: config.password,
            connectString: config.connectionString,
            poolMax: config.poolMax,
            poolMin: config.poolMin,
            poolIncrement: config.poolIncrement,
            poolAlias: poolAlias
        });

        poolCache[poolAlias] = pool;
        console.log(`[OracleModel] Connection pool created for DB ID: ${dbId}`);
        return pool;
    } catch (err) {
        // Fallback: NJS-046 pool alias already exists in the oracledb internal cache
        if (err.message && err.message.includes('NJS-046')) {
            try {
                const existingPool = oracledb.getPool(poolAlias);
                if (existingPool && existingPool.status === oracledb.POOL_STATUS_OPEN) {
                    poolCache[poolAlias] = existingPool;
                    console.log(`[OracleModel] Recovered existing pool for DB ID: ${dbId}`);
                    return existingPool;
                }
                // Pool exists but is not open — close it and let the caller retry
                try { await existingPool.close(0); } catch (closeErr) { /* ignore */ }
            } catch (getErr) {
                // Could not retrieve the pool either — nothing more we can do
            }
        }

        console.error(`[OracleModel] Failed to create pool for DB ID: ${dbId}`, err.message);
        throw err;
    }
}

/**
 * Execute a SELECT query and return rows.
 * @param {number} dbId - Database identifier
 * @param {string} query - SQL SELECT statement
 * @param {Array} params - Bind parameters (default: [])
 * @returns {Promise<Array>} - Array of row objects
 */
async function F_Select(dbId, query, params = []) {
    let connection;
    try {
        const pool = await getPool(dbId);
        connection = await pool.getConnection();
        const result = await connection.execute(query, params, {
            outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        return result.rows;
    } catch (err) {
        console.error("[OracleModel] F_Select Error:", err.message);
        throw err;
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { /* ignore */ }
        }
    }
}

/**
 * Execute an INSERT statement.
 * @param {number} dbId - Database identifier
 * @param {string} query - SQL INSERT statement
 * @param {Array} params - Bind parameters (default: [])
 * @returns {Promise<Object>} - Result with rowsAffected
 */
async function F_Insert(dbId, query, params = []) {
    let connection;
    try {
        const pool = await getPool(dbId);
        connection = await pool.getConnection();
        const result = await connection.execute(query, params, {
            autoCommit: true
        });
        return result;
    } catch (err) {
        console.error("[OracleModel] F_Insert Error:", err.message);
        throw err;
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { /* ignore */ }
        }
    }
}

/**
 * Execute a stored procedure.
 * @param {number} dbId - Database identifier
 * @param {string} procedure - PL/SQL block or procedure call
 * @param {Object} bindParams - Named bind parameters
 * @returns {Promise<Object>} - Result object
 */
async function RunProcedure(dbId, procedure, bindParams = {}) {
    let connection;
    try {
        const pool = await getPool(dbId);
        connection = await pool.getConnection();
        const result = await connection.execute(procedure, bindParams, {
            autoCommit: true
        });
        return result;
    } catch (err) {
        console.error("[OracleModel] RunProcedure Error:", err.message);
        throw err;
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { /* ignore */ }
        }
    }
}

/**
 * Execute a DELETE statement.
 * @param {number} dbId - Database identifier
 * @param {string} query - SQL DELETE statement
 * @param {Array} params - Bind parameters (default: [])
 * @returns {Promise<Object>} - Result with rowsAffected
 */
async function F_Delete(dbId, query, params = []) {
    let connection;
    try {
        const pool = await getPool(dbId);
        connection = await pool.getConnection();
        const result = await connection.execute(query, params, {
            autoCommit: true
        });
        return result;
    } catch (err) {
        console.error("[OracleModel] F_Delete Error:", err.message);
        throw err;
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { /* ignore */ }
        }
    }
}

/**
 * Execute a bulk INSERT using executeMany.
 * @param {number} dbId - Database identifier
 * @param {string} query - SQL INSERT statement with bind placeholders
 * @param {Array<Array>} dataArray - Array of bind parameter arrays
 * @param {Object} options - Additional options (bindDefs, etc.)
 * @returns {Promise<Object>} - Result with rowsAffected
 */
async function F_insert_bulk_data(dbId, query, dataArray = [], options = {}) {
    let connection;
    try {
        const pool = await getPool(dbId);
        connection = await pool.getConnection();
        const result = await connection.executeMany(query, dataArray, {
            autoCommit: true,
            ...options
        });
        return result;
    } catch (err) {
        console.error("[OracleModel] F_insert_bulk_data Error:", err.message);
        throw err;
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { /* ignore */ }
        }
    }
}

// ---- Export all DML functions ----
module.exports = {
    F_Select,
    F_Insert,
    RunProcedure,
    F_Delete,
    F_insert_bulk_data
};
