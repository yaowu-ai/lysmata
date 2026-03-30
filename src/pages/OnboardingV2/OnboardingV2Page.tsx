import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  clearOnboardingRuntimeState,
  getOnboardingRuntimeState,
} from "../../shared/store/onboarding-runtime-store.ts";
import { clearOnboardingProgress } from "../../shared/store/wizard-store";
import { AssistantCreateView } from "../Onboarding/views/AssistantCreateView";
import { FirstChatReadyView } from "../Onboarding/views/FirstChatReadyView";
import { InstallingView } from "../Onboarding/views/InstallingView";
import { InstallSuccessView } from "../Onboarding/views/InstallSuccessView";
import { ProviderConfigView } from "../Onboarding/views/ProviderConfigView";
import { TemplateSelectView } from "../Onboarding/views/TemplateSelectView";

type StepId =
  | "welcome"
  | "install"
  | "install-success"
  | "provider"
  | "template"
  | "assistant"
  | "ready";

const FLOW: StepId[] = [
  "welcome",
  "install",
  "install-success",
  "provider",
  "template",
  "assistant",
  "ready",
];

const NAV_STEPS = [
  { id: "install", title: "安装 OpenClaw", index: 1 },
  { id: "provider", title: "连接 AI 服务", index: 2 },
  { id: "template", title: "选择模板", index: 3 },
  { id: "assistant", title: "开始对话", index: 4 },
] as const;

function currentNavIndex(step: StepId): number {
  if (step === "welcome") return 0;
  if (step === "install-success") return 1;
  if (step === "ready") return 4;
  const hit = NAV_STEPS.find((item) => item.id === step);
  return hit?.index ?? 0;
}

function persistStep(step: StepId) {
  const shouldStore = step !== "welcome" && step !== "ready";
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

  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("general");
  const [assistantName, setAssistantName] = useState("我的第一个助手");
  const [runtimeState, setRuntimeState] = useState(() => getOnboardingRuntimeState());

  const routeStep = params.step;
  const isValidStep = FLOW.includes((routeStep ?? "") as StepId);
  const step = (isValidStep ? routeStep : "welcome") as StepId;

  useEffect(() => {
    setRuntimeState(getOnboardingRuntimeState());
  }, [step]);

  useEffect(() => {
    persistStep(step);
  }, [step]);

  if (!isValidStep) {
    return <Navigate to="/onboarding/welcome" replace />;
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
    if (step === "install") return;

    if ((step === "provider" || step === "assistant") && submitRef.current) {
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
    clearOnboardingRuntimeState();
    setSelectedTemplateId("general");
    setAssistantName("我的第一个助手");
    goto("welcome");
  }

  const activeIndex = currentNavIndex(step);
  const showHeader = step !== "welcome" && step !== "ready";
  const showFooter = !["welcome", "install-success", "ready"].includes(step);

  const nextLabel =
    step === "install"
      ? "安装中..."
      : step === "provider"
        ? submitting
          ? "保存中..."
          : "保存并继续"
        : step === "template"
          ? "使用这个模板"
          : step === "assistant"
            ? submitting
              ? "创建中..."
              : "创建助手并开始对话"
            : "下一步";

  const nextDisabled = step === "install" || submitting;

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F7F7F8]">
      <div className="w-[960px] h-[700px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden">
        {showHeader && (
          <div className="px-8 py-5 pb-4 border-b border-[#E5E7EB] flex-shrink-0 flex items-start justify-between">
            <div className="flex-1">
              <div className="text-[16px] font-semibold mb-3.5 text-[#0F172A]">
                Lysmata 首次成功向导
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {NAV_STEPS.map((item, idx) => {
                  const isActive = item.index === activeIndex;
                  const isCompleted = item.index < activeIndex;
                  return (
                    <div key={item.id} className="flex items-center gap-1.5 flex-shrink-0">
                      <div
                        className={[
                          "flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap",
                          isActive
                            ? "text-[#2563EB]"
                            : isCompleted
                              ? "text-[#0F172A]"
                              : "text-[#64748B]",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                            isActive ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]" : "",
                            isCompleted ? "border-[#2563EB] bg-[#2563EB] text-white" : "",
                            !isActive && !isCompleted
                              ? "border-[#E5E7EB] bg-white text-[#64748B]"
                              : "",
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex-1 px-8 py-7 overflow-y-auto">
          {step === "welcome" && (
            <div className="grid h-full items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="max-w-[470px]">
                <div className="mb-4 inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-[11px] font-semibold text-[#2563EB]">
                  首次成功主线
                </div>
                <h1 className="m-0 text-[36px] font-bold leading-[1.08] tracking-[-0.03em] text-[#0F172A]">
                  先安装 OpenClaw，再创建你的第一个助手。
                </h1>
                <p className="mt-4 max-w-[430px] text-[15px] leading-[1.8] text-[#64748B]">
                  Lysmata 会帮你把安装、连接 AI
                  服务和第一次对话串成一条简单主线。你不需要先理解复杂配置，只要跟着这几步走完就能开始使用。
                </p>

                {runtimeState.startupCheck === "failed" && (
                  <div className="mt-5 rounded-[14px] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[13px] leading-[1.7] text-[#92400E]">
                    环境检测暂时没有完成，我们先带你进入安装主线。若后续安装遇到问题，会继续给出修复提示。
                  </div>
                )}

                <div className="mt-7 flex flex-wrap gap-3">
                  <button
                    onClick={() => goto("install")}
                    className="rounded-xl bg-[#2563EB] px-5 py-3 text-[15px] font-semibold text-white hover:bg-[#1D4ED8]"
                  >
                    安装 OpenClaw
                  </button>
                  {runtimeState.hasOpenClaw && (
                    <button
                      onClick={() => goto("provider")}
                      className="rounded-xl border border-[#CBD5E1] bg-white px-5 py-3 text-[15px] font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
                    >
                      直接配置
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-[#E2E8F0] bg-[linear-gradient(180deg,rgba(239,246,255,0.9),rgba(255,255,255,0.98))] p-6 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
                <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#475569] shadow-sm">
                  大约 3 分钟
                </div>
                <h2 className="mt-4 text-[24px] font-bold leading-[1.25] text-[#0F172A]">
                  你会完成这 3 步
                </h2>
                <div className="mt-5 space-y-3.5">
                  {[
                    ["安装 OpenClaw", "准备好运行助手所需的核心组件。"],
                    ["连接一个 AI 服务", "只填写真正必须的 LLM Key，其余默认项尽量自动处理。"],
                    ["创建并开始第一次对话", "从模板出发，直接得到一个可用助手。"],
                  ].map(([title, desc], index) => (
                    <div
                      key={title}
                      className="flex gap-3 rounded-2xl border border-[#E2E8F0] bg-white/80 px-4 py-4"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[12px] font-bold text-[#2563EB]">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#0F172A]">{title}</div>
                        <div className="mt-1 text-[13px] leading-[1.7] text-[#64748B]">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "install" && (
            <InstallingView
              onSuccess={() => goto("install-success")}
              onBackToEnvCheck={() => goto("welcome")}
            />
          )}

          {step === "install-success" && (
            <InstallSuccessView onConfigNow={() => goto("provider")} onDefer={handleExit} />
          )}

          {step === "provider" && (
            <ProviderConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={next}
            />
          )}

          {step === "template" && (
            <TemplateSelectView
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
            />
          )}

          {step === "assistant" && (
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
