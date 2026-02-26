/**
 * Status Data Preferences Component
 * Handles user preferences for module status data, such as CORS error visibility.
 */
const StatusDataPreferences = {};

/**
 * Initialize the module
 */
StatusDataPreferences.init = function () {
    console.log('StatusDataPreferences initialized');

    // Set up Hide CORS Errors preference from localStorage
    try {
        if (window.localStorage) {
            const savedPref = localStorage.getItem('HIDE_CORS_ERRORS');
            if (savedPref === 'true') {
                window.HIDE_CORS_ERRORS = true;
            } else if (savedPref !== null) {
                window.HIDE_CORS_ERRORS = savedPref === 'true';
            }
        }
    } catch (e) {
        console.warn('Could not read CORS error preference from localStorage', e);
    }
};

/**
 * Set and save CORS error visibility preference
 * @param {boolean} hide - Whether to hide CORS errors
 */
StatusDataPreferences.setHideCorsErrors = function (hide) {
    window.HIDE_CORS_ERRORS = !!hide;
    try {
        if (window.localStorage) {
            localStorage.setItem('HIDE_CORS_ERRORS', window.HIDE_CORS_ERRORS.toString());
        }
    } catch (e) {
        console.warn('Could not save CORS error preference', e);
    }
    return window.HIDE_CORS_ERRORS;
};

/**
 * Permanently hide CORS errors and suppress existing ones
 */
StatusDataPreferences.hideCorsErrorsPermanently = function () {
    this.setHideCorsErrors(true);

    // Also make sure all existing error objects are marked as suppressed
    if (window.moduleLoadingErrors) {
        window.moduleLoadingErrors.forEach(error => {
            if (error.module === 'Script-CORS' ||
                (typeof error.message === 'string' &&
                    (error.message.includes('Script error') ||
                        error.message === 'Script error.'))) {
                error.suppressed = true;
            }
        });
    }
};

window.StatusDataPreferences = StatusDataPreferences;
