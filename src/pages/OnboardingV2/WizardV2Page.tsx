import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../shared/store/wizard-store";
import { WizardStepper } from "../Onboarding/WizardStepper";
import { WizardFooter } from "../Onboarding/WizardFooter";
import { IntroView } from "../Onboarding/views/IntroView";
import { EnvCheckView } from "../Onboarding/views/EnvCheckView";
import { InstallingView } from "../Onboarding/views/InstallingView";
import { InstallSuccessView } from "../Onboarding/views/InstallSuccessView";
import { ProviderConfigView } from "../Onboarding/views/ProviderConfigView";
import { TemplateSelectView } from "../Onboarding/views/TemplateSelectView";
import { getTemplateMeta } from "../Onboarding/views/template-meta";
import { AssistantCreateView } from "../Onboarding/views/AssistantCreateView";
import { FirstChatReadyView } from "../Onboarding/views/FirstChatReadyView";

export function WizardV2Page() {
  const navigate = useNavigate();
  const { currentStep, goNext, goPrev, goToStep, clearProgress, restoreLastProgress } = useWizardStore();
  const step = currentStep();

  const submitRef = useRef<(() => Promise<void>) | null>(null);
  const [envCheck, setEnvCheck] = useState<{ canInstall: boolean; hasOpenClaw: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("general");
  const [assistantName, setAssistantName] = useState("我的第一个助手");

  useEffect(() => {
    restoreLastProgress();
  }, [restoreLastProgress]);

  useEffect(() => {
    const meta = getTemplateMeta(selectedTemplateId);
    if (!assistantName.trim()) {
      const defaultName =
        selectedTemplateId === "info"
          ? "我的信息助手"
          : selectedTemplateId === "task"
            ? "我的任务助手"
            : "我的第一个助手";
      setAssistantName(defaultName || meta.name);
    }
  }, [selectedTemplateId, assistantName]);

  function handleExitWizard() {
    navigate("/bots");
  }

  function handleRestartWizard() {
    clearProgress();
    setSelectedTemplateId("export-owner");
    setAssistantName("我的第一个助手");
    goToStep("welcome");
  }

  async function handleNext() {
    if (step.id === "install-success" && envCheck?.hasOpenClaw) {
      goToStep("llm-key");
      return;
    }

    if ((step.id === "llm-key" || step.id === "assistant-create") && submitRef.current) {
      setSubmitting(true);
      try {
        await submitRef.current();
      } catch {
        // validation error shown in child view
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (step.id === "install") {
      return;
    }

    goNext();
  }

  const getFooterProps = () => {
    if (step.id === "install-success") {
      const checking = envCheck === null;
      const alreadyInstalled = envCheck?.hasOpenClaw === true;
      return {
        nextLabel: checking ? "检测中..." : alreadyInstalled ? "已安装，继续连接 AI 服务" : "开始安装 OpenClaw",
        nextDisabled: checking || (!envCheck?.canInstall && !alreadyInstalled),
        showPrev: true,
        showSkip: false,
        showCancel: true,
        onCancel: handleExitWizard,
      };
    }

    if (step.id === "install") {
      return {
        nextLabel: "安装中...",
        nextDisabled: true,
        showPrev: false,
        showSkip: false,
        showCancel: false,
      };
    }

    if (step.id === "llm-key") {
      return {
        nextLabel: submitting ? "保存中..." : "保存并继续",
        nextDisabled: submitting,
        showPrev: true,
        showSkip: false,
        showCancel: true,
        onCancel: handleExitWizard,
        submitting,
      };
    }

    if (step.id === "template-select") {
      return {
        nextLabel: "使用这个模板",
        showPrev: true,
        showSkip: false,
        showCancel: true,
        onCancel: handleExitWizard,
      };
    }

    if (step.id === "assistant-create") {
      return {
        nextLabel: submitting ? "创建中..." : "创建助手并开始对话",
        nextDisabled: submitting,
        showPrev: true,
        showSkip: false,
        showCancel: true,
        onCancel: handleExitWizard,
        submitting,
      };
    }

    return {
      nextLabel: "下一步",
      showPrev: false,
      showSkip: false,
      showCancel: false,
    };
  };

  const footerProps = getFooterProps();
  const showHeader = step.id !== "welcome" && step.id !== "ready";
  const showFooter = !["welcome", "install-success", "ready"].includes(step.id);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F7F7F8]">
      <div className="w-[960px] h-[700px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden">
        {showHeader && (
          <div className="px-8 py-5 pb-4 border-b border-[#E5E7EB] flex-shrink-0 flex items-start justify-between">
            <div className="flex-1">
              <div className="text-[16px] font-semibold mb-3.5 text-[#0F172A]">Lysmata 首次成功向导</div>
              <WizardStepper currentStep={step} />
            </div>
            <button
              onClick={handleExitWizard}
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
          {step.id === "welcome" && (
            <IntroView onStartInstall={() => goToStep("install-success")} onSkipToConfig={() => goToStep("llm-key")} />
          )}

          {step.id === "install-success" && <EnvCheckView onEnvReady={setEnvCheck} />}

          {step.id === "install" && (
            <InstallingView
              onSuccess={() => goToStep("install-success")}
              onBackToEnvCheck={() => {
                setEnvCheck(null);
                goToStep("install-success");
              }}
            />
          )}

          {step.id === "llm-key" && false && (
            <InstallSuccessView
              onConfigNow={() => goToStep("llm-key")}
              onDefer={handleExitWizard}
            />
          )}

          {step.id === "llm-key" && (
            <ProviderConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}

          {step.id === "template-select" && (
            <TemplateSelectView
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
            />
          )}

          {step.id === "assistant-create" && (
            <AssistantCreateView
              selectedTemplateId={selectedTemplateId}
              assistantName={assistantName}
              onAssistantNameChange={setAssistantName}
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}

          {step.id === "ready" && (
            <FirstChatReadyView
              assistantName={assistantName}
              templateId={selectedTemplateId}
              onRestart={handleRestartWizard}
            />
          )}
        </div>

        {showFooter && (
          <WizardFooter
            {...footerProps}
            onNext={handleNext}
            onPrev={goPrev}
          />
        )}
      </div>
    </div>
  );
}
