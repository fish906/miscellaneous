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

            // Unique key based on the page URL and editor ID
            const backupKey =
              "eexam_backup_" +
              window.location.pathname.replace(/\W/g, "_") +
              "_" +
              editor.id;

            const BACKUP_INTERVAL = 10000; // 10 seconds
            let lastBackupContent = "";

            // --- Indicator ---
            let indicator = document.getElementById("eexam-autosave-indicator");
            if (!indicator) {
              indicator = document.createElement("div");
              indicator.id = "eexam-backup-indicator";
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
                margin-left: 8px;
              `;
              container.parentNode.insertBefore(
                indicator,
                container.nextSibling
              );
            }

            function flashBackupStatus(message, type) {
              indicator.textContent = message;
              if (type === "success") {
                indicator.style.color = "#1565c0";
                indicator.style.background = "#e3f2fd";
                indicator.style.borderColor = "#90caf9";
              } else if (type === "warning") {
                indicator.style.color = "#e65100";
                indicator.style.background = "#fff3e0";
                indicator.style.borderColor = "#ffcc80";
              } else if (type === "error") {
                indicator.style.color = "#c62828";
                indicator.style.background = "#ffebee";
                indicator.style.borderColor = "#ef9a9a";
              }

              setTimeout(() => {
                indicator.style.color = "#666";
                indicator.style.background = "#f0f0f0";
                indicator.style.borderColor = "#d0d0d0";
              }, 3000);
            }

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

                // Only offer restore if backup has content and editor is empty or has less content
                if (
                  !backup.content ||
                  backup.content.trim().length <=
                    currentContent.trim().length
                )
                  return;

                const age = Date.now() - backup.timestamp;
                const maxAge = 24 * 60 * 60 * 1000; // 24 hours

                if (age > maxAge) {
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

                // Show restore bar
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
                  editor.setContent(backup.content);
                  lastBackupContent = backup.content;
                  restoreBar.remove();
                  flashBackupStatus(
                    "Backup wiederhergestellt",
                    "success"
                  );
                });

                dismissBtn.addEventListener("click", () => {
                  localStorage.removeItem(backupKey);
                  restoreBar.remove();
                  flashBackupStatus("Backup verworfen", "warning");
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

            // --- Connection monitor ---
            function onOffline() {
              flashBackupStatus(
                "Keine Internetverbindung — lokales Backup aktiv",
                "error"
              );
            }

            function onOnline() {
              flashBackupStatus(
                "Verbindung wiederhergestellt",
                "success"
              );
            }

            window.addEventListener("offline", onOffline);
            window.addEventListener("online", onOnline);

            // --- Start ---
            checkForBackup();
            setInterval(saveBackup, BACKUP_INTERVAL);

            // Save on every significant change too
            editor.on("change", saveBackup);

            // Save before page unload
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