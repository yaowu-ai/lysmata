import { mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BotService } from "./bot-service";
import { readGatewaySettings } from "./openclaw-config-file";

export type WorkspaceTemplateId = "export-owner" | "equipment-rental" | "platform-ops";

export interface WorkspaceTemplateField {
  key: string;
  label: string;
  type: "text" | "textarea";
  required: boolean;
  placeholder?: string;
  maxLength?: number;
}

export interface WorkspaceTemplateMeta {
  id: WorkspaceTemplateId;
  name: string;
  description: string;
  icon: string;
  badge: string;
  footnote: string;
  outcome: string;
  generatedFiles: string[];
}

export interface WorkspaceTemplateSchema {
  template: WorkspaceTemplateMeta;
  defaults: {
    assistantName: string;
    assistantGoal: string;
    toneStyle: string;
  };
  fields: WorkspaceTemplateField[];
}

export interface ApplyWorkspaceTemplateInput {
  templateId: WorkspaceTemplateId;
  assistantName: string;
  assistantGoal: string;
  toneStyle: string;
}

export interface WrittenWorkspaceFile {
  kind: "agents" | "soul" | "tools" | "memory" | "assistant-profile";
  relativePath: string;
  absolutePath: string;
  sourceTemplate: WorkspaceTemplateId;
}

export interface ApplyWorkspaceTemplateResult {
  success: true;
  assistantId: string;
  assistantName: string;
  botId: string;
  botName: string;
  workspacePath: string;
  writtenFiles: WrittenWorkspaceFile[];
  warnings: string[];
}

interface WorkspaceTemplateDefinition {
  meta: WorkspaceTemplateMeta;
  schema: Omit<WorkspaceTemplateSchema, "template">;
  render: (input: ApplyWorkspaceTemplateInput, workspacePath: string) => Record<string, string>;
}

const MANAGED_HEADER = "<!-- Managed by Lysmata onboarding -->";

const GENERATED_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "MEMORY.md",
  "assistants/profile.md",
];

const TEMPLATE_BOT_EMOJI: Record<WorkspaceTemplateId, string> = {
  "export-owner": "🌍",
  "equipment-rental": "🏗️",
  "platform-ops": "📈",
};

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "assistant";
}

function baseAgentsMd(input: ApplyWorkspaceTemplateInput): string {
  return `${MANAGED_HEADER}
# AGENTS.md

你是 ${input.assistantName}，服务于当前业务场景。

## 核心目标

${input.assistantGoal}

## 回复风格

${input.toneStyle}

## 默认规则

- 优先给出可执行建议，而不是泛泛而谈。
- 先用业务语言表达，再补必要的结构化内容。
- 涉及风险、成本、时效时必须明确指出。

## 会话开始

- 先阅读 SOUL.md、TOOLS.md、MEMORY.md。
- 在业务语境下理解用户的最新目标和限制。
`;
}

function baseSoulMd(input: ApplyWorkspaceTemplateInput, persona: string): string {
  return `${MANAGED_HEADER}
# SOUL.md

## 角色设定

${persona}

## 协作方式

- 语气风格：${input.toneStyle}
- 目标导向：${input.assistantGoal}
- 当信息不足时，先提出 1 到 3 个关键澄清问题。
`;
}

function baseToolsMd(toolNotes: string[]): string {
  return `${MANAGED_HEADER}
# TOOLS.md

## 优先工具习惯

${toolNotes.map((note) => `- ${note}`).join("\n")}
`;
}

function baseMemoryMd(memoryNotes: string[]): string {
  return `${MANAGED_HEADER}
# MEMORY.md

## 初始记忆

${memoryNotes.map((note) => `- ${note}`).join("\n")}
`;
}

function baseAssistantProfileMd(
  input: ApplyWorkspaceTemplateInput,
  workflow: string[],
  prompts: string[],
): string {
  return `${MANAGED_HEADER}
# ${input.assistantName}

## 助手目标

${input.assistantGoal}

## 工作节奏

${workflow.map((item) => `- ${item}`).join("\n")}

## 开场建议

${prompts.map((item) => `- ${item}`).join("\n")}
`;
}

