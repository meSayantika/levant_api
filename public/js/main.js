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
    //  SIDEBAR TOGGLE (Mobile)
    // ============================================
    $("#sidebarToggleBtn").on("click", function () {
        $("#sidebarNav").toggleClass("show");
        $(".sp-sidebar-overlay").toggleClass("show");
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
});
