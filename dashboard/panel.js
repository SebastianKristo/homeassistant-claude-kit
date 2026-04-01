// Custom panel element that embeds the React dashboard in an iframe.
// Uses Vite's build manifest to resolve the current asset hashes,
// then constructs the page via srcdoc so we never serve a stale
// index.html from the browser cache.
//
// IMPORTANT: Uses iframe.srcdoc (not blob: URLs) because blob: iframes
// get a null/opaque origin on iOS Safari/WKWebView, which blocks
// window.top access and prevents inheriting HA's WebSocket connection.
//
// Theme bridging: reads ALL HA CSS custom properties at load time and
// injects them into the iframe. A MutationObserver re-applies them
// whenever HA switches themes at runtime.
class CustomDashboardPanel extends HTMLElement {
  connectedCallback() {
    const base = "/local/custom-dashboard";

    // Style the host element
    this.style.cssText = "display:block;width:100%;height:100%;";

    fetch(`${base}/.vite/manifest.json?_=${Date.now()}`)
      .then((r) => r.json())
      .then((manifest) => {
        const entry = manifest["index.html"];
        if (!entry?.file) throw new Error("no entry in manifest");

        const js = `${base}/${entry.file}`;
        const cssLinks = (entry.css || [])
          .map((c) => `<link rel="stylesheet" href="${base}/${c}">`)
          .join("\n    ");

        // Read initial theme values and inject them into the iframe HTML.
        // panel.js is the only place that can read the parent HA document's
        // computed style — the iframe is a separate browsing context.
        const vars = this._readThemeVars();
        // Light theme: boost text-dim if HA's disabled-text-color is too faint
        if (this._isLightTheme(vars)) {
          const hex = (vars["--color-text-dim"] || "").trim().replace(/^#/, "");
          if (/^[0-9a-f]{6}$/i.test(hex) && parseInt(hex.slice(0,2),16) > 180) {
            vars["--color-text-dim"] = "#666666";
          }
        }
        const colorSchemeAttr = this._isLightTheme(vars) ? ' data-color-scheme="light"' : '';
        const varsCss = Object.entries(vars)
          .map(([k, v]) => `${k}:${v}`)
          .join(";");
        const themeOverride = `<style>:root{${varsCss}}body{background:${vars["--color-bg-primary"]}}</style>`;

        const html = `<!doctype html>
<html lang="en"${colorSchemeAttr}>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="theme-color" content="${vars["--color-bg-primary"]}">
    ${themeOverride}
    ${cssLinks}
</head>
<body>
    <div id="root"></div>
    <script type="module" src="${js}"><\/script>
</body>
</html>`;

        this._appendIframe(html);
      })
      .catch(() => {
        // Fallback: load index.html directly (cache-busted with timestamp)
        const iframe = document.createElement("iframe");
        iframe.src = `${base}/index.html?v=${Date.now()}`;
        iframe.style.cssText = "border:0;width:100%;height:100%;display:block;";
        this.appendChild(iframe);
        this._forwardVisibility(iframe);
      });
  }

  disconnectedCallback() {
    this._observer?.disconnect();
  }

  // Read all HA theme CSS variables we need, with dark-mode fallbacks.
  _readThemeVars() {
    const s = getComputedStyle(document.documentElement);
    const g = (v, fb) => s.getPropertyValue(v).trim() || fb;
    return {
      // Backgrounds
      "--color-bg-primary":   g("--primary-background-color",  "#111111"),
      "--color-bg-card":      g("--card-background-color",      "#1c1c1c"),
      "--color-bg-elevated":  g("--secondary-background-color", "#202020"),
      // Text
      "--color-text-primary":   g("--primary-text-color",    "#e1e1e1"),
      "--color-text-secondary": g("--secondary-text-color",  "#9b9b9b"),
      "--color-text-dim":       g("--disabled-text-color",   "#6b6b6b"),
      // Main accent — HA primary/brand color
      "--color-accent":        g("--primary-color",  "#03a9f4"),
      "--color-accent-violet": g("--accent-color",   "#ff9800"),
      // Status
      "--color-accent-green": g("--success-color", "#4caf50"),
      "--color-accent-red":   g("--error-color",   "#ef5350"),
    };
  }

  // Returns true if the current HA theme is light (background is bright).
  _isLightTheme(vars) {
    const bg = (vars["--color-bg-primary"] || "").trim();
    // Parse hex: #rrggbb or #rgb
    const hex = bg.replace(/^#/, "");
    let r = 0;
    if (/^[0-9a-f]{6}$/i.test(hex)) r = parseInt(hex.slice(0, 2), 16);
    else if (/^[0-9a-f]{3}$/i.test(hex)) r = parseInt(hex[0] + hex[0], 16);
    else {
      // Try rgb(r,g,b)
      const m = bg.match(/rgb\s*\(\s*(\d+)/);
      if (m) r = parseInt(m[1]);
    }
    return r > 128;
  }

  // Push the latest theme vars into the already-loaded iframe document.
  _applyThemeToIframe(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.documentElement) return;
      const vars = this._readThemeVars();
      const el = doc.documentElement;
      // In light themes, boost --color-text-dim so small labels are readable
      if (this._isLightTheme(vars)) {
        const dimColor = vars["--color-text-dim"];
        // Heuristic: if disabled-text-color is very light (r>180), replace with #666
        const hex = (dimColor || "").trim().replace(/^#/, "");
        if (/^[0-9a-f]{6}$/i.test(hex) && parseInt(hex.slice(0,2),16) > 180) {
          vars["--color-text-dim"] = "#666666";
        }
        el.setAttribute("data-color-scheme", "light");
      } else {
        el.removeAttribute("data-color-scheme");
      }
      Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
      doc.body && (doc.body.style.background = vars["--color-bg-primary"]);
    } catch { /* cross-origin fallback iframe — ignore */ }
  }

  _appendIframe(srcdocHtml) {
    const iframe = document.createElement("iframe");
    iframe.srcdoc = srcdocHtml;
    iframe.style.cssText = "border:0;width:100%;height:100%;display:block;";

    // Re-apply theme once content has loaded (covers the srcdoc parse race).
    iframe.addEventListener("load", () => this._applyThemeToIframe(iframe));

    this.appendChild(iframe);
    this._forwardVisibility(iframe);

    // Watch for HA theme changes on the parent document.
    // HA applies theme changes via element.style.setProperty() on the html
    // element, which triggers a 'style' attribute mutation.
    // Also watch <head> childList in case HA injects a new <style> tag.
    this._observer = new MutationObserver(() => this._applyThemeToIframe(iframe));
    this._observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
    this._observer.observe(document.head, {
      childList: true,
    });
  }

  // Forward visibilitychange from the parent document into the iframe.
  // iOS WKWebView fires visibilitychange on the top-level document but
  // NOT inside iframes — @hakit/core's suspend/resume depends on it.
  _forwardVisibility(iframe) {
    document.addEventListener("visibilitychange", () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.dispatchEvent(new Event("visibilitychange"));
        }
      } catch { /* cross-origin — ignore */ }
    });
  }
}
customElements.define("custom-dashboard-panel", CustomDashboardPanel);
