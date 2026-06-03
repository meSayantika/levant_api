/**
 * =============================================
 * SYNERGIC PAY - Menu Fetching Middleware
 * =============================================
 * 
 * Dynamically fetches the role-based sidebar menus from the Oracle DB
 * based on the authenticated user's USER_TYPE.
 */

const { F_Select } = require("../models/oracleModel");
const logger = require("../utils/logger");

async function fetchUserMenu(req, res, next) {
    try {
        // If not authenticated or missing userType, return empty menus
        if (!req.user || !req.user.userType) {
            res.locals.menus = [];
            return next();
        }

        const userTypeId = req.user.userType; // 'A' or 'S' (since USER_TYPE_ID was changed to VARCHAR)

        // Base query components
        const select = `a.user_type_id, a.menu_id, b.menu_type, b.sl_no, b.key_id as "key", 
                        b.icon_name as "icon", b.link, b.label_name as "label", b.has_child, b.parent_id`;
        const table_name = `td_user_menu a, md_menu b`;
        const order = `ORDER BY b.sl_no`;

        // 1. Fetch Parent Menus (menu_type = 'P')
        const parentWhr = `a.menu_id=b.id AND b.menu_type = 'P' AND a.user_type_id = :userTypeId AND a.active_flag = 'Y' AND b.active_flag = 'Y'`;
        
        // F_Select returns an array of row objects directly
        let parent_menu_list = await F_Select(0, `SELECT ${select} FROM ${table_name} WHERE ${parentWhr} ${order}`, { userTypeId });

        if (parent_menu_list && parent_menu_list.length > 0) {
            for (let dt of parent_menu_list) {
                dt.children = [];
                
                if (dt.HAS_CHILD !== 'N') {
                    // 2. Fetch Child Menus (menu_type = 'C')
                    const childWhr = `a.menu_id=b.id AND b.menu_type = 'C' AND a.user_type_id = :userTypeId AND b.parent_id = :parentId AND a.active_flag = 'Y' AND b.active_flag = 'Y'`;
                    let child_menu_list = await F_Select(0, `SELECT ${select} FROM ${table_name} WHERE ${childWhr} ${order}`, { 
                        userTypeId: userTypeId, 
                        parentId: dt.MENU_ID 
                    });

                    if (child_menu_list && child_menu_list.length > 0) {
                        for (let cdt of child_menu_list) {
                            cdt.children = [];
                            
                            if (cdt.HAS_CHILD !== 'N') {
                                // 3. Fetch Sub-Child Menus
                                const subChildWhr = `a.menu_id=b.id AND b.menu_type = 'C' AND a.user_type_id = :userTypeId AND b.parent_id = :parentId AND a.active_flag = 'Y' AND b.active_flag = 'Y'`;
                                let sub_child_menu_list = await F_Select(0, `SELECT ${select} FROM ${table_name} WHERE ${subChildWhr} ${order}`, { 
                                    userTypeId: userTypeId, 
                                    parentId: cdt.MENU_ID 
                                });
                                
                                if (sub_child_menu_list && sub_child_menu_list.length > 0) {
                                    cdt.children = sub_child_menu_list;
                                }
                            }
                        }
                        dt.children = child_menu_list;
                    }
                }
            }
            res.locals.menus = parent_menu_list;
        } else {
            res.locals.menus = [];
        }

        next();
    } catch (err) {
        logger.error(`[Menu Middleware] Error fetching dynamic menus: ${err.message}`);
        res.locals.menus = []; // Fallback to empty menu to prevent crash
        next();
    }
}

module.exports = { fetchUserMenu };
