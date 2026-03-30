import { Navigate, useLocation, useParams } from "react-router-dom";
import { OnboardingPage as Page1Welcome } from "./Page1Welcome";
import { OnboardingPage as Page2Install } from "./Page2Install";
import { OnboardingPage as Page3Provider } from "./Page3Provider";
import { OnboardingPage as Page4Template } from "./Page4template";
import { OnboardingPage as Page5Assistant } from "./Page5assistant";
import { OnboardingPage as Page5Ready } from "./Page5Ready";

type WizardStep = {
  id: string;
  title: string;
  index: number;
};

const WIZARD_STEPS: WizardStep[] = [
  { id: "welcome", title: "欢迎", index: 1 },
  { id: "install", title: "安装 OpenClaw", index: 2 },
  { id: "llm-key", title: "连接 AI 服务", index: 3 },
  { id: "template-select", title: "选择模板", index: 4 },
  { id: "assistant-create", title: "创建助手", index: 5 },
  { id: "ready", title: "开始对话", index: 6 },
];

function getActiveStep(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const step = segments.length > 0 ? segments[segments.length - 1] : "welcome";
  const exists = WIZARD_STEPS.some((item) => item.id === step);
  return exists ? step : "welcome";
}

export function OnboardingV2Page() {
  const location = useLocation();
  const { step } = useParams<{ step: string }>();
  const activeStep = getActiveStep(location.pathname);
  const activeIndex = WIZARD_STEPS.find((item) => item.id === activeStep)?.index ?? 1;

  function renderStepComponent(currentStep: string | undefined) {
    switch (currentStep) {
      case "welcome":
        return <Page1Welcome />;
      case "install":
        return <Page2Install />;
      case "llm-key":
        return <Page3Provider />;
      case "template-select":
        return <Page4Template />;
      case "assistant-create":
        return <Page5Assistant />;
      case "ready":
        return <Page5Ready />;
      default:
        return <Navigate to="/onboarding/welcome" replace />;
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe_0,transparent_24%),linear-gradient(180deg,#f8fbff_0%,#f5f7fb_100%)] p-0 md:p-7">
      <div className="mx-auto flex min-h-screen w-full max-w-[980px] flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] md:min-h-[700px] md:rounded-3xl md:border md:border-[#E2E8F0]">
        <header className="flex items-start justify-between gap-5 border-b border-[#E2E8F0] bg-[rgba(255,255,255,0.92)] px-7 pb-4 pt-6 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="mb-3.5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-lg font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)]">
                L
              </div>
              <div>
                <h1 className="m-0 text-lg font-bold text-[#0F172A]">Lysmata</h1>
                <p className="m-0 mt-1 text-[13px] text-[#64748B]">
                  安装 OpenClaw、连接 AI 服务、创建第一个助手，并立刻开始第一次对话。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {WIZARD_STEPS.map((step) => {
                const isActive = step.id === activeStep;
                const isDone = step.index < activeIndex;
                return (
                  <div
                    key={step.id}
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold",
                      isActive
                        ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                        : isDone
                          ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]"
                          : "border-[#E2E8F0] bg-white text-[#64748B]",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                        isActive ? "bg-[#DBEAFE]" : isDone ? "bg-[#DCFCE7]" : "bg-[#F1F5F9]",
                      ].join(" ")}
                    >
                      {step.index}
                    </span>
                    <span>{step.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        {renderStepComponent(step)}
      </div>
    </div>
  );
}
