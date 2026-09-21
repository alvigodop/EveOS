(() => {
  const PROVIDER_CONTRACT_VERSION = 1;
  const CAPABILITY_SCHEMA_VERSION = 1;
  const AGENT_FEATURE_SCHEMA_VERSION = 1;
  const ADAPTER_OPERATIONS = Object.freeze([
    'probe', 'ensureReady', 'send', 'observe', 'captureLatest', 'recover', 'health'
  ]);
  const BRIDGE_CAPABILITIES = Object.freeze([
    'chat', 'captureLatest', 'activity', 'searchResults'
  ]);
  const AGENT_FEATURES = Object.freeze([
    'persistentCloudComputer', 'backgroundTasks', 'proactiveMessages', 'approvals', 'artifacts'
  ]);
  const ORCHESTRATION_KEYS = Object.freeze(['spawnUrl', 'readinessProbe', 'firstTurnPrime', 'establishedUrlPrefix']);

  function boolMap(keys, source = {}, fallback = false) {
    return Object.fromEntries(keys.map((key) => [key, source[key] == null ? fallback : source[key] === true]));
  }

  function createAdapterContract(input = {}) {
    return {
      version: PROVIDER_CONTRACT_VERSION,
      capabilitySchemaVersion: CAPABILITY_SCHEMA_VERSION,
      agentFeatureSchemaVersion: AGENT_FEATURE_SCHEMA_VERSION,
      operations: boolMap(ADAPTER_OPERATIONS, input.operations, false)
    };
  }

  function cloneAdapterContract(contract = createAdapterContract()) {
    return {
      version: Number(contract.version),
      capabilitySchemaVersion: Number(contract.capabilitySchemaVersion),
      agentFeatureSchemaVersion: Number(contract.agentFeatureSchemaVersion),
      operations: { ...(contract.operations || {}) }
    };
  }

  function unknownKeys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const known = new Set(allowed);
    return Object.keys(value).filter((key) => !known.has(key));
  }

  function validateProviderDefinition(provider = {}) {
    const issues = [];
    const id = String(provider.id || '').trim();
    const contract = provider.adapterContract || {};
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) issues.push('id must be a stable lowercase provider key');
    if (!String(provider.name || '').trim()) issues.push('name is required');
    if (!Array.isArray(provider.matchPatterns) || !provider.matchPatterns.length) issues.push('matchPatterns must be non-empty');
    if (!Array.isArray(provider.urlPrefixes) || !provider.urlPrefixes.length) issues.push('urlPrefixes must be non-empty');
    if (contract.version !== PROVIDER_CONTRACT_VERSION) issues.push(`adapter contract version must be ${PROVIDER_CONTRACT_VERSION}`);
    if (contract.capabilitySchemaVersion !== CAPABILITY_SCHEMA_VERSION) issues.push(`capability schema version must be ${CAPABILITY_SCHEMA_VERSION}`);
    if (contract.agentFeatureSchemaVersion !== AGENT_FEATURE_SCHEMA_VERSION) issues.push(`agent feature schema version must be ${AGENT_FEATURE_SCHEMA_VERSION}`);

    const operationKeys = unknownKeys(contract.operations, ADAPTER_OPERATIONS);
    if (operationKeys.length) issues.push(`unknown adapter operation(s): ${operationKeys.join(', ')}`);
    for (const operation of ADAPTER_OPERATIONS) {
      if (typeof contract.operations?.[operation] !== 'boolean') issues.push(`adapter operation ${operation} must be boolean`);
    }

    const capabilityKeys = unknownKeys(provider.capabilities, BRIDGE_CAPABILITIES);
    if (capabilityKeys.length) issues.push(`unknown bridge capability(s): ${capabilityKeys.join(', ')}`);
    for (const capability of BRIDGE_CAPABILITIES) {
      if (typeof provider.capabilities?.[capability] !== 'boolean') issues.push(`bridge capability ${capability} must be boolean`);
    }

    const featureKeys = unknownKeys(provider.agentFeatures, AGENT_FEATURES);
    if (featureKeys.length) issues.push(`unknown agent feature(s): ${featureKeys.join(', ')}`);
    for (const [key, value] of Object.entries(provider.agentFeatures || {})) {
      if (typeof value !== 'boolean') issues.push(`agent feature ${key} must be boolean`);
    }

    const orchestrationKeys = unknownKeys(provider.orchestration, ORCHESTRATION_KEYS);
    if (orchestrationKeys.length) issues.push(`unknown orchestration field(s): ${orchestrationKeys.join(', ')}`);
    if (provider.orchestration?.spawnUrl != null && !String(provider.orchestration.spawnUrl).trim()) issues.push('orchestration spawnUrl must be non-empty');
    if (provider.orchestration?.readinessProbe != null && !String(provider.orchestration.readinessProbe).trim()) issues.push('orchestration readinessProbe must be non-empty');
    if (provider.orchestration?.firstTurnPrime != null && typeof provider.orchestration.firstTurnPrime !== 'boolean') issues.push('orchestration firstTurnPrime must be boolean');
    if (provider.orchestration?.establishedUrlPrefix != null && !String(provider.orchestration.establishedUrlPrefix).trim()) issues.push('orchestration establishedUrlPrefix must be non-empty');
    if (provider.orchestration?.readinessProbe && !provider.orchestration?.spawnUrl) issues.push('orchestration readinessProbe requires spawnUrl');
    if (provider.orchestration?.firstTurnPrime && !provider.orchestration?.spawnUrl) issues.push('orchestration firstTurnPrime requires spawnUrl');
    if (provider.orchestration?.firstTurnPrime && !provider.orchestration?.establishedUrlPrefix) issues.push('orchestration firstTurnPrime requires establishedUrlPrefix');
    if (provider.orchestration?.establishedUrlPrefix && provider.orchestration?.firstTurnPrime !== true) issues.push('orchestration establishedUrlPrefix requires firstTurnPrime');

    const groups = Array.isArray(provider.groups) ? provider.groups : [];
    const chatGroup = groups.find((group) => group.expectedAdapter === id);
    if (!chatGroup) issues.push('primary chat adapter group must advertise expectedAdapter equal to provider id');
    if (!groups.some((group) => group.expectedAdapter === 'provider-health')) issues.push('shared provider-health group is required');
    if (!groups.some((group) => group.expectedAdapter === 'dex-provider-control')) issues.push('shared Dex provider-control group is required');

    if (provider.capabilities?.chat && contract.operations?.send !== true) issues.push('chat capability requires send operation');
    if (provider.capabilities?.captureLatest && contract.operations?.captureLatest !== true) issues.push('captureLatest capability requires captureLatest operation');
    if (provider.qualification?.live === true) {
      for (const operation of ['probe', 'ensureReady', 'send', 'observe', 'captureLatest', 'recover', 'health']) {
        if (contract.operations?.[operation] !== true) issues.push(`live qualification requires ${operation} operation`);
      }
      if (provider.qualification?.exactOnce !== true) issues.push('live qualification requires exactOnce');
    }
    return issues;
  }

  function assertProviderDefinition(provider) {
    const issues = validateProviderDefinition(provider);
    if (!issues.length) return provider;
    const error = new Error(`Provider contract invalid for ${provider?.id || '(unknown)'}: ${issues.join('; ')}`);
    error.code = 'PROVIDER_CONTRACT_INVALID';
    error.issues = issues;
    throw error;
  }

  function validateProviderRegistry(providers = []) {
    const issues = [];
    const ids = new Set();
    const prefixes = new Map();
    for (const provider of providers) {
      for (const issue of validateProviderDefinition(provider)) issues.push(provider.id + ': ' + issue);
      if (ids.has(provider.id)) issues.push(provider.id + ': duplicate provider id');
      ids.add(provider.id);
      for (const prefix of provider.urlPrefixes || []) {
        if (prefixes.has(prefix)) issues.push(provider.id + ': URL prefix already owned by ' + prefixes.get(prefix));
        else prefixes.set(prefix, provider.id);
      }
    }
    return issues;
  }

  function assertProviderRegistry(providers) {
    const issues = validateProviderRegistry(providers);
    if (!issues.length) return providers;
    const error = new Error('Provider registry contract invalid: ' + issues.join('; '));
    error.code = 'PROVIDER_REGISTRY_INVALID';
    error.issues = issues;
    throw error;
  }

  function supportsOperation(provider, operation) {
    return ADAPTER_OPERATIONS.includes(operation) && provider?.adapterContract?.operations?.[operation] === true;
  }

  const api = {
    PROVIDER_CONTRACT_VERSION, CAPABILITY_SCHEMA_VERSION, AGENT_FEATURE_SCHEMA_VERSION,
    ADAPTER_OPERATIONS, BRIDGE_CAPABILITIES, AGENT_FEATURES, ORCHESTRATION_KEYS,
    createAdapterContract, cloneAdapterContract, validateProviderDefinition,
    assertProviderDefinition, validateProviderRegistry, assertProviderRegistry, supportsOperation
  };
  globalThis.BrowserAiBridgeProviderContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();