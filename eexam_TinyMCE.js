var isFn = (a) => typeof a === "function";

(function () {
  const toolbar = [
    "undo redo",
    "copy paste cut",
    "bold italic underline",
    "fontsize",
    "alignleft aligncenter alignright alignjustify",
    "indent outdent",
    "fullscreen",
    "print",
  ].join(" | ");

  const disableQuickbars = true;
  const disableMenubar = true;
  let patched = false;

  function patchTinyMCE(tinymce) {
    if (patched || !tinymce || !isFn(tinymce.init)) return;

    const previousInit = tinymce.init;

    tinymce.init = function (config) {
      const overrides = {
        ...(config || {}),
        toolbar,
        font_size_formats: "11pt 12pt 13pt 14pt",
        custom_colors: false,
        ...(disableQuickbars && { quickbars_selection_toolbar: "" }),
        ...(disableMenubar && { menubar: false }),
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