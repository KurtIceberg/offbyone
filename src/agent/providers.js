const PROVIDER_PRESETS = {
  openai: {
    id: 'openai',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5'
  },
  xai: {
    id: 'xai',
    apiKeyEnv: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-3-mini'
  },
  openrouter: {
    id: 'openrouter',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini'
  },
  deepseek: {
    id: 'deepseek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  siliconflow: {
    id: 'siliconflow',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3'
  },
  anthropic: {
    id: 'anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5-20250929',
    protocol: 'anthropic'
  }
};

function getProviderPreset(provider) {
  if (!provider) return null;
  const id = String(provider).trim().toLowerCase();
  if (!id) return null;
  const preset = PROVIDER_PRESETS[id];
  if (!preset) throw new Error('Unsupported provider: ' + provider + '. Supported providers: ' + listProviderIds().join(', '));
  return preset;
}

function resolveProviderConfig(options = {}) {
  const provider = options.provider || process.env.LLM_PROVIDER;
  const preset = getProviderPreset(provider);
  const apiKeyEnv = options.apiKeyEnv || (preset && preset.apiKeyEnv) || null;
  const providerApiKey = apiKeyEnv ? process.env[apiKeyEnv] : '';
  const resolved = {
    provider: preset ? preset.id : null,
    apiKeyEnv,
    providerApiKey,
    apiKey: options.apiKey || process.env.LLM_API_KEY || providerApiKey || '',
    baseUrl: (options.baseUrl || process.env.LLM_BASE_URL || (preset && preset.baseUrl) || PROVIDER_PRESETS.openai.baseUrl).replace(/\/$/, ''),
    model: options.model || process.env.LLM_MODEL || (preset && preset.model) || PROVIDER_PRESETS.openai.model,
    protocol: options.protocol || process.env.LLM_PROTOCOL || (preset && preset.protocol) || 'openai'
  };
  return resolved;
}

function listProviders() {
  return Object.values(PROVIDER_PRESETS).map((preset) => ({ ...preset }));
}

function listProviderIds() {
  return Object.keys(PROVIDER_PRESETS);
}

module.exports = { PROVIDER_PRESETS, getProviderPreset, resolveProviderConfig, listProviders, listProviderIds };
