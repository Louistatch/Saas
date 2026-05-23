/**
 * FaîtiereHub Embed SDK v1.0
 * 
 * Usage:
 *   <div id="faitierehub-widget"></div>
 *   <script src="https://app.faitierehub.com/embed/faitierehub-embed.js"></script>
 *   <script>
 *     FaitierehHub.init({
 *       cooperativeId: 'your-cooperative-uuid',
 *       widget: 'marketplace', // marketplace | member_verify | fiches | dashboard
 *       container: '#faitierehub-widget',
 *       theme: { primaryColor: '#16a34a' } // optional override
 *     });
 *   </script>
 */
(function() {
  'use strict';

  var API_BASE = (function() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf('faitierehub-embed') !== -1) {
        var url = new URL(scripts[i].src);
        return url.origin;
      }
    }
    return 'https://app.faitierehub.com';
  })();

  var FaitierehHub = {
    _instances: [],

    init: function(config) {
      if (!config.cooperativeId) {
        console.error('[FaitierehHub] cooperativeId is required');
        return;
      }

      var container = typeof config.container === 'string'
        ? document.querySelector(config.container)
        : config.container;

      if (!container) {
        console.error('[FaitierehHub] Container not found:', config.container);
        return;
      }

      var widget = config.widget || 'marketplace';
      var instance = { config: config, container: container, widget: widget };
      this._instances.push(instance);

      // Create iframe
      var iframe = document.createElement('iframe');
      var params = new URLSearchParams({
        cooperative_id: config.cooperativeId,
        widget: widget,
      });

      if (config.theme) {
        params.set('theme', JSON.stringify(config.theme));
      }

      iframe.src = API_BASE + '/embed/widget?' + params.toString();
      iframe.style.cssText = 'width:100%;border:none;min-height:400px;border-radius:8px;';
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('title', 'FaitierehHub ' + widget);
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');

      // Auto-resize via postMessage
      window.addEventListener('message', function(event) {
        if (event.origin !== API_BASE) return;
        try {
          var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data.type === 'faitierehub:resize' && data.height) {
            iframe.style.height = data.height + 'px';
          }
          if (data.type === 'faitierehub:navigate' && data.url) {
            window.open(data.url, '_blank');
          }
        } catch (e) {}
      });

      container.innerHTML = '';
      container.appendChild(iframe);
      instance.iframe = iframe;

      return instance;
    },

    destroy: function(instance) {
      if (instance && instance.iframe) {
        instance.iframe.remove();
      }
      this._instances = this._instances.filter(function(i) { return i !== instance; });
    },

    destroyAll: function() {
      this._instances.forEach(function(instance) {
        if (instance.iframe) instance.iframe.remove();
      });
      this._instances = [];
    }
  };

  // Expose globally
  window.FaitierehHub = FaitierehHub;

  // Auto-init from data attributes
  document.addEventListener('DOMContentLoaded', function() {
    var elements = document.querySelectorAll('[data-faitierehub]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      FaitierehHub.init({
        cooperativeId: el.getAttribute('data-cooperative-id'),
        widget: el.getAttribute('data-widget') || 'marketplace',
        container: el,
        theme: el.getAttribute('data-theme') ? JSON.parse(el.getAttribute('data-theme')) : undefined,
      });
    }
  });
})();
