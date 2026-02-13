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
            // Create indicator element on the main page
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
              transition: all 0.3s ease;
            `;
            indicator.textContent = "Nicht gespeichert";
            container.parentNode.insertBefore(indicator, container.nextSibling);

            let saveTimeout = null;

            // Flash green on save
            function showSaved() {
              indicator.textContent = "Gespeichert";
              indicator.style.color = "#2e7d32";
              indicator.style.background = "#e8f5e9";
              indicator.style.borderColor = "#a5d6a7";

              if (saveTimeout) clearTimeout(saveTimeout);
              saveTimeout = setTimeout(() => {
                indicator.textContent = "Gespeichert";
                indicator.style.color = "#666";
                indicator.style.background = "#f0f0f0";
                indicator.style.borderColor = "#d0d0d0";
              }, 3000);
            }

            // Show unsaved on content change
            function showUnsaved() {
              indicator.textContent = "Nicht gespeichert";
              indicator.style.color = "#c62828";
              indicator.style.background = "#ffebee";
              indicator.style.borderColor = "#ef9a9a";

              if (saveTimeout) clearTimeout(saveTimeout);
            }

            // Listen for content changes
            editor.on("input change keyup", () => {
              showUnsaved();
            });

            // Listen for Moodle autosave
            // Moodle triggers form submission events on autosave
            const form = container.closest("form");
            if (form) {
              // MutationObserver to watch for Moodle's autosave status
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

            // Also intercept XMLHttpRequest to detect AJAX autosaves
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

            // Intercept fetch for modern Moodle
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