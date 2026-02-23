import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { readLlmSettings, updateLlmSettings } from '../../core/openclaw-config-file';

const settings = new Hono();

const providerModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
  }).optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
});

const providerSchema = z.object({
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  api: z.string().optional(),
  models: z.array(providerModelSchema),
});

const llmSettingsSchema = z.object({
  providers: z.record(z.string(), providerSchema),
  defaultModel: z.object({
    primary: z.string(),
    fallbacks: z.array(z.string()).optional(),
  }),
});

settings.get('/llm', async (c) => {
  try {
    const data = await readLlmSettings();
    return c.json(data);
  } catch {
    return c.json({ error: 'Failed to read LLM settings' }, 500);
  }
});

settings.put('/llm', zValidator('json', llmSettingsSchema), async (c) => {
  try {
    const body = c.req.valid('json');
    await updateLlmSettings(body);
    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Failed to update LLM settings' }, 500);
  }
});

export default settings;
