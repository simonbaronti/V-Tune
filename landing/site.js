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
        '</nav></div></header>';
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
