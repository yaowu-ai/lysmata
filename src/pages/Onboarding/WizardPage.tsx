// src/pages/Onboarding/WizardPage.tsx
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, markOnboardingComplete } from "../../shared/store/wizard-store";
import { WizardStepper } from "./WizardStepper";
import { WizardFooter } from "./WizardFooter";
import { IntroView } from "./views/IntroView";
import { EnvCheckView } from "./views/EnvCheckView";
import { InstallingView } from "./views/InstallingView";
import { InstallSuccessView } from "./views/InstallSuccessView";
import { GatewayConfigView } from "./views/GatewayConfigView";
import { ProviderConfigView } from "./views/ProviderConfigView";
import { ChannelConfigView } from "./views/ChannelConfigView";
import { SkillsConfigView } from "./views/SkillsConfigView";
import { HooksConfigView } from "./views/HooksConfigView";
import { ReviewView } from "./views/ReviewView";
import { DoneView } from "./views/DoneView";

export function WizardPage() {
  const navigate = useNavigate();
  const { currentStep, skippedSteps, goNext, goPrev, skipCurrentStep, goToStep } = useWizardStore();
  const step = currentStep();

  const submitRef = useRef<(() => Promise<void>) | null>(null);
  const [envCheck, setEnvCheck] = useState<{ canInstall: boolean; hasOpenClaw: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isConfigStep = step.type === "config";

  function handleExitWizard() {
    markOnboardingComplete();
    navigate("/bots");
  }

  async function handleNext() {
    // If env check shows OpenClaw already installed, skip installing steps
    if (step.id === "env" && envCheck?.hasOpenClaw) {
      goToStep("step1");
      return;
    }

    if ((step.type === "config" || step.id === "step6") && submitRef.current) {
      setSubmitting(true);
      try {
        await submitRef.current();
      } catch {
        /* validation error shown in view */
      } finally {
        setSubmitting(false);
      }
      return;
    }
    goNext();
  }

  const getFooterProps = () => {
    if (step.id === "intro") {
      return {
        nextLabel: "开始安装",
        showPrev: false,
        showSkip: false,
        showCancel: true,
        onCancel: handleExitWizard,
      };
    }
    if (step.id === "env") {
      const checking = envCheck === null;
      const alreadyInstalled = envCheck?.hasOpenClaw === true;
      return {
        nextLabel: checking ? "检测中..." : alreadyInstalled ? "已安装，进入配置" : "一键安装",
        nextDisabled: checking || (!envCheck?.canInstall && !alreadyInstalled),
        showPrev: true,
        showSkip: false,
        showCancel: true,
        onCancel: handleExitWizard,
      };
    }
    if (step.id === "installing") {
      return {
        nextLabel: "安装中...",
        nextDisabled: true,
        showPrev: false,
        showSkip: false,
        showCancel: false,
      };
    }
    if (step.id === "install-success") {
      return { nextLabel: "立即配置 →", showPrev: false, showSkip: false, showCancel: false };
    }
    if (isConfigStep) {
      if (step.id === "step6") {
        return {
          nextLabel: submitting ? "应用中..." : "应用配置",
          nextDisabled: submitting,
          showPrev: true,
          showSkip: false,
          showCancel: true,
          onCancel: handleExitWizard,
          submitting,
        };
      }
      return {
        nextLabel: submitting ? "保存中..." : "下一步",
        nextDisabled: submitting,
        showPrev: true,
        showSkip: !!step.skippable,
        showCancel: true,
        onCancel: handleExitWizard,
        submitting,
      };
    }
    return { nextLabel: "下一步", showPrev: false, showSkip: false, showCancel: false, submitting: false };
  };

  const footerProps = getFooterProps();

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F7F7F8]">
      <div className="w-[900px] h-[640px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden">
        {/* Header — only for config steps */}
        {isConfigStep && (
          <div className="px-8 py-5 pb-4 border-b border-[#E5E7EB] flex-shrink-0 flex items-start justify-between">
            <div className="flex-1">
              <div className="text-[16px] font-semibold mb-3.5 text-[#0F172A]">
                OpenClaw 配置向导
              </div>
              <WizardStepper currentStep={step} skippedSteps={skippedSteps} />
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

        {/* Content */}
        <div className="flex-1 px-8 py-7 overflow-y-auto">
          {step.id === "intro" && (
            <IntroView onStartInstall={goNext} onSkipToConfig={() => goToStep("step1")} />
          )}
          {step.id === "env" && <EnvCheckView onEnvReady={setEnvCheck} />}
          {step.id === "installing" && <InstallingView onSuccess={goNext} />}
          {step.id === "install-success" && (
            <InstallSuccessView
              onConfigNow={() => goToStep("step1")}
              onDefer={() => {
                markOnboardingComplete();
                navigate("/bots");
              }}
            />
          )}
          {step.id === "step1" && (
            <GatewayConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}
          {step.id === "step2" && (
            <ProviderConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}
          {step.id === "step3" && (
            <ChannelConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}
          {step.id === "step4" && (
            <SkillsConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}
          {step.id === "step5" && (
            <HooksConfigView
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}
          {step.id === "step6" && (
            <ReviewView
              skippedSteps={skippedSteps}
              onRegisterSubmit={(fn) => {
                submitRef.current = fn;
              }}
              onDone={goNext}
            />
          )}
          {step.id === "done" && <DoneView />}
        </div>

        {/* Footer — hidden on done view */}
        {(step.id !== "done" && step.id !== "intro") && (
          <WizardFooter
            {...footerProps}
            onNext={handleNext}
            onPrev={goPrev}
            onSkip={skipCurrentStep}
          />
        )}
      </div>
    </div>
  );
}
