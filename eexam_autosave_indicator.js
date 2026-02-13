var isFn = isFn || ((a) => typeof a === "function");

(function () {
  let patched = false;

  function patchTinyMCE(tinymce) {
    if (patched || !tinymce || !isFn(tinymce.init)) return;

    const previousInit = tinymce.init;

    tinymce.init = function (config) {
      const originalSetup = config?.setup;

      const overrides = {
        ...(config || {}),
        setup: (editor) => {
          editor.on("init", () => {
            const container = editor.getContainer();
            if (!container) return;

            const indicator = document.createElement("div");
            indicator.id = "eexam-autosave-indicator";
            indicator.style.cssText = `
              display: inline-block;
              padding: 4px 12px;
              font-family: sans-serif;
              font-size: 10pt;
              color: #666;
              background: #f0f0f0;
              border: 1px solid #d0d0d0;
              border-radius: 4px;
              margin-top: 4px;
            `;
            indicator.textContent = "";
            container.parentNode.insertBefore(indicator, container.nextSibling);

            let lastSaveTime = null;
            let tickInterval = null;

            function formatTimeAgo(seconds) {
              if (seconds < 5) return "Gerade eben gespeichert";
              if (seconds < 60) return `Zuletzt gespeichert vor ${seconds} Sekunden`;
              const minutes = Math.floor(seconds / 60);
              if (minutes === 1) return "Zuletzt gespeichert vor 1 Minute";
              return `Zuletzt gespeichert vor ${minutes} Minuten`;
            }

            function updateIndicator() {
              if (!lastSaveTime) return;

              const seconds = Math.floor((Date.now() - lastSaveTime) / 1000);
              indicator.textContent = formatTimeAgo(seconds);

              // Color shifts from green to neutral over time
              if (seconds < 10) {
                indicator.style.color = "#2e7d32";
                indicator.style.background = "#e8f5e9";
                indicator.style.borderColor = "#a5d6a7";
              } else {
                indicator.style.color = "#666";
                indicator.style.background = "#f0f0f0";
                indicator.style.borderColor = "#d0d0d0";
              }
            }

            function showSaved() {
              lastSaveTime = Date.now();
              updateIndicator();

              if (!tickInterval) {
                tickInterval = setInterval(updateIndicator, 5000);
              }
            }

            // Listen for Moodle autosave DOM changes
            const form = container.closest("form");
            if (form) {
              const formObserver = new MutationObserver(() => {
                const autosaveMsg = form.querySelector(
                  ".autosave-status, .mod_quiz-autosave-status, [data-region='autosave-status']"
                );
                if (autosaveMsg && autosaveMsg.textContent.trim()) {
                  showSaved();
                }
              });
              formObserver.observe(form, {
                childList: true,
                subtree: true,
                characterData: true,
              });
            }

            // Intercept XMLHttpRequest
            const originalXHRSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function () {
              this.addEventListener("load", function () {
                if (
                  this.responseURL &&
                  (this.responseURL.includes("autosave") ||
                    this.responseURL.includes("processattempt"))
                ) {
                  if (this.status >= 200 && this.status < 300) {
                    showSaved();
                  }
                }
              });
              return originalXHRSend.apply(this, arguments);
            };

            // Intercept fetch
            const originalFetch = window.fetch;
            window.fetch = function () {
              const promise = originalFetch.apply(this, arguments);
              const url =
                typeof arguments[0] === "string"
                  ? arguments[0]
                  : arguments[0]?.url || "";
              if (
                url.includes("autosave") ||
                url.includes("processattempt")
              ) {
                promise.then((response) => {
                  if (response.ok) showSaved();
                });
              }
              return promise;
            };
          });

          if (originalSetup && isFn(originalSetup)) {
            originalSetup(editor);
          }
        },
      };
      return previousInit.call(this, overrides);
    };

    patched = true;
  }

  if (window.tinymce && isFn(window.tinymce.init)) {
    patchTinyMCE(window.tinymce);
    return;
  }

  function findScript() {
    return document.querySelector('script[data-tinymce="tinymce"]');
  }

  function attachListeners(script) {
    if (!script) return;
    if (window.tinymce && isFn(window.tinymce.init)) {
      patchTinyMCE(window.tinymce);
      return;
    }
    script.addEventListener(
      "load",
      () => {
        if (window.tinymce && isFn(window.tinymce.init)) patchTinyMCE(window.tinymce);
      },
      { once: true }
    );
  }

  const existingScript = findScript();
  if (existingScript) {
    attachListeners(existingScript);
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node.nodeType === 1 &&
          node.tagName === "SCRIPT" &&
          node.getAttribute("data-tinymce") === "tinymce"
        ) {
          attachListeners(node);
          observer.disconnect();
          return;
        }
      }
    }
  });
  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    if (window.tinymce && isFn(window.tinymce.init)) {
      clearInterval(poll);
      observer.disconnect();
      patchTinyMCE(window.tinymce);
    } else if (attempts > 100) clearInterval(poll);
  }, 100);
})();