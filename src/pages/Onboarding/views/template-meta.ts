export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const TEMPLATES: TemplateOption[] = [
  {
    id: "general",
    name: "通用助手",
    description: "适合日常提问、总结和协作，是最稳妥的默认入口。",
    icon: "✨",
  },
  {
    id: "info",
    name: "信息助手",
    description: "适合检索、归纳和解释复杂信息，帮助你更快理解内容。",
    icon: "🔎",
  },
  {
    id: "task",
    name: "日常任务助手",
    description: "适合拆解待办、撰写文本和行动规划，聚焦执行。",
    icon: "✅",
  },
];

export function getTemplateMeta(templateId: string): { name: string; icon: string } {
  const hit = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
  return { name: hit.name, icon: hit.icon };
}