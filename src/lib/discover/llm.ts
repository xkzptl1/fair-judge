// ----------------------------------------------------------------
// Provider-agnostic LLM wrapper for the discovery enrichment pipeline.
//
// Configuration (all via environment variables — no keys in source):
//   LLM_PROVIDER     = "openai" | "anthropic"   (default: "openai")
//   OPENAI_API_KEY   = sk-...
//   OPENAI_MODEL     = gpt-5-mini                (default; swap to gpt-5-nano for experiments)
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ANTHROPIC_MODEL  = claude-haiku-4-5          (default)
// ----------------------------------------------------------------

type Provider = 'openai' | 'anthropic';

function getProvider(): Provider {
  const raw = process.env.LLM_PROVIDER?.toLowerCase().trim();
  if (raw === 'anthropic') return 'anthropic';
  return 'openai'; // default
}

// ----------------------------------------------------------------
// OpenAI
// ----------------------------------------------------------------
async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini';

  // Lazy-import to avoid bundling both SDKs when only one is needed
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    // temperature omitted — gpt-5-mini and gpt-5-nano only support the default value
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  });

  return response.choices[0]?.message?.content ?? '';
}

// ----------------------------------------------------------------
// Anthropic
// ----------------------------------------------------------------
async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5';

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system:   systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}

// ----------------------------------------------------------------
// Public interface — single call regardless of provider
// ----------------------------------------------------------------
export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const provider = getProvider();
  console.log(`[llm] provider=${provider} model=${
    provider === 'openai'
      ? (process.env.OPENAI_MODEL || 'gpt-5-mini')
      : (process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5')
  }`);

  if (provider === 'anthropic') return callAnthropic(systemPrompt, userPrompt);
  return callOpenAI(systemPrompt, userPrompt);
}

export function activeProvider(): { provider: Provider; model: string } {
  const provider = getProvider();
  const model =
    provider === 'anthropic'
      ? (process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5')
      : (process.env.OPENAI_MODEL    || 'gpt-5-mini');
  return { provider, model };
}
