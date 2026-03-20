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
          let lastSaveTime = null;
          let isOffline = !navigator.onLine;

          const FRESH_THRESHOLD = 30000;
          const CHECK_INTERVAL = 5000;

          editor.ui.registry.addButton("autosave_indicator", {
            text: "\u25CF",
            tooltip: "Speicherstatus",
            onAction: () => {},
          });

          function getButtonElement() {
            const container = editor.getContainer();
            if (!container) return null;
            const buttons = container.querySelectorAll("button.tox-tbtn");
            for (const btn of buttons) {
              if (btn.textContent.trim() === "\u25CF") return btn;
            }
            return null;
          }

          function updateIndicator() {
            const btn = getButtonElement();
            if (!btn) return;

            let color;
            let tooltip;

            if (isOffline) {
              color = "#c62828";
              tooltip = "Keine Internetverbindung";
            } else if (
              lastSaveTime &&
              Date.now() - lastSaveTime <= FRESH_THRESHOLD
            ) {
              color = "#2e7d32";
              tooltip = "Gespeichert";
            } else {
              color = "#f9a825";
              tooltip = lastSaveTime
                ? "Letzte Speicherung vor mehr als 30 Sekunden"
                : "Noch nicht gespeichert";
            }

            btn.style.color = color;
            btn.style.fontSize = "18px";
            btn.title = tooltip;
          }

          function showSaved() {
            lastSaveTime = Date.now();
            updateIndicator();
          }

          editor.on("init", () => {
            // Periodic check
            setInterval(updateIndicator, CHECK_INTERVAL);

            // Connection monitor
            window.addEventListener("offline", () => {
              isOffline = true;
              updateIndicator();
            });

            window.addEventListener("online", () => {
              isOffline = false;
              updateIndicator();
            });

            // Listen for Moodle autosave DOM changes
            const form = editor.getContainer()?.closest("form");
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

            // Initial state
            updateIndicator();
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
        if (window.tinymce && isFn(window.tinymce.init))
          patchTinyMCE(window.tinymce);
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