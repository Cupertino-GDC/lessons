/* ==========================================================================
   primary.js — vendored Cupertino GDC chrome + helpers
   Mirrors github.com/Cupertino-GDC/Cupertino-GDC.github.io js/primary.js and
   injects the shared navbar/footer so the three pages stay in sync.
   ========================================================================== */

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Bootstrap's collapse leaves the fixed navbar at 75px; the live GDC site
   grows it manually when the hamburger opens. Same behaviour here. */
function stretchNavbar() {
    var navbarDiv = document.getElementById('navbar-div');
    if (!navbarDiv) return;

    if (navbarDiv.style.height === '75px' || navbarDiv.style.height === '') {
        navbarDiv.style.height = '400px';
    } else {
        navbarDiv.style.height = '75px';
    }
}

function onMobile() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

var GDC_NAV_LINKS = [
    { label: 'Lessons', href: 'index.html', key: 'lessons' },
    { label: 'About', href: 'https://gamedevclub.tech/about.html' },
    { label: 'Events', href: 'https://gamedevclub.tech/events.html' },
    { label: 'Projects', href: 'https://gamedevclub.tech/projects.html' },
    { label: 'Team', href: 'https://gamedevclub.tech/team.html' },
    { label: 'MelonJam', href: 'https://gamedevclub.tech/melonjam/' }
];

function renderNavbar(activeKey) {
    var host = document.querySelector('[data-gdc-navbar]');
    if (!host) return;

    var items = GDC_NAV_LINKS.map(function (link) {
        var active = link.key && link.key === activeKey;
        return (
            '<li class="nav-item">' +
            '<a class="navbutton' + (active ? ' active' : '') + '" href="' + link.href + '"' +
            (active ? ' aria-current="page"' : '') + '>' + link.label + '</a>' +
            '</li>'
        );
    }).join('');

    host.id = 'navbar-div';
    host.innerHTML =
        /* expand-xl, not the club's -md: the six nav items plus the logo need
           ~1107px before they fit on one row, so anything below 1200 gets the
           hamburger. See the 1400px margin breakpoint in primary.css. */
        '<nav class="navbar navbar-expand-xl bg-transparent navbar-light">' +
        '<a class="navbar-brand" href="https://gamedevclub.tech/">' +
        '<img src="imgs/GDCLogo_Web.png" alt="Cupertino Game Dev Club" id="navbar-logo">' +
        '</a>' +
        '<button class="navbar-toggler navbar-toggler-right" type="button" data-toggle="collapse" ' +
        'data-target="#collapsibleNavbar" aria-controls="collapsibleNavbar" aria-expanded="false" ' +
        'aria-label="Toggle navigation" onclick="stretchNavbar()">' +
        '<span class="navbar-toggler-icon"></span>' +
        '</button>' +
        '<div class="collapse navbar-collapse navbar-toggleable-sm" id="collapsibleNavbar">' +
        '<ul class="navbar-nav">' + items + '</ul>' +
        '</div>' +
        '</nav>';
}

function renderFooter() {
    var host = document.querySelector('[data-gdc-footer]');
    if (!host) return;

    host.id = 'footer';
    host.innerHTML =
        '<div id="footer-left">' +
        '<h1 style="font-family: \'Montserrat\', sans-serif; font-weight: 700; font-size: 64px;">Game Dev Club</h1>' +
        '<h1>Room 314, Mr. McLeod</h1>' +
        '<br><br>' +
        '<h2>Cupertino High School</h2>' +
        '<h3 style="font-weight: 300;">10100 Finch Avenue,<br>Cupertino, CA 95014</h3>' +
        '</div>' +
        '<div id="footer-middle">' +
        '<h4 style="font-weight: 700;">Pages:</h4><br>' +
        '<a href="https://gamedevclub.tech/" class="footer-link">Home</a><br><br>' +
        '<a href="index.html" class="footer-link">Lessons</a><br><br>' +
        '<a href="editor.html" class="footer-link">Lesson Editor</a><br><br>' +
        '<a href="https://gamedevclub.tech/events.html" class="footer-link">Events</a><br><br>' +
        '<a href="https://gamedevclub.tech/team.html" class="footer-link">Team</a><br><br>' +
        '</div>' +
        '<div id="footer-right">' +
        '<h1>Contact Us!</h1><br>' +
        '<a href="mailto:cupertinogamedev@gmail.com" class="email-button">' +
        '<i class="fa-regular fa-envelope" aria-hidden="true"></i> Email Us!</a>' +
        '<a href="https://www.instagram.com/cupertinogamedevclub/" target="_blank" rel="noopener" class="instagram-button">' +
        '<i class="fa-brands fa-instagram" aria-hidden="true"></i> Instagram</a>' +
        '<a href="https://discord.gg/kznbpbJBn2" target="_blank" rel="noopener" class="discord-button">' +
        '<i class="fa-brands fa-discord" aria-hidden="true"></i> Discord</a>' +
        '</div>';
}

function initChrome(activeKey) {
    renderNavbar(activeKey);
    renderFooter();
}

document.addEventListener('DOMContentLoaded', function () {
    initChrome(document.body.getAttribute('data-page'));
});
