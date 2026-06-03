/**
 * =============================================
 * SYNERGIC PAY - Menu Management Controller
 * =============================================
 */

const { F_Select, F_Insert } = require("../../models/oracleModel");
const logger = require("../../utils/logger");

/**
 * GET /admin/menu-management
 * Renders the menu management form. Fetches parent menus for the dropdown.
 */
async function renderMenuManagement(req, res) {
    try {
        // Fetch all parent menus to populate the "Parent ID" dropdown
        const parentMenus = await F_Select(0, `SELECT ID, LABEL_NAME, KEY_ID FROM MD_MENU WHERE MENU_TYPE = 'P' AND ACTIVE_FLAG = 'Y' ORDER BY SL_NO`);
        
        // Fetch ALL menus so frontend can calculate the next KEY_ID
        const allMenus = await F_Select(0, `SELECT ID, KEY_ID, PARENT_ID, MENU_TYPE FROM MD_MENU WHERE ACTIVE_FLAG = 'Y'`);

        return res.render("pages/menu-management", {
            title: "Menu Management | Synergic Pay",
            currentRoute: "/admin/menu-management",
            parentMenus: parentMenus || [],
            allMenus: allMenus || []
        });
    } catch (err) {
        logger.error(`[Menu Controller] Error rendering menu management: ${err.message}`);
        return res.render("pages/menu-management", {
            title: "Menu Management | Synergic Pay",
            currentRoute: "/admin/menu-management",
            parentMenus: [],
            allMenus: [],
            error: "Failed to load menus."
        });
    }
}

/**
 * POST /admin/api/menu/create
 * Creates a new menu in MD_MENU and assigns it to TD_USER_MENU
 */
async function processCreateMenu(req, res) {
    try {
        const { labelName, link, keyId, menuType, parentId, slNo, userTypes } = req.body;

        if (!labelName || !link || !keyId || !menuType || !slNo) {
            return res.json({ success: false, message: "Missing required fields." });
        }

        if (!userTypes || userTypes.length === 0) {
            return res.json({ success: false, message: "Please select at least one User Type to assign the menu to." });
        }

        // 1. Generate new ID for MD_MENU
        const maxMenuIdResult = await F_Select(0, `SELECT NVL(MAX(ID), 0) + 1 AS NEXT_ID FROM MD_MENU`);
        const nextMenuId = maxMenuIdResult[0].NEXT_ID;

        // Determine HAS_CHILD (always 'N' initially when creating a child or simple parent)
        // If creating a Parent that will have children, user can set it up, but for now we default to 'N' or ask
        // Wait, if we are creating a Parent, we should assume it could have children, or let them specify. Let's just set it to 'N' and update later, or let the form dictate it.
        const hasChild = req.body.hasChild === 'true' ? 'Y' : 'N';

        // 2. Insert into MD_MENU
        const insertMenuQry = `
            INSERT INTO MD_MENU (
                ID, SL_NO, KEY_ID, ICON_NAME, LINK, LABEL_NAME, 
                MENU_TYPE, HAS_CHILD, PARENT_ID, ACTIVE_FLAG, CREATED_BY, CREATED_DT
            ) VALUES (
                :id, :slNo, :keyId, NULL, :link, :labelName,
                :menuType, :hasChild, :parentId, 'Y', :createdBy, SYSTIMESTAMP
            )
        `;
        
        await F_Insert(0, insertMenuQry, {
            id: nextMenuId,
            slNo: slNo,
            keyId: keyId,
            link: link,
            labelName: labelName,
            menuType: menuType,
            hasChild: hasChild,
            parentId: menuType === 'P' ? 0 : (parentId || 0),
            createdBy: req.user.username || 'ADMIN'
        });

        // 3. Update the Parent's HAS_CHILD to 'Y' if we just added a child to it!
        if (menuType === 'C' && parentId) {
            await F_Insert(0, `UPDATE MD_MENU SET HAS_CHILD = 'Y' WHERE ID = :parentId`, { parentId: parentId });
        }

        // 4. Generate starting ID for TD_USER_MENU and insert multiple rows
        const maxUserMenuIdResult = await F_Select(0, `SELECT NVL(MAX(ID), 0) + 1 AS NEXT_ID FROM TD_USER_MENU`);
        let nextUserMenuId = maxUserMenuIdResult[0].NEXT_ID;

        const insertUserMenuQry = `
            INSERT INTO TD_USER_MENU (
                ID, USER_TYPE_ID, MENU_ID, ACTIVE_FLAG, CREATED_BY, CREATED_AT
            ) VALUES (
                :id, :userTypeId, :menuId, 'Y', :createdBy, SYSTIMESTAMP
            )
        `;

        // Parse userTypes array (it comes as an array of 'A', 'S', etc.)
        const parsedUserTypes = Array.isArray(userTypes) ? userTypes : [userTypes];

        for (let uType of parsedUserTypes) {
            await F_Insert(0, insertUserMenuQry, {
                id: nextUserMenuId,
                userTypeId: uType,
                menuId: nextMenuId,
                createdBy: req.user.username || 'ADMIN'
            });
            nextUserMenuId++;
        }

        logger.info(`[Menu Controller] Successfully created new menu: ${labelName} (ID: ${nextMenuId})`);
        return res.json({ success: true, message: `Menu '${labelName}' created successfully!` });

    } catch (err) {
        logger.error(`[Menu Controller] Create Menu Error: ${err.message}`);
        return res.json({ success: false, message: "An error occurred while creating the menu." });
    }
}

module.exports = {
    renderMenuManagement,
    processCreateMenu
};
