import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  applyWorkspaceTemplate,
  fetchWorkspaceTemplateSchema,
} from "../../shared/hooks/useOnboardingWorkspace";
import {
  getOnboardingRuntimeState,
  setOnboardingRuntimeState,
} from "../../shared/store/onboarding-runtime-store";
import type { WorkspaceTemplateSchema } from "../../shared/types";
import { getTemplateMeta } from "../Onboarding/views/template-meta";
import { OnboardingPageShell } from "./OnboardingPageShell";

export function OnboardingPage() {
  const navigate = useNavigate();
  const runtimeState = useMemo(() => getOnboardingRuntimeState(), []);
  const templateId = runtimeState.selectedTemplateId ?? "export-owner";
  const templateMeta = getTemplateMeta(templateId);
  const [schema, setSchema] = useState<WorkspaceTemplateSchema | null>(null);
  const [assistantName, setAssistantName] = useState(runtimeState.assistantName ?? "");
  const [assistantGoal, setAssistantGoal] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchWorkspaceTemplateSchema(templateId)
      .then((result) => {
        if (cancelled) return;
        setSchema(result);
        setAssistantName((current) => current || result.defaults.assistantName);
        setAssistantGoal(result.defaults.assistantGoal);
        setToneStyle(result.defaults.toneStyle);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "助手配置加载失败，请稍后重试。");
      });

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  async function handleCreateAssistant() {
    setError("");
    setIsSaving(true);
    try {
      const result = await applyWorkspaceTemplate({
        templateId,
        assistantName,
        assistantGoal,
        toneStyle,
      });

      setOnboardingRuntimeState({
        ...runtimeState,
        selectedTemplateId: templateId,
        initializedAssistantAt: Date.now(),
        assistantName: result.assistantName,
        assistantWorkspacePath: result.workspacePath,
        createdBotId: result.botId,
        createdBotName: result.botName,
      });

      navigate("/onboarding/ready", { state: result });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "助手初始化失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  const footer = {
    hint: "点击创建后会生成该助手的专属 OpenClaw workspace 和初始化 markdown。",
    actions: [
      {
        label: "上一步",
        onClick: () => navigate("/onboarding/template"),
        variant: "secondary" as const,
        disabled: isSaving,
      },
      {
        label: isSaving ? "创建中..." : "创建助手并初始化",
        onClick: () => {
          void handleCreateAssistant();
        },
        variant: "primary" as const,
        disabled:
          isSaving ||
          !assistantName.trim() ||
          !assistantGoal.trim() ||
          !toneStyle.trim() ||
          !schema,
      },
    ],
  };

  return (
    <OnboardingPageShell
      footer={footer}
      mainClassName="items-start"
      contentClassName="max-w-[760px]"
    >
      <section>
        <div className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-[11px] font-semibold text-[#2563EB]">
          Step 5 / 创建助手
        </div>
        <h2 className="mt-4 text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#0F172A]">
          完善你的第一个助手
        </h2>
        <p className="mt-3 text-[14px] leading-7 text-[#64748B]">
          当前模板为
          <span className="font-semibold text-[#0F172A]">
            {" "}
            {templateMeta.icon} {templateMeta.name}
          </span>
          。补齐助手名称、目标和协作风格后，系统会为它创建独立 workspace 并写入初始化 markdown。
        </p>

        <div className="mt-6 rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="text-[14px] font-semibold text-[#0F172A]">助手信息</div>

          <div className="mt-4 grid gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#0F172A]">助手名称</label>
              <input
                type="text"
                value={assistantName}
                onChange={(event) => setAssistantName(event.target.value)}
                placeholder={schema?.defaults.assistantName ?? "例如：我的外贸助手"}
                className="mt-2 w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none focus:border-[#93C5FD] focus:shadow-[0_0_0_4px_rgba(147,197,253,0.18)]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#0F172A]">
                你最希望它帮你推进什么
              </label>
              <textarea
                value={assistantGoal}
                onChange={(event) => setAssistantGoal(event.target.value)}
                rows={4}
                placeholder={schema?.defaults.assistantGoal ?? "描述你的业务目标"}
                className="mt-2 w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none focus:border-[#93C5FD] focus:shadow-[0_0_0_4px_rgba(147,197,253,0.18)]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#0F172A]">
                你希望它的协作风格
              </label>
              <textarea
                value={toneStyle}
                onChange={(event) => setToneStyle(event.target.value)}
                rows={3}
                placeholder={schema?.defaults.toneStyle ?? "例如：直接、清晰、偏执行"}
                className="mt-2 w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none focus:border-[#93C5FD] focus:shadow-[0_0_0_4px_rgba(147,197,253,0.18)]"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] leading-6 text-[#B91C1C]">
              {error}
            </div>
          ) : null}
        </div>
      </section>
    </OnboardingPageShell>
  );
}
