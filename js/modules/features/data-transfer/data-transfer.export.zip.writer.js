// --- Data Transfer Export ZIP Writer ---
// Provides a JSZip-backed writer that mimics the rootHandle interface
// so all existing writeJsonFileToFolder / writeTextFileToFolder calls work unchanged.
window.EveDataTransfer = window.EveDataTransfer || {};
window.EveDataTransfer.ExportModules = window.EveDataTransfer.ExportModules || {};

(function () {
    window.EveDataTransfer.ExportModules.createZipWriter = function createZipWriter(deps) {
        const sanitizePathSegment = deps.sanitizePathSegment;

        /**
         * Creates a zip-backed root handle.
         * Compatible with the FS writer — detected via `rootHandle._zipInstance`.
         */
        function createZipRootHandle() {
            if (typeof JSZip !== 'function') {
                throw new Error('JSZip is not loaded. Cannot create ZIP backup.');
            }
            const zip = new JSZip();
            return {
                _zipInstance: zip,
                /**
                 * Write a text file at a relative path inside the zip.
                 * Uses the same sanitization as the FS writer.
                 */
                writeTextFile: function (relativePath, content) {
                    const segments = String(relativePath || '')
                        .replace(/\\/g, '/')
                        .split('/')
                        .map(function (s) { return s.trim(); })
                        .filter(Boolean);
                    if (!segments.length) return;

                    const sanitizedSegments = segments.map(function (segment, index) {
                        return index === segments.length - 1
                            ? sanitizePathSegment(segment, 'file.txt', 64)
                            : sanitizePathSegment(segment, 'folder', 40);
                    });
                    const sanitizedPath = sanitizedSegments.join('/');
                    zip.file(sanitizedPath, content);
                },

                /**
                 * Write a JSON file at a relative path inside the zip.
                 */
                writeJsonFile: function (relativePath, payload) {
                    this.writeTextFile(relativePath, JSON.stringify(payload, null, 2));
                },

                /**
                 * Generate the final zip blob for download.
                 */
                generateBlob: function () {
                    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
                }
            };
        }

        /**
         * Trigger a browser download of a blob as a named file.
         */
        function downloadBlob(blob, fileName) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        }

        return {
            createZipRootHandle: createZipRootHandle,
            downloadBlob: downloadBlob
        };
    };
})();
