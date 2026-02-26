/**
 * Domain Validator Module (Facade) - Validates whether domains exist
 * 
 * Delegates to:
 * - DVFetch: Fetch-based domain checking
 * 
 * @version 1.1.0-facade
 */

const DomainValidator = {};

DomainValidator.init = function () {
    console.log('Initializing DomainValidator module');
    if (window.DVFetch && typeof DVFetch.init === 'function') {
        DVFetch.init();
        DVFetch._initialized = true;
    }
    this._initialized = true;
    return this;
};

DomainValidator.checkDomainExists = function (domain, callback) {
    if (!domain) {
        callback(false);
        return;
    }

    this.checkDomainWithFetch(domain, exists => {
        if (exists) {
            callback(true);
        } else {
            this.checkDomainWithImage(domain, exists => {
                if (exists) {
                    callback(true);
                } else {
                    this.checkDomainWithCommonPaths(domain, callback);
                }
            });
        }
    });
};

DomainValidator.checkDomainWithFetch = function (domain, callback) {
    if (window.DVFetch) {
        DVFetch.checkDomainWithFetch(domain, callback);
    } else {
        callback(false);
    }
};

DomainValidator.checkDomainWithImage = function (domain, callback) {
    if (window.DVFetch) {
        DVFetch.checkDomainWithImage(domain, callback);
    } else {
        callback(false);
    }
};

DomainValidator.checkDomainWithCommonPaths = function (domain, callback) {
    let commonPaths = [];
    if (window.DomainGenerator && typeof DomainGenerator.getCommonWikiPaths === 'function') {
        commonPaths = DomainGenerator.getCommonWikiPaths();
    } else if (window.DGFormatter && typeof DGFormatter.getCommonWikiPaths === 'function') {
        commonPaths = DGFormatter.getCommonWikiPaths();
    } else {
        commonPaths = ['/', '/wiki/Main_Page', '/api.php'];
    }

    let pathsChecked = 0;
    let domainExists = false;

    commonPaths.forEach(path => {
        const url = 'https://' + domain + path;
        this.checkUrlWithFetch(url, exists => {
            if (exists) domainExists = true;
            pathsChecked++;
            if (pathsChecked === commonPaths.length) {
                callback(domainExists);
            }
        });
    });
};

DomainValidator.checkUrlWithFetch = function (url, callback) {
    if (window.DVFetch) {
        DVFetch.checkUrlWithFetch(url, callback);
    } else {
        callback(false);
    }
};

window.DomainValidator = DomainValidator;

if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DomainValidator', DomainValidator);
}

console.log('Domain Validator module loaded');