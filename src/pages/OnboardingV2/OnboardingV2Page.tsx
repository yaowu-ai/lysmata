import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { EnvCheckView } from "../Onboarding/views/EnvCheckView";
import { InstallingView } from "../Onboarding/views/InstallingView";
import { InstallSuccessView } from "../Onboarding/views/InstallSuccessView";
import { ProviderConfigView } from "../Onboarding/views/ProviderConfigView";
import { TemplateSelectView } from "../Onboarding/views/TemplateSelectView";
import { AssistantCreateView } from "../Onboarding/views/AssistantCreateView";
import { FirstChatReadyView } from "../Onboarding/views/FirstChatReadyView";
import {
  clearOnboardingProgress,
  getOnboardingProgress,
} from "../../shared/store/wizard-store";

type StepId =
  | "intro"
  | "env-check"
  | "install"
  | "install-success"
  | "llm-key"
  | "template-select"
  | "assistant-create"
  | "ready";

const FLOW: StepId[] = [
  "intro",
  "env-check",
  "install",
  "install-success",
  "llm-key",
  "template-select",
  "assistant-create",
  "ready",
];

const NAV_STEPS = [
  { id: "env-check", title: "检查环境", index: 1 },
  { id: "install", title: "安装 OpenClaw", index: 2 },
  { id: "llm-key", title: "连接 AI 服务", index: 3 },
  { id: "template-select", title: "选择模板", index: 4 },
  { id: "assistant-create", title: "开始对话", index: 5 },
] as const;

function currentNavIndex(step: StepId): number {
  if (step === "intro") return 0;
  if (step === "install-success") return 2;
  if (step === "ready") return 5;
  const hit = NAV_STEPS.find((item) => item.id === step);
  return hit?.index ?? 0;
}

function persistStep(step: StepId) {
  const shouldStore = step !== "intro" && step !== "ready";
  if (!shouldStore) {
    clearOnboardingProgress();
    return;
  }
  localStorage.setItem(
    "onboarding_progress_v2",
    JSON.stringify({ lastStepId: step, updatedAt: Date.now() }),
  );
}

