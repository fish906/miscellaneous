var isFn = isFn || ((a) => typeof a === "function");

(function () {
  let patched = false;

  const PASTE_TOKEN =
    "__mce_internal_" + Math.random().toString(36).slice(2) + "__";

  function patchTinyMCE(tinymce) {
    if (patched || !tinymce || !isFn(tinymce.init)) return;

    const previousInit = tinymce.init;

    tinymce.init = function (config) {
      const originalSetup = config?.setup;

      const overrides = {
        ...(config || {}),
        paste_preprocess: (plugin, args) => {
          if (!args.content.includes(PASTE_TOKEN)) {
            args.content = "";
            tinymce.activeEditor?.notificationManager.open({
              text: "Einfügen von externen Inhalten ist nicht erlaubt.",
              type: "warning",
              timeout: 3000,
            });
          } else {
            args.content = args.content.replaceAll(PASTE_TOKEN, "");
          }
        },
        setup: (editor) => {
          editor.on("copy cut", (e) => {
            const clipboardData =
              e.clipboardData ||
              (e.originalEvent && e.originalEvent.clipboardData);
            if (!clipboardData) return;

            const selection = editor.selection.getContent({ format: "html" });
            const text = editor.selection.getContent({ format: "text" });

            clipboardData.setData(
              "text/html",
              `<span style="display:none">${PASTE_TOKEN}</span>${selection}`
            );
            clipboardData.setData("text/plain", PASTE_TOKEN + text);
            e.preventDefault();
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