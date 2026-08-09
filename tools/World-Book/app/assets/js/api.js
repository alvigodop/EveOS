(function () {
  const WB = window.WorldBook = window.WorldBook || {};

  async function request(path, options) {
    const response = await fetch(path, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options && options.headers ? options.headers : {})
      }
    });

    let payload = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      const message = payload && payload.error ? payload.error : String(payload || response.statusText);
      throw new Error(message);
    }

    return payload;
  }

  WB.API = {
    getConfig() {
      return request("/api/config");
    },

    setConfig(rootPath) {
      return request("/api/config", {
        method: "POST",
        body: JSON.stringify({ rootPath })
      });
    },

    getState() {
      return request("/api/state");
    },

    saveState(state) {
      return request("/api/state", {
        method: "POST",
        body: JSON.stringify({ state })
      });
    },

    createStateRollback(reason) {
      return request("/api/state/rollback", {
        method: "POST",
        body: JSON.stringify({ reason: reason || "before-external-integration" })
      });
    },

    list(path) {
      return request(`/api/list?path=${encodeURIComponent(path || "")}`);
    },

    read(path) {
      return request(`/api/read?path=${encodeURIComponent(path)}`);
    },

    search(query) {
      return request(`/api/search?q=${encodeURIComponent(query)}`);
    },

    create(parentPath, name, kind, content) {
      return request("/api/create", {
        method: "POST",
        body: JSON.stringify({ parentPath, name, kind, content: content || "" })
      });
    },

    write(path, content) {
      return request("/api/write", {
        method: "POST",
        body: JSON.stringify({ path, content })
      });
    },

    rename(path, newName) {
      return request("/api/rename", {
        method: "POST",
        body: JSON.stringify({ path, newName })
      });
    },


    copyScope(source, mode, style, path, virtualId) {
      return request("/api/copy-scope", {
        method: "POST",
        body: JSON.stringify({ source, mode, style, path: path || "", virtualId: virtualId || "root" })
      });
    },

    copyPhysicalToWorldBook(path, destinationVirtualId) {
      return request("/api/physical-to-virtual", {
        method: "POST",
        body: JSON.stringify({ path, destinationVirtualId })
      });
    },

    exportVirtualZip(virtualId, destinationPath, zipName) {
      return request("/api/virtual-to-zip", {
        method: "POST",
        body: JSON.stringify({ virtualId, destinationPath, zipName })
      });
    },

    open(path) {
      return request("/api/open", {
        method: "POST",
        body: JSON.stringify({ path })
      });
    },

    reveal(path) {
      return request("/api/reveal", {
        method: "POST",
        body: JSON.stringify({ path })
      });
    },


    async exportSnapshot() {
      const response = await fetch("/api/export", { cache: "no-store" });
      if (!response.ok) {
        let message = response.statusText;
        try {
          const payload = await response.json();
          message = payload.error || message;
        } catch (_error) {
          const text = await response.text();
          if (text) message = text;
        }
        throw new Error(message || "Snapshot export failed.");
      }
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      return {
        blob: await response.blob(),
        filename: match ? match[1] : "eve-world-book-snapshot.json"
      };
    },

    getTagIndex() {
      return request("/api/tag-index");
    },

    getImports() {
      return request("/api/imports");
    },

    getImport(id) {
      return request(`/api/import?id=${encodeURIComponent(id)}`);
    },

    importSnapshot(snapshot, mode = "archive") {
      return request("/api/import", {
        method: "POST",
        body: JSON.stringify({ snapshot, mode })
      });
    },

    async exportRecoveryBackup() {
      const response = await fetch("/api/recovery/export", { cache: "no-store" });
      if (!response.ok) {
        let message = response.statusText;
        try { message = (await response.json()).error || message; } catch (_error) {}
        throw new Error(message || "Full recovery backup failed.");
      }
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      return { blob: await response.blob(), filename: match ? match[1] : "Eve-WorldBook-Full-Recovery.zip" };
    },

    inspectRecoveryBackup(file) {
      return fetch("/api/recovery/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/zip", "X-Eve-File-Name": file.name || "backup.zip" },
        body: file
      }).then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || response.statusText);
        return payload;
      });
    },

    restoreRecoveryBackup(options) {
      return request("/api/recovery/restore", {
        method: "POST",
        body: JSON.stringify(options)
      });
    },

    getReaderDocuments() {
      return request("/api/narration/documents");
    },

    getReaderDocument(id) {
      return request(`/api/narration/document?id=${encodeURIComponent(id)}`);
    },

    readerDocumentDownloadUrl(id) {
      return `/api/narration/document/download?id=${encodeURIComponent(id)}`;
    },

    saveReaderText(title, text) {
      return request("/api/narration/documents/text", {
        method: "POST",
        body: JSON.stringify({ title, text })
      });
    },

    async importReaderDocument(file) {
      const response = await fetch("/api/narration/documents/import", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Eve-File-Name": file.name || "document.txt"
        },
        body: file
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || response.statusText);
      return payload;
    },

    deleteReaderDocument(id) {
      return request(`/api/narration/document?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    }
  };
})();
