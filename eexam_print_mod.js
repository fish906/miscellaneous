let isFn = isFn || ((a) => typeof a === "function");

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
            const style = editor.dom.create(
              "style",
              {},
              `
              @media print {
                body {
                  font-family: sans-serif;
                  font-size: 12pt !important;
                  line-height: 1.5 !important;
                  text-align: justify !important;
                  margin: 0;
                  padding: 0;
                }

                @page {
                  margin-top: 2cm;
                  margin-left: 2cm;
                  margin-bottom: 2cm;
                  margin-right: 5cm;
                }
              }
            `
            );
            editor.getDoc().head.appendChild(style);
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
  if (existingScript) { attachListeners(existingScript); return; }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && node.tagName === "SCRIPT" && node.getAttribute("data-tinymce") === "tinymce") {
          attachListeners(node);
          observer.disconnect();
          return;
        }
      }
    }
  });
  observer.observe(document.documentElement || document, { childList: true, subtree: true });

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