const TEMPLATE_DEFINITIONS: Record<WorkspaceTemplateId, WorkspaceTemplateDefinition> = {
  "export-owner": {
    meta: {
      id: "export-owner",
      name: "外贸老板",
      description: "适合客户跟进、报价、邮件沟通与订单推进。",
      icon: "🌍",
      badge: "业务协同",
      footnote: "偏客户与订单推进",
      outcome: "更擅长处理外贸业务节奏、客户沟通和报价推进。",
      generatedFiles: GENERATED_FILES,
    },
    schema: {
      defaults: {
        assistantName: "我的外贸助手",
        assistantGoal: "帮助我推进客户沟通、报价、订单与交付节奏。",
        toneStyle: "专业、直接、重视时效和商业礼貌",
      },
      fields: [
        {
          key: "assistantName",
          label: "助手名称",
          type: "text",
          required: true,
          placeholder: "例如：我的外贸助手",
          maxLength: 40,
        },
        {
          key: "assistantGoal",
          label: "你最希望它帮你推进什么",
          type: "textarea",
          required: true,
          placeholder: "例如：跟进客户、整理报价、推进订单与回款",
          maxLength: 200,
        },
        {
          key: "toneStyle",
          label: "你希望它的协作风格",
          type: "textarea",
          required: true,
          placeholder: "例如：专业、简洁、能主动提醒风险和下一步",
          maxLength: 120,
        },
      ],
    },
    render: (input, workspacePath) => ({
      "AGENTS.md": baseAgentsMd(input),
      "SOUL.md": baseSoulMd(
        input,
        "你是一名擅长外贸业务推进的经营助手，关注客户、报价、交付与回款。",
      ),
      "TOOLS.md": baseToolsMd([
        "优先把邮件、报价、客户跟进拆成清晰下一步。",
        "遇到多语言内容时先给出双语摘要，再给出建议。",
        "涉及报价或交期时，必须显式标注风险和待确认项。",
      ]),
      "MEMORY.md": baseMemoryMd([
        `当前 assistant workspace: ${workspacePath}`,
        "默认关注客户跟进、报价整理、订单推进。",
      ]),
      "assistants/profile.md": baseAssistantProfileMd(
        input,
        [
          "先识别当前处于获客、报价、订单还是交付阶段。",
          "输出建议时附上下一步动作、责任人和时间点。",
          "对影响成交和回款的风险优先提醒。",
        ],
        [
          "帮我整理今天要跟进的客户和下一步动作。",
          "把这封客户邮件总结成风险点和回复建议。",
          "按成交概率和紧急度排序当前订单。",
        ],
      ),
    }),
  },
  "equipment-rental": {
    meta: {
      id: "equipment-rental",
      name: "工程机械租赁商",
      description: "适合设备档期、询价、合同、维修和回款安排。",
      icon: "🏗️",
      badge: "执行导向",
      footnote: "偏调度与回款",
      outcome: "更擅长租赁调度、设备台账和执行推进。",
      generatedFiles: GENERATED_FILES,
    },
    schema: {
      defaults: {
        assistantName: "我的租赁助手",
        assistantGoal: "帮助我协调设备档期、客户询价、合同推进和回款提醒。",
        toneStyle: "稳健、务实、偏执行管理",
      },
      fields: [
        {
          key: "assistantName",
          label: "助手名称",
          type: "text",
          required: true,
          placeholder: "例如：我的租赁助手",
          maxLength: 40,
        },
        {
          key: "assistantGoal",
          label: "它最该帮你守住什么",
          type: "textarea",
          required: true,
          placeholder: "例如：档期、设备安排、合同节点、回款和保养",
          maxLength: 200,
        },
        {
          key: "toneStyle",
          label: "你希望它如何提醒与推进",
          type: "textarea",
          required: true,
          placeholder: "例如：直接、少废话、优先提醒逾期和冲突",
          maxLength: 120,
        },
      ],
    },
    render: (input, workspacePath) => ({
      "AGENTS.md": baseAgentsMd(input),
      "SOUL.md": baseSoulMd(
        input,
        "你是一名工程机械租赁业务助手，关注设备档期、客户询价、合同与回款。",
      ),
      "TOOLS.md": baseToolsMd([
        "先判断问题属于设备调度、合同、回款还是保养。",
        "输出建议时优先呈现冲突、逾期和高风险事项。",
        "涉及设备安排时，要明确时间、设备、地点和责任人。",
      ]),
      "MEMORY.md": baseMemoryMd([
        `当前 assistant workspace: ${workspacePath}`,
        "默认关注设备档期、合同节点、回款、保养。",
      ]),
      "assistants/profile.md": baseAssistantProfileMd(
        input,
        [
          "先把问题归类到调度、合同、维修、回款四类。",
          "优先列出今天必须处理的冲突和逾期事项。",
          "每次输出都尽量给出下一步责任分工。",
        ],
        [
          "帮我列出今天设备档期冲突和处理建议。",
          "把待回款客户按金额和逾期天数排序。",
          "把合同关键节点整理成提醒清单。",
        ],
      ),
    }),
  },
  "platform-ops": {
    meta: {
      id: "platform-ops",
      name: "平台运营能手",
      description: "适合活动排期、数据复盘、异常处理与跨团队协作。",
      icon: "📈",
      badge: "结果导向",
      footnote: "偏运营节奏与复盘",
      outcome: "更擅长活动推进、数据复盘和运营动作拆解。",
      generatedFiles: GENERATED_FILES,
    },
    schema: {
      defaults: {
        assistantName: "我的运营助手",
        assistantGoal: "帮助我推进活动排期、数据复盘、异常处理和跨团队协作。",
        toneStyle: "清晰、结果导向、善于拆解动作",
      },
      fields: [
        {
          key: "assistantName",
          label: "助手名称",
          type: "text",
          required: true,
          placeholder: "例如：我的运营助手",
          maxLength: 40,
        },
        {
          key: "assistantGoal",
          label: "你最希望它帮你提升什么",
          type: "textarea",
          required: true,
          placeholder: "例如：活动推进、数据复盘、日报周报和异常响应",
          maxLength: 200,
        },
        {
          key: "toneStyle",
          label: "你希望它的输出风格",
          type: "textarea",
          required: true,
          placeholder: "例如：结构清楚、偏复盘、每次都给下一步动作",
          maxLength: 120,
        },
      ],
    },
    render: (input, workspacePath) => ({
      "AGENTS.md": baseAgentsMd(input),
      "SOUL.md": baseSoulMd(
        input,
        "你是一名平台运营助手，关注活动推进、数据变化、异常处理和团队协作。",
      ),
      "TOOLS.md": baseToolsMd([
        "先判断问题属于活动、内容、数据、商品、用户还是异常。",
        "给结论时同时输出原因、影响和下一步动作。",
        "数据结论必须区分事实、推测和待验证项。",
      ]),
      "MEMORY.md": baseMemoryMd([
        `当前 assistant workspace: ${workspacePath}`,
        "默认关注活动排期、数据复盘、异常跟进。",
      ]),
      "assistants/profile.md": baseAssistantProfileMd(
        input,
        [
          "优先输出运营节奏、关键指标和异常项。",
          "把结论拆成可执行动作，并标明优先级。",
          "跨团队事项要补充协作对象和依赖。",
        ],
        [
          "帮我整理今天要推进的活动和负责人。",
          "把这组数据异常总结成原因假设和验证动作。",
          "按优先级输出本周运营动作清单。",
        ],
      ),
    }),
  },
};

