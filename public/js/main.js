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

    $(document).on("input", "#address, #business_address", function(e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9\s,.-]/g, '');
    });

    // ============================================
    //  STATE DROPDOWN API INTEGRATION
    // ============================================
    var cachedStates = null;
    
    // Fetch states once and cache them
    $.ajax({
        url: 'https://app.levanttech.in/api/states',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ mid: "21" }),
        success: function(response) {
            if (response && response.status && response.data) {
                cachedStates = response.data;
            }
        },
        error: function(err) {
            console.error("Error fetching states API:", err);
        }
    });

    // Populate the dropdown when the user clicks/focuses it (works even if injected via AJAX later)
    $(document).on('focus mousedown', 'select#state', function() {
        var $select = $(this);
        // Only populate if it hasn't been populated yet (length 1 means only the placeholder exists)
        if ($select.children('option').length <= 1 && cachedStates) {
            cachedStates.forEach(function(state) {
                $select.append($('<option>', {
                    value: state.name,
                    text: state.name
                }));
            });
        }
    });
});
