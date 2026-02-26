/**
 * Server Configuration Module
 * Handles local Python server setup and Google Custom Search Engine integration
 */
const ServerConfig = {
    version: '2.0.0',
    _initialized: false,
    _serverRunning: false,
    _cseId: '646ca4244f3524a8e',
    _cseUrl: 'https://cse.google.com/cse?cx=646ca4244f3524a8e',
    _serverType: 'python',
    
    /**
     * Initialize the server configuration
     */
    init: function() {
        if (this._initialized) return true;
        
        console.log('Initializing ServerConfig module (Python-only)');
        
        // Check if we're running in a local server environment
        this._checkServerEnvironment();
        
        // Initialize CSE integration
        this._initCSE();
        
        this._initialized = true;
        return true;
    },
    
    /**
     * Check if we're running in a local server environment
     * @private
     */
    _checkServerEnvironment: function() {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        
        // Check if we're running on localhost or a local IP
        const isLocal = hostname === 'localhost' || 
                       hostname === '127.0.0.1' || 
                       hostname.startsWith('192.168.') ||
                       hostname.startsWith('10.');
                       
        if (isLocal) {
            console.log('Running in local Python server environment');
            this._serverRunning = true;
            
            // Update CORS settings for local development
            this._updateCorsSettings();
        }
    },
    
    /**
     * Update CORS settings for local development
     * @private
     */
    _updateCorsSettings: function() {
        if (window.CORSProxyManager) {
            // Add local development proxies
            CORSProxyManager.addProxy('http://localhost:3000');
            CORSProxyManager.addProxy('http://127.0.0.1:3000');
            
            // Enable local development mode
            CORSProxyManager.setLocalDevMode(true);
        }
    },
    
    /**
     * Initialize Google Custom Search Engine integration
     * @private
     */
    _initCSE: function() {
        // Add CSE script to the page
        const script = document.createElement('script');
        script.src = 'https://cse.google.com/cse.js?cx=' + this._cseId;
        script.async = true;
        document.head.appendChild(script);
        
        // Create CSE element
        const cseElement = document.createElement('div');
        cseElement.id = 'google-cse';
        cseElement.className = 'google-cse-container';
        
        // Add CSE element to the page
        const searchContainer = document.getElementById('search-container');
        if (searchContainer) {
            searchContainer.appendChild(cseElement);
        }
    },
    
    /**
     * Get the current server status
     * @returns {Object} Server status information
     */
    getServerStatus: function() {
        return {
            isLocal: this._serverRunning,
            protocol: window.location.protocol,
            hostname: window.location.hostname,
            port: window.location.port,
            serverType: this._serverType,
            cseId: this._cseId,
            cseUrl: this._cseUrl
        };
    },
    
    /**
     * Get the CSE configuration
     * @returns {Object} CSE configuration
     */
    getCSEConfig: function() {
        return {
            id: this._cseId,
            url: this._cseUrl,
            isConfigured: !!this._cseId
        };
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry) {
    ModuleRegistry.register('ServerConfig', ServerConfig);
}

// Export the module
window.ServerConfig = ServerConfig;

// Initialize if auto-init is enabled
if (typeof ServerConfig.init === 'function') {
    ServerConfig.init();
} 