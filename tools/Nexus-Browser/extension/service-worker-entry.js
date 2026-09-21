if (typeof importScripts === 'function') {
  importScripts('runtime-config.js');
  importScripts('dex-ui-refresh.js');
  importScripts('content/provider-adapter-revision.js');
  importScripts('provider-adapter-freshness.js');
  importScripts('provider-target-spawn.js');
  importScripts('dex-provider-control-bridge.js');
  importScripts('host-access.js');
  importScripts('target-state.js');
  importScripts('target-resurrection.js');
  importScripts('qualification-warm-target.js');
  importScripts('qualification-control.js');
  importScripts('adapter-readiness-cache.js');
  importScripts('dex-ui-ensure.js');
  importScripts('dex-provider-control-boot.js');
  importScripts('chatgpt-navigation-recovery.js');
  importScripts('service-worker.js');
}
