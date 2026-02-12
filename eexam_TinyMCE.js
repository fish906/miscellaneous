let isFn = (a) => typeof a === "function";

(function A() {
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

    const originalInit = tinymce.init;

    tinymce.init = function (config) {
      const overrides = {
        ...(config || {}),
        toolbar,
        font_size_formats: "11pt 12pt 13pt 14pt",
        custom_colors: false,
        ...(disableQuickbars && { quickbars_selection_toolbar: "" }),
        ...(disableMenubar && { menubar: false }),
        setup: (editor) => {
          let internalCopy = false;

          // Flag internal copy/cut
          editor.on("copy cut", () => {
            internalCopy = true;
          });

          // Block external paste
          editor.on("paste", (e) => {
            if (!internalCopy) {
              e.preventDefault();
              e.stopPropagation();
              editor.notificationManager.open({
                text: "Einfügen von externen Inhalten ist nicht erlaubt.",
                type: "warning",
                timeout: 3000,
              });
              return false;
            }
            internalCopy = false;
          });

          // Call original setup if one existed
          if (config && isFn(config.setup)) {
            config.setup(editor);
          }
        },
      };
      return originalInit.call(this, overrides);
    };

    tinymce.init._original = originalInit;
    tinymce.init.unpatch = () => (tinymce.init = originalInit);
    patched = true;
  }

  // 1. Already loaded
  if (window.tinymce && isFn(window.tinymce.init)) {
    patchTinyMCE(window.tinymce);
    return;
  }

  // 2. Script tag already in DOM
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
        if (window.tinymce && isFn(window.tinymce.init)) {
          patchTinyMCE(window.tinymce);
        } else {
          console.error("TinyMCE script loaded but window.tinymce.init was not found.");
        }
      },
      { once: true }
    );

    script.addEventListener(
      "error",
      () => {
        console.error("Failed to load TinyMCE script:", script.src || script.getAttribute("src"));
      },
      { once: true }
    );
  }

  const existingScript = findScript();
  if (existingScript) {
    attachListeners(existingScript);
    return;
  }

  // 3. Watch for dynamically added script tag
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && node.tagName === "SCRIPT") {
          if (node.getAttribute("data-tinymce") === "tinymce") {
            attachListeners(node);
            observer.disconnect();
            return;
          }
        }
      }
    }
  });

  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });

  // 4. Polling fallback
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    if (window.tinymce && isFn(window.tinymce.init)) {
      clearInterval(poll);
      observer.disconnect();
      patchTinyMCE(window.tinymce);
    } else if (attempts > 100) {
      clearInterval(poll);
    }
  }, 100);
})();
