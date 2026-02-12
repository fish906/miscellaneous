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

  // Random marker per session so it can't be guessed
  const PASTE_TOKEN = "__mce_internal_" + Math.random().toString(36).slice(2) + "__";

    // Extract question metadata from the page
  function getQuestionInfo() {
    const scriptTag = document.querySelector(
      'script[src*="eexam_TinyMCE"]'
    );
    if (!scriptTag) return {};

    const container = scriptTag.closest(".qtext") || scriptTag.parentElement?.parentElement;
    if (!container) return {};

    const paragraphs = container.querySelectorAll("p");
    const info = {};

    for (const p of paragraphs) {
      const text = p.textContent.trim();
      if (!text) continue;
      if (text.startsWith("Klausur:")) info.klausur = text;
      else if (text.startsWith("Datum:")) info.datum = text;
      else if (text.startsWith("Ferienklausurenkurs") || text.startsWith("Klausurenkurs")) info.kurs = text;
    }

    return info;
  }

  function patchTinyMCE(tinymce) {
    if (patched || !tinymce || !isFn(tinymce.init)) return;

    const originalInit = tinymce.init;

    tinymce.init = function (config) {
      const overrides = {
        ...(config || {}),
        toolbar,
        font_size_formats: "11pt 12pt 13pt 14pt",
        custom_colors: false,
        paste_preprocess: (plugin, args) => {
          // Check for our secret token in the pasted content
          if (!args.content.includes(PASTE_TOKEN)) {
            args.content = "";
            tinymce.activeEditor?.notificationManager.open({
              text: "Einfügen von externen Inhalten ist nicht erlaubt.",
              type: "warning",
              timeout: 3000,
            });
          } else {
            // Remove the token before inserting
            args.content = args.content.replaceAll(PASTE_TOKEN, "");
          }
        },
        ...(disableQuickbars && { quickbars_selection_toolbar: "" }),
        ...(disableMenubar && { menubar: false }),
        setup: (editor) => {
          // Inject token into clipboard on copy/cut
          editor.on("copy cut", (e) => {
            const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
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

          // Print styles with dynamic header
          editor.on("init", () => {
            const info = getQuestionInfo();

            const headerLines = [
              info.kurs || "",
              info.klausur || "",
              info.datum || "",
            ]
              .filter(Boolean)
              .map((line) => `"${line.replace(/"/g, '\\"')}"`)
              .join(' "\\A" ');

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

                body::before {
                  content: ${headerLines};
                  white-space: pre-line;
                  display: block;
                  font-size: 16pt;
                  font-weight: bold;
                  font-family: sans-serif;
                  text-align: left;
                  margin-bottom: 1cm;
                }
              }
            `
            );
            editor.getDoc().head.appendChild(style);
          });

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