import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchWorkspaceTemplates,
} from "../../shared/hooks/useOnboardingWorkspace";
import {
  getOnboardingRuntimeState,
  setOnboardingRuntimeState,
} from "../../shared/store/onboarding-runtime-store";
import type { WorkspaceTemplateMeta } from "../../shared/types";
import { TEMPLATES } from "../Onboarding/views/template-meta";
import { OnboardingPageShell } from "./OnboardingPageShell";

type TemplateId = "export-owner" | "equipment-rental" | "platform-ops";

function iconBackground(templateId: TemplateId) {
  switch (templateId) {
    case "equipment-rental":
      return "bg-[#F0FDF4]";
    case "platform-ops":
      return "bg-[#FFF7ED]";
    case "export-owner":
    default:
      return "bg-[#EFF6FF]";
  }
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const runtimeState = useMemo(() => getOnboardingRuntimeState(), []);
  const [templates, setTemplates] = useState<WorkspaceTemplateMeta[]>(TEMPLATES as WorkspaceTemplateMeta[]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>(
    (runtimeState.selectedTemplateId as TemplateId | null) ?? "export-owner",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchWorkspaceTemplates()
      .then((result) => {
        if (cancelled) return;
        setTemplates(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "模板加载失败，请稍后重试。");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? TEMPLATES[0];

  function handleContinue() {
    setOnboardingRuntimeState({
      ...runtimeState,
      selectedTemplateId,
      initializedAssistantAt: null,
      assistantName: runtimeState.assistantName,
      assistantWorkspacePath: null,
      createdBotId: null,
      createdBotName: null,
    });
    navigate("/onboarding/assistant");
  }

  const footer = {
    hint: "这一步只确定模板方向。下一步补充助手信息后，才会真正初始化专属 workspace。",
    actions: [
      {
        label: "上一步",
        onClick: () => navigate("/onboarding/provider"),
        variant: "secondary" as const,
        disabled: isLoading,
      },
      {
        label: "下一步：完善助手信息",
        onClick: handleContinue,
        variant: "primary" as const,
        disabled: isLoading || !selectedTemplate,
      },
    ],
  };

  return (
    <OnboardingPageShell
      footer={footer}
      mainClassName="items-start"
      contentClassName="max-w-[920px]"
    >
      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {templates.map((template) => {
          const isActive = template.id === selectedTemplateId;

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                setSelectedTemplateId(template.id as TemplateId);
                if (loadError) {
                  setLoadError("");
                }
              }}
              className={[
                "rounded-[20px] border p-4 text-left transition-all",
                isActive
                  ? "border-[#93C5FD] bg-[#F8FBFF] shadow-[0_0_0_4px_rgba(147,197,253,0.16)]"
                  : "border-[#E2E8F0] bg-white hover:-translate-y-0.5 hover:border-[#93C5FD]",
              ].join(" ")}
            >
              <div
                className={[
                  "flex h-12 w-12 items-center justify-center rounded-[14px] text-[22px]",
                  iconBackground(template.id as TemplateId),
                ].join(" ")}
              >
                {template.icon}
              </div>
              <div className="mt-3 text-[15px] font-semibold text-[#0F172A]">{template.name}</div>
              <p className="mt-2 text-[12px] leading-6 text-[#64748B]">{template.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-[#64748B]">
                <span>{template.footnote}</span>
                <span>{template.badge}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4 text-[13px] leading-7 text-[#64748B]">
        已选择：
        <span className="font-semibold text-[#0F172A]"> {selectedTemplate?.icon} {selectedTemplate?.name}</span>
        。这一页不会立即写入任何 markdown；完成下一步“创建助手”后，系统才会初始化专属 workspace。
      </div>

      {loadError ? (
        <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] leading-6 text-[#B91C1C]">
          {loadError}
        </div>
      ) : null}
    </OnboardingPageShell>
  );
}