export function OnboardingV2Page() {
  const navigate = useNavigate();
  const params = useParams<{ step: string }>();
  const submitRef = useRef<(() => Promise<void>) | null>(null);

  const [envCheck, setEnvCheck] = useState<{ canInstall: boolean; hasOpenClaw: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("general");
  const [assistantName, setAssistantName] = useState("我的第一个助手");

  const routeStep = params.step;
  const isValidStep = FLOW.includes((routeStep ?? "") as StepId);
  const step = (isValidStep ? routeStep : "intro") as StepId;

  useEffect(() => {
    if (step !== "intro") return;
    const progress = getOnboardingProgress();
    if (!progress?.lastStepId) return;
    const saved = progress.lastStepId as StepId;
    if (!FLOW.includes(saved) || saved === "intro") return;
    navigate(`/onboarding/${saved}`, { replace: true });
  }, [navigate, step]);

  useEffect(() => {
    persistStep(step);
  }, [step]);

  if (!isValidStep) {
    return <Navigate to="/onboarding/intro" replace />;
  }

  function goto(next: StepId) {
    navigate(`/onboarding/${next}`);
  }

  function next() {
    const idx = FLOW.indexOf(step);
    if (idx >= 0 && idx < FLOW.length - 1) {
      goto(FLOW[idx + 1]);
    }
  }

  function prev() {
    const idx = FLOW.indexOf(step);
    if (idx > 0) {
      goto(FLOW[idx - 1]);
    }
  }

  async function handleNext() {
    if (step === "env-check" && envCheck?.hasOpenClaw) {
      goto("llm-key");
      return;
    }

    if (step === "install") return;

    if ((step === "llm-key" || step === "assistant-create") && submitRef.current) {
      setSubmitting(true);
      try {
        await submitRef.current();
      } catch {
        // validation handled in view
      } finally {
        setSubmitting(false);
      }
      return;
    }

    next();
  }

  function handleExit() {
    navigate("/bots");
  }

  function handleRestart() {
    clearOnboardingProgress();
    setSelectedTemplateId("general");
    setAssistantName("我的第一个助手");
    goto("intro");
  }

  const activeIndex = currentNavIndex(step);
  const showHeader = step !== "intro" && step !== "ready";
  const showFooter = !["intro", "install-success", "ready"].includes(step);

  const nextLabel =
    step === "env-check"
      ? envCheck === null
        ? "检测中..."
        : envCheck.hasOpenClaw
          ? "已安装，继续连接 AI 服务"
          : "开始安装 OpenClaw"
      : step === "install"
        ? "安装中..."
        : step === "llm-key"
          ? submitting
            ? "保存中..."
            : "保存并继续"
          : step === "template-select"
            ? "使用这个模板"
            : step === "assistant-create"
              ? submitting
                ? "创建中..."
                : "创建助手并开始对话"
              : "下一步";

  const nextDisabled =
    step === "install" ||
    (step === "env-check" && (envCheck === null || (!envCheck.canInstall && !envCheck.hasOpenClaw))) ||
    submitting;

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F7F7F8]">
      <div className="w-[960px] h-[700px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden">
        {showHeader && (
          <div className="px-8 py-5 pb-4 border-b border-[#E5E7EB] flex-shrink-0 flex items-start justify-between">
            <div className="flex-1">
              <div className="text-[16px] font-semibold mb-3.5 text-[#0F172A]">Lysmata 首次成功向导</div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {NAV_STEPS.map((item, idx) => {
                  const isActive = item.index === activeIndex;
                  const isCompleted = item.index < activeIndex;
                  return (
                    <div key={item.id} className="flex items-center gap-1.5 flex-shrink-0">
                      <div
                        className={[
                          "flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap",
                          isActive ? "text-[#2563EB]" : isCompleted ? "text-[#0F172A]" : "text-[#64748B]",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                            isActive ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]" : "",
                            isCompleted ? "border-[#2563EB] bg-[#2563EB] text-white" : "",
                            !isActive && !isCompleted ? "border-[#E5E7EB] bg-white text-[#64748B]" : "",
                          ].join(" ")}
                        >
                          {isCompleted ? "✓" : item.index}
                        </div>
                        {isActive && <span>{item.title}</span>}
                      </div>
                      {idx < NAV_STEPS.length - 1 && (
                        <div
                          className="w-6 h-[1.5px] flex-shrink-0"
                          style={{ background: isCompleted ? "#2563EB" : "#E5E7EB" }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              onClick={handleExit}
              className="w-[28px] h-[28px] rounded-[7px] bg-transparent border-none text-[#94A3B8] cursor-pointer flex items-center justify-center hover:bg-[#F1F5F9] hover:text-[#0F172A] ml-4 mt-0.5 flex-shrink-0"
              title="退出向导"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex-1 px-8 py-7 overflow-y-auto">
          {step === "intro" && (
            <div className="flex flex-col items-center justify-center h-full text-center pb-2">
              <h1 className="text-[26px] font-bold m-0 mb-3">先安装 OpenClaw，再创建你的第一个助手</h1>
              <p className="text-sm text-[#64748B] leading-[1.65] max-w-[420px] m-0 mb-8">
                跟着这条主路径走，你只需要安装 OpenClaw、连接一个 AI 服务、选择一个模板，马上就能开始第一次对话。
              </p>
              <div className="flex flex-col gap-2.5 w-full max-w-[340px]">
                <button
                  onClick={() => goto("env-check")}
                  className="w-full bg-[#2563EB] text-white border-none px-[18px] py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8]"
                >
                  开始安装 OpenClaw
                </button>
                <button
                  onClick={() => goto("llm-key")}
                  className="w-full bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                >
                  已安装，继续连接 AI 服务
                </button>
              </div>
            </div>
          )}

          {step === "env-check" && <EnvCheckView onEnvReady={setEnvCheck} />}

          {step === "install" && (
            <InstallingView
              onSuccess={() => goto("install-success")}
              onBackToEnvCheck={() => {
                setEnvCheck(null);
                goto("env-check");
              }}
            />
          )}

          {step === "install-success" && (
            <InstallSuccessView
              onConfigNow={() => goto("llm-key")}
              onDefer={handleExit}
            />
          )}

          {step === "llm-key" && (
            <ProviderConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={next}
            />
          )}

          {step === "template-select" && (
            <TemplateSelectView selectedTemplateId={selectedTemplateId} onSelectTemplate={setSelectedTemplateId} />
          )}

          {step === "assistant-create" && (
            <AssistantCreateView
              selectedTemplateId={selectedTemplateId}
              assistantName={assistantName}
              onAssistantNameChange={setAssistantName}
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={next}
            />
          )}

          {step === "ready" && (
            <FirstChatReadyView
              assistantName={assistantName}
              templateId={selectedTemplateId}
              onRestart={handleRestart}
            />
          )}
        </div>

        {showFooter && (
          <div className="px-8 py-3.5 border-t border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-end gap-2.5 flex-shrink-0">
            <button
              onClick={prev}
              className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            >
              上一步
            </button>
            <button
              onClick={handleNext}
              disabled={nextDisabled}
              className="bg-[#2563EB] text-white border-none px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] disabled:cursor-not-allowed"
            >
              {nextLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
