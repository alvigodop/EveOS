(() => {
  function originPattern(url) {
    try {
      const parsed = new URL(String(url || ''));
      if (!/^https?:$/.test(parsed.protocol)) return null;
      return `${parsed.origin}/*`;
    } catch {
      return null;
    }
  }

  function declaresAllSites(manifest = globalThis.chrome?.runtime?.getManifest?.()) {
    return Array.isArray(manifest?.host_permissions) && manifest.host_permissions.includes('<all_urls>');
  }

  async function hasHostAccess(url, permissionsApi = globalThis.chrome?.permissions) {
    const pattern = originPattern(url);
    if (!pattern || !permissionsApi?.contains) return { ok: false, pattern, reason: 'permissions-api-unavailable' };
    try {
      const ok = await permissionsApi.contains({ origins: [pattern] });
      return { ok: !!ok, pattern, reason: ok ? null : 'host-access-withheld' };
    } catch (error) {
      return { ok: false, pattern, reason: error?.message || 'host-access-check-failed' };
    }
  }

  async function addHostAccessRequest(tabId, url, permissionsApi = globalThis.chrome?.permissions) {
    const pattern = originPattern(url);
    if (!pattern || !permissionsApi?.addHostAccessRequest || !Number.isInteger(tabId)) return false;
    try {
      await permissionsApi.addHostAccessRequest({ tabId, pattern });
      return true;
    } catch {
      return false;
    }
  }

  async function requireHostAccess(
    tabId,
    url,
    permissionsApi = globalThis.chrome?.permissions,
    manifest = globalThis.chrome?.runtime?.getManifest?.()
  ) {
    const status = await hasHostAccess(url, permissionsApi);
    if (status.ok) return status;
    const allSitesDeclared = declaresAllSites(manifest);
    const requested = allSitesDeclared ? false : await addHostAccessRequest(tabId, url, permissionsApi);
    const guidance = allSitesDeclared
      ? 'Set EveOS Nexus Browser to "On all sites" under Chrome extension Site access, then retry Connect target.'
      : 'Grant EveOS Nexus Browser access to this site, then retry Connect target.';
    const error = new Error(
      `Chrome site access is withheld for ${status.pattern || url}. ${guidance}`
    );
    error.code = 'HOST_ACCESS_REQUIRED';
    error.detail = { pattern: status.pattern, requestAdded: requested, allSitesDeclared };
    throw error;
  }

  const api = { originPattern, declaresAllSites, hasHostAccess, addHostAccessRequest, requireHostAccess };
  globalThis.BrowserAiBridgeHostAccess = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
