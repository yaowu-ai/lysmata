export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  badge: string;
  footnote: string;
  outcome: string;
}

export const TEMPLATES: TemplateOption[] = [
  {
    id: "export-owner",
    name: "外贸老板",
    description: "适合客户跟进、报价、邮件沟通与订单推进。",
    icon: "🌍",
    badge: "业务协同",
    footnote: "偏客户与订单推进",
    outcome: "更擅长处理外贸业务节奏、客户沟通和报价推进。",
  },
  {
    id: "equipment-rental",
    name: "工程机械租赁商",
    description: "适合设备档期、询价、合同、维修和回款安排。",
    icon: "🏗️",
    badge: "执行导向",
    footnote: "偏调度与回款",
    outcome: "更擅长租赁调度、设备台账和执行推进。",
  },
  {
    id: "platform-ops",
    name: "平台运营能手",
    description: "适合活动排期、数据复盘、异常处理与跨团队协作。",
    icon: "📈",
    badge: "结果导向",
    footnote: "偏运营节奏与复盘",
    outcome: "更擅长活动推进、数据复盘和运营动作拆解。",
  },
];

export function getTemplateMeta(templateId: string): { name: string; icon: string } {
  const hit = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
  return { name: hit.name, icon: hit.icon };
}