/*
 * Shared site chrome: <site-header> and <site-footer> custom elements.
 * One source of truth for the nav and footer across every page — add a new
 * page and it gets both by dropping the two tags in. No build step needed.
 * (Styling lives in site.css under header.site / footer.site.)
 */
(function () {
  var page = location.pathname.split('/').pop() || 'index.html';

  function link(href, label, cls) {
    var current = href.replace(/^\//, '').split('#')[0] || 'index.html';
    var isCurrent = current === page && href.indexOf('#') === -1;
    return (
      '<a href="' + href + '"' +
      (cls ? ' class="' + cls + '"' : '') +
      (isCurrent ? ' aria-current="page"' : '') +
      '>' + label + '</a>'
    );
  }

  class SiteHeader extends HTMLElement {
    connectedCallback() {
      this.innerHTML =
        '<header class="site"><div class="wrap header-inner">' +
        '<a href="/" class="logo"><img src="/wordmark.svg" alt="V-Tune" /></a>' +
        '<nav class="header-links">' +
        link('/#download', 'Download') +
        link('/pricing.html', 'Pricing') +
        link('/#features', 'Features', 'hide-sm') +
        link('/V-Tune-User-Guide.pdf', 'Guide', 'hide-sm') +
        link('https://app.vtune-app.com', 'Web App') +
        link('mailto:support@vtune-app.com', 'Support') +
        '<button class="nav-close" aria-label="Close menu">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
        '</nav>' +
        '<button class="nav-toggle" aria-label="Menu" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>' +
        '</button>' +
        '</div></header>';

      // Burger behaviour: toggle, close on any link tap, close on Escape.
      var nav = this.querySelector('.header-links');
      var toggle = this.querySelector('.nav-toggle');
      var close = this.querySelector('.nav-close');
      function setOpen(open) {
        nav.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.classList.toggle('nav-open', open);
      }
      toggle.addEventListener('click', function () {
        setOpen(!nav.classList.contains('open'));
      });
      close.addEventListener('click', function () { setOpen(false); });
      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') setOpen(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setOpen(false);
      });
    }
  }

  class SiteFooter extends HTMLElement {
    connectedCallback() {
      this.innerHTML =
        '<footer class="site"><div class="wrap footer-inner">' +
        '<div class="col-links">' +
        link('/#download', 'Download') +
        link('/pricing.html', 'Pricing') +
        link('/V-Tune-User-Guide.pdf', 'User Guide') +
        link('/terms.html', 'Terms') +
        link('/privacy.html', 'Privacy') +
        link('/refunds.html', 'Refunds') +
        link('https://app.vtune-app.com', 'Web App') +
        link('mailto:support@vtune-app.com', 'Support') +
        '</div>' +
        '<div class="credit">V-Tune · made for precision handpan tuning</div>' +
        '</div></footer>';
    }
  }

  customElements.define('site-header', SiteHeader);
  customElements.define('site-footer', SiteFooter);
})();
