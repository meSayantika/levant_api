/**
 * =============================================
 * SYNERGIC PAY - Global Client-Side JavaScript
 * =============================================
 * 
 * All DOM interactions use jQuery (no vanilla JS).
 * Bootstrap 5 JS is loaded via CDN in layout.ejs.
 */

$(document).ready(function () {

    // ============================================
    //  SIDEBAR TOGGLE (Mobile & Desktop)
    // ============================================
    $("#sidebarToggleBtn").on("click", function () {
        // Mobile toggle
        $("#sidebarNav").toggleClass("show");
        $(".sp-sidebar-overlay").toggleClass("show");
        
        // Desktop collapse toggle
        $("body").toggleClass("sidebar-collapsed");
    });

    // Close sidebar when overlay is clicked
    $(document).on("click", ".sp-sidebar-overlay", function () {
        $("#sidebarNav").removeClass("show");
        $(this).removeClass("show");
    });

    // Inject the overlay element if not present
    if ($(".sp-sidebar-overlay").length === 0) {
        $("body").append('<div class="sp-sidebar-overlay"></div>');
    }

    // ============================================
    //  ACTIVE NAV LINK HIGHLIGHTING
    // ============================================
    var currentPath = window.location.pathname;
    $(".sp-nav-link").each(function () {
        var linkHref = $(this).attr("href");
        if (linkHref && currentPath.indexOf(linkHref) === 0) {
            $(".sp-nav-link").removeClass("active");
            $(this).addClass("active");
        }
    });

    // ============================================
    //  DASHBOARD REFRESH BUTTON
    // ============================================
    $("#refreshDashboard").on("click", function () {
        var $icon = $(this).find("i");
        $icon.addClass("spin-animation");

        // Reload page after a brief visual feedback
        setTimeout(function () {
            window.location.reload();
        }, 500);
    });

    // ============================================
    //  TOOLTIP INITIALIZATION
    // ============================================
    var tooltipTriggerList = $('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.each(function () {
        new bootstrap.Tooltip(this);
    });

    // ============================================
    //  SMOOTH CARD ENTRANCE (intersection observer)
    // ============================================
    if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(function (entries) {
            $.each(entries, function (i, entry) {
                if (entry.isIntersecting) {
                    $(entry.target).addClass("visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        $(".sp-stat-card").each(function () {
            observer.observe(this);
        });
    }

});

// ============================================
//  CSS for spin animation (injected via jQuery)
// ============================================
$(function () {
    $("<style>")
        .prop("type", "text/css")
        .html(
            "@keyframes spinRefresh { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }" +
            ".spin-animation { animation: spinRefresh 0.5s linear; }"
        )
        .appendTo("head");

    // ============================================
    //  SUB-MERCHANT WIZARD NAVIGATION (Event Delegation)
    // ============================================
    // Since pages load via AJAX, we MUST use event delegation on document.
    $(document).on("click", "#next-to-business, #prev-to-personal, #next-to-location, #prev-to-business", function() {
        var id = $(this).attr("id");

        function switchTab(currentPaneId, nextTabBtnId, nextPaneId, validate) {
            if (validate) {
                var p = document.getElementById(currentPaneId);
                if (p) {
                    var inv = p.querySelectorAll('input:invalid,select:invalid,textarea:invalid');
                    if (inv.length > 0) {
                        inv[0].reportValidity();
                        return;
                    }
                }
            }
            $('#merchantTabs .nav-link').removeClass('active');
            $('#merchantTabsContent .tab-pane').removeClass('show active');
            
            $('#' + nextTabBtnId).addClass('active').removeAttr('disabled');
            $('#' + nextPaneId).addClass('show active');
        }

        if (id === 'next-to-business') switchTab('personal-tab-pane', 'business-tab', 'business-tab-pane', true);
        else if (id === 'prev-to-personal') switchTab(null, 'personal-tab', 'personal-tab-pane', false);
        else if (id === 'next-to-location') switchTab('business-tab-pane', 'location-tab', 'location-tab-pane', true);
        else if (id === 'prev-to-business') switchTab(null, 'business-tab', 'business-tab-pane', false);
    });

    $(document).on("input", "#phone", function(e) {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').substring(0, 10);
    });

    $(document).on("input", "#address", function(e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9\s,.-]/g, '');
    });

    $(document).on("input", "#business_address", function(e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9\s]/g, '');
    });

    // ============================================
    //  STATE DROPDOWN INTERNAL API FETCH
    // ============================================
    
    // ============================================
    //  STATE DROPDOWN INTERNAL API FETCH
    // ============================================
    var cachedStates = null;
    
    // Fetch states from the local proxy router (master.js) to avoid CORS
    $.ajax({
        url: '/admin/master/states',
        method: 'GET',
        success: function(response) {
            if (response && response.status && response.data) {
                cachedStates = response.data;
            }
        },
        error: function(err) {
            console.error("Error fetching states from master API:", err);
        }
    });

    // ============================================
    //  CATEGORY DROPDOWN INTERNAL API FETCH
    // ============================================
    var cachedCategories = null;
    
    // Fetch categories from the local proxy router
    $.ajax({
        url: '/admin/master/categories',
        method: 'GET',
        success: function(response) {
            if (response && response.status && response.data) {
                cachedCategories = response.data;
            } else if (response && response.data) {
                cachedCategories = response.data;
            } else if (Array.isArray(response)) {
                cachedCategories = response;
            }
        },
        error: function(err) {
            console.error("Error fetching categories from master API:", err);
        }
    });

    // ============================================
    //  BUSINESS TYPES DROPDOWN INTERNAL API FETCH
    // ============================================
    var cachedBusinessTypes = null;
    
    $.ajax({
        url: '/admin/master/business-types',
        method: 'GET',
        success: function(response) {
            if (response && response.status && response.data) {
                cachedBusinessTypes = response.data;
            } else if (response && response.data) {
                cachedBusinessTypes = response.data;
            } else if (Array.isArray(response)) {
                cachedBusinessTypes = response;
            }
        },
        error: function(err) {
            console.error("Error fetching business types from master API:", err);
        }
    });

    // Initialize Select2 Dynamically when the user interacts with the container
    // This perfectly supports AJAX loaded dashboards!
    $(document).on('mouseenter click focus', '#subMerchantForm .material-outline', function() {
        var $stateSelect = $(this).find('select#state');
        
        if ($stateSelect.length > 0 && !$stateSelect.hasClass('select2-hidden-accessible')) {
            // 1. Populate options
            if (cachedStates && $stateSelect.children('option').length <= 1) {
                cachedStates.forEach(function(state) {
                    $stateSelect.append($('<option>', {
                        value: state.name,
                        text: state.name
                    }));
                });
            }
            
            // 2. Initialize Gorgeous Select2
            if ($.fn.select2) {
                $stateSelect.closest('.material-outline').addClass('has-select2');
                $stateSelect.select2({
                    theme: 'bootstrap-5',
                    width: '100%',
                    placeholder: '' // Placeholder left empty so the material label works
                });

                // Add focus classes for floating label color
                $stateSelect.on('select2:open', function() {
                    $(this).closest('.material-outline').addClass('select2-focused');
                });
                $stateSelect.on('select2:close', function() {
                    $(this).closest('.material-outline').removeClass('select2-focused');
                });
            }
        }
        
        var $catSelect = $(this).find('select#nature_of_business');
        if ($catSelect.length > 0 && !$catSelect.hasClass('select2-hidden-accessible')) {
            // 1. Populate options
            if (cachedCategories && $catSelect.children('option').length <= 1) {
                var catArray = Array.isArray(cachedCategories) ? cachedCategories : (cachedCategories.data || []);
                catArray.forEach(function(cat) {
                    var val = cat.name || cat.category_name || cat.nature_of_business || cat.category_code || cat;
                    $catSelect.append($('<option>', {
                        value: val,
                        text: val
                    }));
                });
            }
            
            // 2. Initialize Gorgeous Select2
            if ($.fn.select2) {
                $catSelect.closest('.material-outline').addClass('has-select2');
                $catSelect.select2({
                    theme: 'bootstrap-5',
                    width: '100%',
                    placeholder: '' // Placeholder left empty so the material label works
                });

                // Add focus classes for floating label color
                $catSelect.on('select2:open', function() {
                    $(this).closest('.material-outline').addClass('select2-focused');
                });
                $catSelect.on('select2:close', function() {
                    $(this).closest('.material-outline').removeClass('select2-focused');
                });
            }
        }

        var $catCodeSelect = $(this).find('select#category_code');
        if ($catCodeSelect.length > 0 && !$catCodeSelect.hasClass('select2-hidden-accessible')) {
            if (cachedCategories && $catCodeSelect.children('option').length <= 1) {
                var catArray = Array.isArray(cachedCategories) ? cachedCategories : (cachedCategories.data || []);
                catArray.forEach(function(cat) {
                    var val = cat.category_code || cat.code || cat.id || cat.name || cat.category_name || cat;
                    $catCodeSelect.append($('<option>', {
                        value: val,
                        text: val
                    }));
                });
            }
            if ($.fn.select2) {
                $catCodeSelect.closest('.material-outline').addClass('has-select2');
                $catCodeSelect.select2({ theme: 'bootstrap-5', width: '100%', placeholder: '' });
                $catCodeSelect.on('select2:open', function() { $(this).closest('.material-outline').addClass('select2-focused'); });
                $catCodeSelect.on('select2:close', function() { $(this).closest('.material-outline').removeClass('select2-focused'); });
            }
        }

        var $bizTypeSelect = $(this).find('select#business_type_code');
        if ($bizTypeSelect.length > 0 && !$bizTypeSelect.hasClass('select2-hidden-accessible')) {
            if (cachedBusinessTypes && $bizTypeSelect.children('option').length <= 1) {
                var btArray = Array.isArray(cachedBusinessTypes) ? cachedBusinessTypes : (cachedBusinessTypes.data || []);
                btArray.forEach(function(bt) {
                    var val = bt.business_type_code || bt.code || bt.name || bt.type_name || bt;
                    $bizTypeSelect.append($('<option>', {
                        value: val,
                        text: val
                    }));
                });
            }
            if ($.fn.select2) {
                $bizTypeSelect.closest('.material-outline').addClass('has-select2');
                $bizTypeSelect.select2({ theme: 'bootstrap-5', width: '100%', placeholder: '' });
                $bizTypeSelect.on('select2:open', function() { $(this).closest('.material-outline').addClass('select2-focused'); });
                $bizTypeSelect.on('select2:close', function() { $(this).closest('.material-outline').removeClass('select2-focused'); });
            }
        }
    });
});
