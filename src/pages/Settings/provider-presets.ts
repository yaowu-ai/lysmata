import type { OpenClawApiType } from "../../shared/types";

export interface ProviderPreset {
  id: string;
  label: string;
  api: OpenClawApiType;
  baseUrl: string;
  models: Array<{ id: string; name: string }>;
}

export interface ProviderGroup {
  label: string;
  providers: ProviderPreset[];
}

export const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    label: "国际",
    providers: [
      {
        id: "openai",
        label: "OpenAI",
        api: "openai-completions",
        baseUrl: "https://api.openai.com/v1",
        models: [
          { id: "gpt-5.4", name: "GPT-5.4" },
          { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
          { id: "gpt-5.2", name: "GPT-5.2" },
          { id: "gpt-5.2-instant", name: "GPT-5.2 Instant" },
          { id: "gpt-5.1", name: "GPT-5.1" },
          { id: "gpt-5-codex-mini", name: "GPT-5 Codex Mini" },
          { id: "gpt-4.1", name: "GPT-4.1" },
          { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
          { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
          { id: "gpt-4o", name: "GPT-4o" },
          { id: "gpt-4o-mini", name: "GPT-4o Mini" },
          { id: "o4-mini", name: "o4-mini" },
          { id: "o3", name: "o3" },
          { id: "o3-mini", name: "o3-mini" },
          { id: "gpt-image-1", name: "GPT Image 1" },
        ],
      },
      {
        id: "anthropic",
        label: "Anthropic",
        api: "anthropic-messages",
        baseUrl: "https://api.anthropic.com",
        models: [
          { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
          { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
          { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
          { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
        ],
      },
      {
        id: "google",
        label: "Google",
        api: "google-generative-ai",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        models: [
          { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
          { id: "gemini-3-flash", name: "Gemini 3 Flash" },
          { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
          { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
          { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
        ],
      },
      {
        id: "groq",
        label: "Groq",
        api: "openai-completions",
        baseUrl: "https://api.groq.com/openai/v1",
        models: [
          { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
          { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B" },
          { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
          { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B" },
          { id: "groq/compound", name: "Compound (含搜索)" },
          { id: "groq/compound-mini", name: "Compound Mini" },
        ],
      },
      {
        id: "openrouter",
        label: "OpenRouter",
        api: "openai-completions",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [
          { id: "openai/gpt-5.4", name: "GPT-5.4" },
          { id: "openai/gpt-5.2", name: "GPT-5.2" },
          { id: "openai/gpt-4.1", name: "GPT-4.1" },
          { id: "openai/o4-mini", name: "o4-mini" },
          { id: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6" },
          { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
          { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
          { id: "google/gemini-3.1-pro", name: "Gemini 3.1 Pro" },
          { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
          { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
          { id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
          { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
          { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
          { id: "qwen/qwen3-235b-a22b", name: "Qwen 3 235B" },
        ],
      },
    ],
  },
  {
    label: "国内",
    providers: [
      {
        id: "deepseek",
        label: "DeepSeek（深度求索）",
        api: "openai-completions",
        baseUrl: "https://api.deepseek.com",
        models: [
          { id: "deepseek-chat", name: "DeepSeek V3.2" },
          { id: "deepseek-reasoner", name: "DeepSeek R1" },
        ],
      },
      {
        id: "zhipu",
        label: "智谱 AI",
        api: "openai-completions",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        models: [
          { id: "glm-5", name: "GLM-5" },
          { id: "glm-4.7", name: "GLM-4.7" },
          { id: "glm-4.7-flash", name: "GLM-4.7 Flash (免费)" },
          { id: "glm-4.7-flashx", name: "GLM-4.7 FlashX" },
          { id: "glm-4.6", name: "GLM-4.6" },
          { id: "glm-4.6v", name: "GLM-4.6V (视觉)" },
          { id: "glm-4.5-air", name: "GLM-4.5 Air" },
          { id: "glm-4.5-airx", name: "GLM-4.5 AirX" },
          { id: "glm-4-long", name: "GLM-4 Long (1M)" },
        ],
      },
      {
        id: "moonshot",
        label: "Moonshot / Kimi（月之暗面）",
        api: "openai-completions",
        baseUrl: "https://api.moonshot.cn/v1",
        models: [
          { id: "kimi-k2.5", name: "Kimi K2.5 (多模态)" },
          { id: "kimi-k2-thinking", name: "Kimi K2 Thinking" },
          { id: "kimi-k2-thinking-turbo", name: "Kimi K2 Thinking Turbo" },
          { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo Preview" },
          { id: "moonshot-v1-8k", name: "Moonshot V1 8K" },
          { id: "moonshot-v1-32k", name: "Moonshot V1 32K" },
          { id: "moonshot-v1-128k", name: "Moonshot V1 128K" },
        ],
      },
      {
        id: "qwen",
        label: "通义千问（阿里云）",
        api: "openai-completions",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        models: [
          { id: "qwen3-235b-a22b", name: "Qwen 3 235B" },
          { id: "qwen3-32b", name: "Qwen 3 32B" },
          { id: "qwen3-30b-a3b", name: "Qwen 3 30B" },
          { id: "qwen-max", name: "Qwen Max" },
          { id: "qwen-max-latest", name: "Qwen Max (最新)" },
          { id: "qwen-plus", name: "Qwen Plus" },
          { id: "qwen-plus-latest", name: "Qwen Plus (最新)" },
          { id: "qwen-turbo", name: "Qwen Turbo" },
          { id: "qwen-turbo-latest", name: "Qwen Turbo (最新)" },
          { id: "qwen-long", name: "Qwen Long" },
          { id: "qwq-32b", name: "QwQ 32B (推理)" },
          { id: "qwen-vl-max", name: "Qwen VL Max (视觉)" },
          { id: "qwen-vl-plus", name: "Qwen VL Plus (视觉)" },
        ],
      },
      {
        id: "doubao",
        label: "豆包（字节跳动）",
        api: "openai-completions",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        models: [
          { id: "doubao-seed-2-0-pro-260215", name: "Seed 2.0 Pro" },
          { id: "doubao-seed-2-0-lite-260215", name: "Seed 2.0 Lite" },
          { id: "doubao-seed-2-0-mini-260215", name: "Seed 2.0 Mini" },
          { id: "doubao-seed-2-0-code-260215", name: "Seed 2.0 Code" },
          { id: "doubao-1.5-pro-32k", name: "豆包 1.5 Pro 32K" },
          { id: "doubao-1.5-lite-32k", name: "豆包 1.5 Lite 32K" },
          { id: "doubao-1.5-vision-pro-32k", name: "豆包 1.5 Vision Pro" },
        ],
      },
      {
        id: "baichuan",
        label: "百川智能",
        api: "openai-completions",
        baseUrl: "https://api.baichuan-ai.com/v1",
        models: [
          { id: "Baichuan4", name: "Baichuan 4" },
          { id: "Baichuan3-Turbo", name: "Baichuan 3 Turbo" },
          { id: "Baichuan3-Turbo-128k", name: "Baichuan 3 Turbo 128K" },
          { id: "Baichuan2-Turbo", name: "Baichuan 2 Turbo" },
          { id: "Baichuan2-Turbo-192k", name: "Baichuan 2 Turbo 192K" },
        ],
      },
      {
        id: "minimax",
        label: "MiniMax",
        api: "openai-completions",
        baseUrl: "https://api.minimax.chat/v1",
        models: [
          { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
          { id: "MiniMax-M2.5-highspeed", name: "MiniMax M2.5 高速" },
          { id: "MiniMax-M2.1", name: "MiniMax M2.1" },
          { id: "MiniMax-M2.1-highspeed", name: "MiniMax M2.1 高速" },
          { id: "MiniMax-M2", name: "MiniMax M2" },
          { id: "MiniMax-Text-01", name: "MiniMax Text 01" },
        ],
      },
      {
        id: "siliconflow",
        label: "SiliconFlow（硅基流动）",
        api: "openai-completions",
        baseUrl: "https://api.siliconflow.cn/v1",
        models: [
          { id: "Qwen/Qwen3.5-397B-A17B", name: "Qwen 3.5 397B" },
          { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
          { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" },
          { id: "THUDM/GLM-5", name: "GLM-5" },
          { id: "MiniMax/MiniMax-M2.5", name: "MiniMax M2.5" },
          { id: "moonshot-ai/Kimi-K2.5", name: "Kimi K2.5" },
          { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen 2.5 72B" },
          { id: "THUDM/glm-4-9b-chat", name: "GLM-4 9B (免费)" },
          { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen 2.5 7B (免费)" },
        ],
      },
    ],
  },
  {
    label: "本地部署",
    providers: [
      {
        id: "ollama",
        label: "Ollama",
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11434/v1",
        models: [
          { id: "llama3.3", name: "Llama 3.3" },
          { id: "llama3.1", name: "Llama 3.1" },
          { id: "qwen2.5", name: "Qwen 2.5" },
          { id: "qwen3", name: "Qwen 3" },
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
        label: "LM Studio",
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:1234/v1",
        models: [
          { id: "local-model", name: "本地模型" },
        ],
      },
      {
        id: "vllm",
        label: "vLLM",
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:8000/v1",
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