export function listWorkspaceTemplates(): WorkspaceTemplateMeta[] {
  return Object.values(TEMPLATE_DEFINITIONS).map((item) => item.meta);
}

export function getWorkspaceTemplateSchema(templateId: WorkspaceTemplateId): WorkspaceTemplateSchema {
  const template = TEMPLATE_DEFINITIONS[templateId];
  return {
    template: template.meta,
    defaults: template.schema.defaults,
    fields: template.schema.fields,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveAssistantWorkspacePath(assistantId: string): Promise<string> {
  const root = join(homedir(), ".openclaw", "workspaces");
  await mkdir(root, { recursive: true });

  let candidate = join(root, assistantId);
  let suffix = 2;
  while (await pathExists(candidate)) {
    candidate = join(root, `${assistantId}-${suffix}`);
    suffix += 1;
  }
  return candidate;
}

export async function applyWorkspaceTemplate(
  input: ApplyWorkspaceTemplateInput,
): Promise<ApplyWorkspaceTemplateResult> {
  const definition = TEMPLATE_DEFINITIONS[input.templateId];
  const assistantName = input.assistantName.trim();
  const assistantGoal = input.assistantGoal.trim();
  const toneStyle = input.toneStyle.trim();

  if (!assistantName || !assistantGoal || !toneStyle) {
    throw new Error("助手名称、目标和协作风格不能为空。");
  }

  const assistantId = slugify(assistantName);
  const workspacePath = await resolveAssistantWorkspacePath(assistantId);
  await mkdir(join(workspacePath, "assistants"), { recursive: true });

  const normalizedInput: ApplyWorkspaceTemplateInput = {
    templateId: input.templateId,
    assistantName,
    assistantGoal,
    toneStyle,
  };

  const files = definition.render(normalizedInput, workspacePath);
  const writtenFiles: WrittenWorkspaceFile[] = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(workspacePath, relativePath);
    await Bun.write(absolutePath, content);

    let kind: WrittenWorkspaceFile["kind"] = "assistant-profile";
    if (relativePath === "AGENTS.md") kind = "agents";
    else if (relativePath === "SOUL.md") kind = "soul";
    else if (relativePath === "TOOLS.md") kind = "tools";
    else if (relativePath === "MEMORY.md") kind = "memory";

    writtenFiles.push({
      kind,
      relativePath,
      absolutePath,
      sourceTemplate: input.templateId,
    });
  }

  const gatewaySettings = await readGatewaySettings().catch(() => null);
  const defaultGatewayPort = gatewaySettings?.port ?? 18789;
  const defaultGatewayUrl = `ws://localhost:${defaultGatewayPort}/ws`;
  const defaultGatewayToken =
    gatewaySettings?.authMode === "token" ? gatewaySettings.authToken ?? undefined : undefined;
  const bot = BotService.create({
    name: assistantName,
    avatar_emoji: TEMPLATE_BOT_EMOJI[input.templateId],
    description: assistantGoal,
    skills_config: [],
    mcp_config: {},
    llm_config: {},
    backend_url: defaultGatewayUrl,
    backend_token: defaultGatewayToken,
    agent_id: "main",
    is_active: true,
  });

  return {
    success: true,
    assistantId,
    assistantName,
    botId: bot.id,
    botName: bot.name,
    workspacePath,
    writtenFiles,
    warnings: [],
  };
}