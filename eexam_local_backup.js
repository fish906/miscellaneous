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

            const backupKey =
              "eexam_backup_" +
              window.location.pathname.replace(/\W/g, "_") +
              "_" +
              editor.id;

            const BACKUP_INTERVAL = 10000;
            const MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours
            let lastBackupContent = "";

            // --- Save backup ---
            function saveBackup() {
              const content = editor.getContent();
              if (content === lastBackupContent) return;

              try {
                const backup = {
                  content: content,
                  timestamp: Date.now(),
                  url: window.location.href,
                };
                localStorage.setItem(backupKey, JSON.stringify(backup));
                lastBackupContent = content;
              } catch (e) {
                console.error("Lokales Backup fehlgeschlagen:", e);
              }
            }

            // --- Restore prompt ---
            function checkForBackup() {
              try {
                const stored = localStorage.getItem(backupKey);
                if (!stored) return;

                const backup = JSON.parse(stored);
                const currentContent = editor.getContent();

                if (
                  !backup.content ||
                  backup.content.trim().length <=
                    currentContent.trim().length
                )
                  return;

                const age = Date.now() - backup.timestamp;

                if (age > MAX_AGE) {
                  localStorage.removeItem(backupKey);
                  return;
                }

                const minutes = Math.floor(age / 60000);
                let timeAgo;
                if (minutes < 1) timeAgo = "weniger als 1 Minute";
                else if (minutes === 1) timeAgo = "1 Minute";
                else if (minutes < 60) timeAgo = `${minutes} Minuten`;
                else {
                  const hours = Math.floor(minutes / 60);
                  timeAgo =
                    hours === 1 ? "1 Stunde" : `${hours} Stunden`;
                }

                const restoreBar = document.createElement("div");
                restoreBar.style.cssText = `
                  padding: 10px 16px;
                  background: #fff3e0;
                  border: 1px solid #ffcc80;
                  border-radius: 4px;
                  margin-top: 4px;
                  font-family: sans-serif;
                  font-size: 10pt;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 12px;
                `;

                const text = document.createElement("span");
                text.textContent = `Lokales Backup gefunden (vor ${timeAgo}). Wiederherstellen?`;

                const btnGroup = document.createElement("span");
                btnGroup.style.cssText =
                  "display: flex; gap: 8px; flex-shrink: 0;";

                const restoreBtn = document.createElement("button");
                restoreBtn.textContent = "Wiederherstellen";
                restoreBtn.style.cssText = `
                  padding: 4px 14px;
                  background: #ff9800;
                  color: white;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 10pt;
                  font-family: sans-serif;
                `;

                const dismissBtn = document.createElement("button");
                dismissBtn.textContent = "Verwerfen";
                dismissBtn.style.cssText = `
                  padding: 4px 14px;
                  background: #eee;
                  color: #333;
                  border: 1px solid #ccc;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 10pt;
                  font-family: sans-serif;
                `;

                restoreBtn.addEventListener("click", () => {
                  const confirmed = confirm(
                    "Möchten Sie das lokale Backup wirklich wiederherstellen? Der aktuelle Inhalt wird überschrieben."
                  );
                  if (confirmed) {
                    editor.setContent(backup.content);
                    lastBackupContent = backup.content;
                    restoreBar.remove();
                  }
                });

                dismissBtn.addEventListener("click", () => {
                  localStorage.removeItem(backupKey);
                  restoreBar.remove();
                });

                btnGroup.appendChild(restoreBtn);
                btnGroup.appendChild(dismissBtn);
                restoreBar.appendChild(text);
                restoreBar.appendChild(btnGroup);

                container.parentNode.insertBefore(
                  restoreBar,
                  container.nextSibling
                );
              } catch (e) {
                console.error("Backup-Prüfung fehlgeschlagen:", e);
              }
            }

            // --- Start ---
            checkForBackup();
            setInterval(saveBackup, BACKUP_INTERVAL);
            editor.on("change", saveBackup);
            window.addEventListener("beforeunload", saveBackup);
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