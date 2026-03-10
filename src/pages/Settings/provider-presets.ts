/**
 * Provider presets — model IDs must match openclaw's native provider IDs
 * exactly as shown in `openclaw models list --all`.
 *
 * For built-in providers (openai, anthropic, google, zai, etc.) the format is:
 *   {provider}/{model-id}
 *
 * For custom providers added via models.providers in openclaw.json, the key
 * you choose becomes the provider prefix.
 */

import type { OpenClawApiType } from "../../shared/types";

export interface ProviderPreset {
  id: string;
  label: string;
  /** Used when adding a custom provider entry (built-in providers don't need this) */
  api?: OpenClawApiType;
  /** Used when adding a custom provider entry */
  baseUrl?: string;
  /** Whether this is a built-in openclaw provider (no custom config needed) */
  builtin: boolean;
  models: Array<{ id: string; name: string }>;
}

export interface ProviderGroup {
  label: string;
  providers: ProviderPreset[];
}

export const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    label: "国际（内置）",
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        builtin: true,
        models: [
          { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
          { id: "gpt-5.2", name: "GPT-5.2" },
          { id: "gpt-5.2-pro", name: "GPT-5.2 Pro" },
          { id: "gpt-5.1", name: "GPT-5.1" },
          { id: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
          { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini" },
          { id: "gpt-5", name: "GPT-5" },
          { id: "gpt-5-mini", name: "GPT-5 Mini" },
          { id: "gpt-5-nano", name: "GPT-5 Nano" },
          { id: "gpt-5-codex", name: "GPT-5 Codex" },
          { id: "gpt-4.1", name: "GPT-4.1" },
          { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
          { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
          { id: "gpt-4o", name: "GPT-4o" },
          { id: "gpt-4o-mini", name: "GPT-4o Mini" },
          { id: "o4-mini", name: "o4-mini" },
          { id: "o3", name: "o3" },
          { id: "o3-mini", name: "o3-mini" },
          { id: "o3-pro", name: "o3-pro" },
          { id: "o1", name: "o1" },
          { id: "o1-pro", name: "o1-pro" },
          { id: "codex-mini-latest", name: "Codex Mini Latest" },
        ],
      },
      {
        id: "anthropic",
        label: "Anthropic",
        builtin: true,
        models: [
          { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
          { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
          { id: "claude-opus-4-1", name: "Claude Opus 4.1" },
          { id: "claude-opus-4-0", name: "Claude Opus 4.0" },
          { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
          { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
          { id: "claude-sonnet-4-0", name: "Claude Sonnet 4.0" },
          { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
          { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet" },
          { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
          { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
        ],
      },
      {
        id: "google",
        label: "Google Gemini",
        builtin: true,
        models: [
          { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
          { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
          { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
          { id: "gemini-flash-latest", name: "Gemini Flash Latest" },
          { id: "gemini-flash-lite-latest", name: "Gemini Flash Lite Latest" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
          { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
          { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
          { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
        ],
      },
      {
        id: "openrouter",
        label: "OpenRouter",
        builtin: true,
        models: [
          { id: "openai/gpt-5.2", name: "GPT-5.2" },
          { id: "openai/gpt-5.1", name: "GPT-5.1" },
          { id: "openai/gpt-4.1", name: "GPT-4.1" },
          { id: "openai/o4-mini", name: "o4-mini" },
          { id: "openai/o3", name: "o3" },
          { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
          { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6" },
          { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
          { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
          { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
          { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
          { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
          { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2" },
          { id: "deepseek/deepseek-r1-0528", name: "DeepSeek R1" },
          { id: "qwen/qwen3-235b-a22b", name: "Qwen 3 235B" },
          { id: "qwen/qwen3-coder", name: "Qwen 3 Coder" },
          { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
          { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
          { id: "x-ai/grok-4", name: "Grok 4" },
          { id: "x-ai/grok-3", name: "Grok 3" },
        ],
      },
      {
        id: "groq",
        label: "Groq",
        builtin: true,
        models: [
          { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
          { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B" },
          { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
          { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B" },
          { id: "qwen-qwq-32b", name: "QwQ 32B" },
          { id: "qwen/qwen3-32b", name: "Qwen 3 32B" },
          { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2" },
          { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B" },
          { id: "gemma2-9b-it", name: "Gemma 2 9B" },
        ],
      },
      {
        id: "xai",
        label: "xAI (Grok)",
        builtin: true,
        models: [
          { id: "grok-4", name: "Grok 4" },
          { id: "grok-4-fast", name: "Grok 4 Fast" },
          { id: "grok-3", name: "Grok 3" },
          { id: "grok-3-mini", name: "Grok 3 Mini" },
          { id: "grok-2", name: "Grok 2" },
        ],
      },
      {
        id: "mistral",
        label: "Mistral",
        builtin: true,
        models: [
          { id: "devstral-medium-latest", name: "Devstral Medium" },
          { id: "devstral-small-2507", name: "Devstral Small" },
          { id: "mistral-large-latest", name: "Mistral Large" },
          { id: "mistral-medium-latest", name: "Mistral Medium" },
          { id: "mistral-small-latest", name: "Mistral Small" },
          { id: "codestral-latest", name: "Codestral" },
          { id: "magistral-medium-latest", name: "Magistral Medium" },
          { id: "pixtral-large-latest", name: "Pixtral Large" },
        ],
      },
      {
        id: "cerebras",
        label: "Cerebras",
        builtin: true,
        models: [
          { id: "gpt-oss-120b", name: "GPT-OSS 120B" },
          { id: "qwen-3-235b-a22b-instruct-2507", name: "Qwen 3 235B" },
          { id: "zai-glm-4.7", name: "GLM-4.7" },
          { id: "llama3.1-8b", name: "Llama 3.1 8B" },
        ],
      },
      {
        id: "minimax",
        label: "MiniMax（国际）",
        builtin: true,
        models: [
          { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
          { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 高速" },
          { id: "MiniMax-M2.1", name: "MiniMax M2.1" },
          { id: "MiniMax-M2", name: "MiniMax M2" },
        ],
      },
    ],
  },
  {
    label: "国内（内置）",
    providers: [
      {
        id: "zai",
        label: "智谱 AI（ZAI）",
        builtin: true,
        models: [
          { id: "glm-5", name: "GLM-5" },
          { id: "glm-4.7", name: "GLM-4.7" },
          { id: "glm-4.7-flash", name: "GLM-4.7 Flash" },
          { id: "glm-4.6", name: "GLM-4.6" },
          { id: "glm-4.6v", name: "GLM-4.6V (视觉)" },
          { id: "glm-4.5", name: "GLM-4.5" },
          { id: "glm-4.5-air", name: "GLM-4.5 Air" },
          { id: "glm-4.5-flash", name: "GLM-4.5 Flash" },
          { id: "glm-4.5v", name: "GLM-4.5V (视觉)" },
        ],
      },
      {
        id: "kimi-coding",
        label: "Kimi（月之暗面）",
        builtin: true,
        models: [
          { id: "k2p5", name: "Kimi K2.5" },
          { id: "kimi-k2-thinking", name: "Kimi K2 Thinking" },
        ],
      },
      {
        id: "minimax-cn",
        label: "MiniMax（国内）",
        builtin: true,
        models: [
          { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
          { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 高速" },
          { id: "MiniMax-M2.1", name: "MiniMax M2.1" },
          { id: "MiniMax-M2", name: "MiniMax M2" },
        ],
      },
    ],
  },
  {
    label: "自定义 Provider",
    providers: [
      {
        id: "deepseek",
        label: "DeepSeek（直连）",
        builtin: false,
        api: "openai-completions",
        baseUrl: "https://api.deepseek.com",
        models: [
          { id: "deepseek-chat", name: "DeepSeek V3.2" },
          { id: "deepseek-reasoner", name: "DeepSeek R1" },
        ],
      },
      {
        id: "moonshot",
        label: "Moonshot / Kimi（直连）",
        builtin: false,
        api: "openai-completions",
        baseUrl: "https://api.moonshot.cn/v1",
        models: [
          { id: "moonshot-v1-8k", name: "Moonshot V1 8K" },
          { id: "moonshot-v1-32k", name: "Moonshot V1 32K" },
          { id: "moonshot-v1-128k", name: "Moonshot V1 128K" },
        ],
      },
      {
        id: "qwen",
        label: "通义千问（阿里云直连）",
        builtin: false,
        api: "openai-completions",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        models: [
          { id: "qwen3-235b-a22b", name: "Qwen 3 235B" },
          { id: "qwen3-32b", name: "Qwen 3 32B" },
          { id: "qwen3-30b-a3b", name: "Qwen 3 30B" },
          { id: "qwen-max", name: "Qwen Max" },
          { id: "qwen-plus", name: "Qwen Plus" },
          { id: "qwen-turbo", name: "Qwen Turbo" },
          { id: "qwen-long", name: "Qwen Long" },
          { id: "qwq-32b", name: "QwQ 32B (推理)" },
        ],
      },
      {
        id: "doubao",
        label: "豆包（字节跳动）",
        builtin: false,
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        models: [
          { id: "doubao-seed-2-0-pro-260215", name: "Seed 2.0 Pro" },
          { id: "doubao-seed-2-0-lite-260215", name: "Seed 2.0 Lite" },
          { id: "doubao-seed-2-0-mini-260215", name: "Seed 2.0 Mini" },
          { id: "doubao-seed-2-0-code-260215", name: "Seed 2.0 Code" },
          { id: "doubao-1.5-pro-32k", name: "豆包 1.5 Pro 32K" },
          { id: "doubao-1.5-lite-32k", name: "豆包 1.5 Lite 32K" },
        ],
      },
      {
        id: "baichuan",
        label: "百川智能",
        builtin: false,
        api: "openai-completions",
        baseUrl: "https://api.baichuan-ai.com/v1",
        models: [
          { id: "Baichuan4", name: "Baichuan 4" },
          { id: "Baichuan3-Turbo", name: "Baichuan 3 Turbo" },
          { id: "Baichuan3-Turbo-128k", name: "Baichuan 3 Turbo 128K" },
          { id: "Baichuan2-Turbo", name: "Baichuan 2 Turbo" },
        ],
      },
      {
        id: "siliconflow",
        label: "SiliconFlow（硅基流动）",
        builtin: false,
        api: "openai-completions",
        baseUrl: "https://api.siliconflow.cn/v1",
        models: [
          { id: "Qwen/Qwen3.5-397B-A17B", name: "Qwen 3.5 397B" },
          { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
          { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" },
          { id: "THUDM/GLM-5", name: "GLM-5" },
          { id: "MiniMax/MiniMax-M2.5", name: "MiniMax M2.5" },
          { id: "moonshotai/Kimi-K2.5", name: "Kimi K2.5" },
          { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen 2.5 72B" },
          { id: "THUDM/glm-4-9b-chat", name: "GLM-4 9B (免费)" },
        ],
      },
      {
        id: "ollama",
        label: "Ollama（本地）",
        builtin: false,
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11434/v1",
        models: [
          { id: "llama3.3", name: "Llama 3.3" },
          { id: "llama3.1", name: "Llama 3.1" },
          { id: "qwen3", name: "Qwen 3" },
          { id: "qwen2.5", name: "Qwen 2.5" },
          { id: "deepseek-r1", name: "DeepSeek R1" },
          { id: "deepseek-v3", name: "DeepSeek V3" },
          { id: "gemma2", name: "Gemma 2" },
          { id: "phi4", name: "Phi-4" },
          { id: "mistral", name: "Mistral" },
          { id: "codellama", name: "Code Llama" },
        ],
      },
      {
        id: "lmstudio",
        label: "LM Studio（本地）",
        builtin: false,
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:1234/v1",
        models: [
          { id: "local-model", name: "本地模型" },
        ],
      },
    ],
  },
];

export const ALL_PRESETS: ProviderPreset[] = PROVIDER_GROUPS.flatMap((g) => g.providers);

export function findPreset(id: string): ProviderPreset | undefined {
  return ALL_PRESETS.find((p) => p.id === id);
}
