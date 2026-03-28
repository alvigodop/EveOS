window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    window.openBulkModal = api.openBulkModal;
    window.clearBulkInput = api.clearBulkInput;
    window.autoFormatBulkText = api.autoFormatBulkText;
    window.autoLineBreakBulkUrls = api.autoLineBreakBulkUrls;
    window.autoLineBreakBulkNames = api.autoLineBreakBulkNames;
    window.processBulk = api.processBulk;
    window.processStructuredFile = api.processStructuredFile;
})();
