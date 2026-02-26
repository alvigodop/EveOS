# Troubleshooting CORS Issues

## What are CORS Errors?

CORS (Cross-Origin Resource Sharing) errors occur when a web page tries to make requests to a different domain than the one that served the web page. These security restrictions are enforced by all modern browsers and can cause issues when running applications locally or when APIs don't explicitly allow cross-origin requests.

## How to Fix CORS Issues in This Application

### 1. Using the Built-in CORS Proxy

This application comes with a built-in CORS proxy manager that tries multiple proxy services to bypass CORS restrictions. The following commands are available from your browser's developer console:

- `window.diagnoseConnectivity()` - Run a full connectivity diagnostic
- `window.testApiConnectivity()` - Test API connectivity to critical endpoints
- `CORSProxyManager.retestProxies()` - Force retest all available CORS proxies

### 2. Host the Application on a Web Server

The simplest way to solve CORS issues is to host the application on a web server rather than opening the HTML file directly. You can use:

- **Python's built-in server:** Run `python -m http.server` in the application directory
- **Node.js server:** Use `npx serve` or `npx http-server` in the application directory
- **VSCode Live Server extension:** Right-click on the HTML file and select "Open with Live Server"

### 3. Use a Browser Extension to Disable CORS

For development purposes, you can install a browser extension to disable CORS:

- **Chrome:** "CORS Unblock" or "Allow CORS: Access-Control-Allow-Origin"
- **Firefox:** "CORS Everywhere" or "CORS Unblock"

**Important:** Only use these extensions for development and testing. Disabling CORS can pose security risks.

### 4. Configure Your Browser for Local Development

For Chrome, you can start it with CORS disabled for local files:

- Windows: Create a shortcut with target:
  ```
  "C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --disable-gpu --user-data-dir=~/chromeTemp
  ```

- Mac:
  ```
  open -n -a "Google Chrome" --args --disable-web-security --user-data-dir="~/ChromeDevSession"
  ```

- Linux:
  ```
  google-chrome --disable-web-security --user-data-dir="/tmp/chrome-dev"
  ```

## Specific API Issues

### Wikipedia API

The Wikipedia API supports CORS through the `origin=*` parameter, which is already incorporated into our requests. If you're still having issues, the application will use a CORS proxy automatically.

### Fandom API

Fandom doesn't provide native CORS support, so the application will always use a CORS proxy for these requests.

## Alternative Solutions

If all else fails:

1. Use the diagnostic tools mentioned above to identify which proxies are working
2. Add additional proxy services to the CORS Proxy Manager by editing the `js/modules/utils/cors-proxy-manager.js` file
3. Consider using a serverless function as a dedicated proxy for your application

## Technical Support

If you continue to encounter CORS issues:

1. Run `window.diagnoseConnectivity()` in the browser console
2. Copy the output
3. Share the output with the development team

## For Developers

When developing new features, always test with CORS in mind:

1. Test in both local file and web server environments
2. Use the CORSProxyManager for all external API requests
3. Add fallback mechanisms for when CORS proxies fail 