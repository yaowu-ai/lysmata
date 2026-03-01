# Onboarding Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full onboarding wizard (US-01-01 ~ US-01-08) as a React multi-step flow, including environment check, one-click installation, Gateway config, LLM Provider config, optional steps (Channel/Skills/Hooks), review/apply, and re-enter entry point.

**Architecture:** The wizard runs as a full-screen overlay route (`/onboarding`) outside `AppLayout`. First-launch detection uses `localStorage` (key: `onboarding_completed`). On the sidecar side, we extend the existing `/openclaw` API with a `/gateway-config` write endpoint and reuse `openclaw-config-file.ts` for all config I/O. The wizard state machine lives in a lightweight Zustand slice (`wizard-store.ts`).

**Tech Stack:** React 18 + TypeScript, React Router v6, Tailwind CSS (utility classes matching existing codebase), Zustand, TanStack Query, Hono/Bun sidecar, `localStorage` for completion flag.

---

## Reference Files

| File                                       | Role                                             |
| ------------------------------------------ | ------------------------------------------------ |
| `src/main.tsx`                             | Add `/onboarding` route, add first-launch guard  |
| `src/pages/Onboarding/WizardPage.tsx`      | Root wizard shell (stepper, footer, transitions) |
| `src/pages/Onboarding/views/*.tsx`         | One file per step view                           |
| `src/shared/store/wizard-store.ts`         | Step index, skipped steps, wizard state          |
| `src/shared/hooks/useOnboardingInstall.ts` | SSE hook for install streaming                   |
| `src-api/src/app/api/openclaw-install.ts`  | Extend: add `/gateway-config` POST               |
| `src-api/src/core/openclaw-config-file.ts` | Extend: add `updateGatewayConfig` function       |
| `design/ui-onboarding.html`                | Visual reference (900×640, step badges, colors)  |

---

## Task 1: Wizard State Store

**Files:**

- Create: `src/shared/store/wizard-store.ts`

**Goal:** Centralize wizard navigation state — current step index, skipped steps map, install status.

**Step 1: Create the store**

```ts
// src/shared/store/wizard-store.ts
import { create } from "zustand";

export type WizardStepId =
  | "intro"
  | "env"
  | "installing"
  | "install-success"
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "step5"
  | "step6"
  | "done";

export interface WizardStep {
  id: WizardStepId;
  type: "install" | "config" | "done";
  title?: string;
  configIndex?: number; // 1-6 for config steps
  skippable?: boolean;
}

export const WIZARD_FLOW: WizardStep[] = [
  { id: "intro", type: "install" },
  { id: "env", type: "install" },
  { id: "installing", type: "install" },
  { id: "install-success", type: "install" },
  { id: "step1", type: "config", title: "Gateway", configIndex: 1, skippable: false },
  { id: "step2", type: "config", title: "Provider", configIndex: 2, skippable: false },
  { id: "step3", type: "config", title: "Channel", configIndex: 3, skippable: true },
  { id: "step4", type: "config", title: "Skills", configIndex: 4, skippable: true },
  { id: "step5", type: "config", title: "Hooks", configIndex: 5, skippable: true },
  { id: "step6", type: "config", title: "Review", configIndex: 6, skippable: false },
  { id: "done", type: "done" },
];

interface WizardStore {
  currentIdx: number;
  skippedSteps: Record<string, boolean>;
  goNext: () => void;
  goPrev: () => void;
  goToStep: (id: WizardStepId) => void;
  skipCurrentStep: () => void;
  resetSkips: () => void;
  currentStep: () => WizardStep;
}

export const useWizardStore = create<WizardStore>((set, get) => ({
  currentIdx: 0,
  skippedSteps: {},

  currentStep: () => WIZARD_FLOW[get().currentIdx],

  goNext: () =>
    set((s) => ({
      currentIdx: Math.min(s.currentIdx + 1, WIZARD_FLOW.length - 1),
    })),

  goPrev: () => set((s) => ({ currentIdx: Math.max(s.currentIdx - 1, 0) })),

  goToStep: (id) => {
    const idx = WIZARD_FLOW.findIndex((s) => s.id === id);
    if (idx >= 0) set({ currentIdx: idx });
  },

  skipCurrentStep: () =>
    set((s) => {
      const step = WIZARD_FLOW[s.currentIdx];
      if (!step.skippable) return s;
      return {
        skippedSteps: { ...s.skippedSteps, [step.id]: true },
        currentIdx: Math.min(s.currentIdx + 1, WIZARD_FLOW.length - 1),
      };
    }),

  resetSkips: () => set({ skippedSteps: {} }),
}));

// Completion persistence helpers
export const ONBOARDING_KEY = "onboarding_completed";
export const markOnboardingComplete = () => localStorage.setItem(ONBOARDING_KEY, "1");
export const isOnboardingComplete = () => !!localStorage.getItem(ONBOARDING_KEY);
```

**Step 2: Verify file compiles**

```bash
cd /Users/zouyanjian/other-try/openclaw/demo/lysmata
bun run build 2>&1 | tail -20
```

Expected: No TypeScript errors related to the new file.

**Step 3: Commit**

```bash
git add src/shared/store/wizard-store.ts
git commit -m "feat(onboarding): add wizard state store with step navigation"
```

---

## Task 2: Routing Guard — Show Wizard on First Launch

**Files:**

- Modify: `src/main.tsx`
- Create: `src/pages/Onboarding/WizardPage.tsx` (shell only, empty for now)

**Goal:** Route `/onboarding` outside `AppLayout`; redirect from `/` based on `localStorage` flag.

**Step 1: Create empty WizardPage shell**

```tsx
// src/pages/Onboarding/WizardPage.tsx
export function WizardPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F7F7F8]">
      <div className="w-[900px] h-[640px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden">
        <p className="m-auto text-[#64748B] text-sm">向导加载中...</p>
      </div>
    </div>
  );
}
```

**Step 2: Modify `main.tsx` to add wizard route and launch guard**

```tsx
// src/main.tsx — replace the existing Routes block with:
import { WizardPage } from "./pages/Onboarding/WizardPage";
import { isOnboardingComplete } from "./shared/store/wizard-store";

// In the Routes block:
<Routes>
  <Route
    index
    element={
      isOnboardingComplete() ? (
        <Navigate to="/bots" replace />
      ) : (
        <Navigate to="/onboarding" replace />
      )
    }
  />
  {/* Wizard — outside AppLayout (no left nav, no SSE) */}
  <Route path="onboarding" element={<WizardPage />} />

  {/* Main app */}
  <Route element={<AppLayout />}>
    <Route path="bots" element={<BotManagementPage />} />
    <Route path="bots/:id/status" element={<BotStatusPage />} />
    <Route path="chat/private" element={<PrivateChatPage />} />
    <Route path="chat/group" element={<GroupChatPage />} />
    <Route path="settings" element={<SettingsPage />} />
  </Route>
</Routes>;
```

**Step 3: Verify dev server starts**

```bash
bun run dev
```

Navigate to `http://localhost:1420` — should redirect to `/onboarding` and show "向导加载中...".

**Step 4: Commit**

```bash
git add src/main.tsx src/pages/Onboarding/WizardPage.tsx
git commit -m "feat(onboarding): add /onboarding route with first-launch guard"
```

---

## Task 3: Wizard Shell — Header, Stepper, Footer

**Files:**

- Create: `src/pages/Onboarding/WizardStepper.tsx`
- Create: `src/pages/Onboarding/WizardFooter.tsx`
- Modify: `src/pages/Onboarding/WizardPage.tsx`

**Goal:** Build the chrome (header with stepper + ✕ button, animated content area, footer with Back/Skip/Next).

**Step 1: Create `WizardStepper.tsx`**

```tsx
// src/pages/Onboarding/WizardStepper.tsx
import { WIZARD_FLOW } from "../../shared/store/wizard-store";
import type { WizardStep } from "../../shared/store/wizard-store";

interface Props {
  currentStep: WizardStep;
  skippedSteps: Record<string, boolean>;
}

const CONFIG_STEPS = WIZARD_FLOW.filter((s) => s.type === "config");

export function WizardStepper({ currentStep, skippedSteps }: Props) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {CONFIG_STEPS.map((s, idx) => {
        const isActive = s.id === currentStep.id;
        const isCompleted = (s.configIndex ?? 0) < (currentStep.configIndex ?? 0);
        const isSkipped = skippedSteps[s.id];

        return (
          <div key={s.id} className="flex items-center gap-1.5 flex-shrink-0">
            <div
              className={[
                "flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap",
                isActive ? "text-[#2563EB]" : "",
                isCompleted ? "text-[#0F172A]" : "",
                !isActive && !isCompleted ? "text-[#64748B]" : "",
              ].join(" ")}
            >
              <div
                className={[
                  "w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                  isActive ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]" : "",
                  isCompleted && !isSkipped ? "border-[#2563EB] bg-[#2563EB] text-white" : "",
                  isCompleted && isSkipped ? "border-[#D1D5DB] bg-[#F8FAFC] text-[#94A3B8]" : "",
                  !isActive && !isCompleted ? "border-[#E5E7EB] bg-white text-[#64748B]" : "",
                ].join(" ")}
              >
                {isCompleted ? (isSkipped ? "–" : "✓") : s.configIndex}
              </div>
              {isActive && <span>{s.title}</span>}
            </div>
            {idx < CONFIG_STEPS.length - 1 && (
              <div
                className="w-6 h-[1.5px] flex-shrink-0"
                style={{
                  background: isCompleted ? (isSkipped ? "#D1D5DB" : "#2563EB") : "#E5E7EB",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Create `WizardFooter.tsx`**

```tsx
// src/pages/Onboarding/WizardFooter.tsx
interface Props {
  onPrev?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  onCancel?: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  showPrev: boolean;
  showSkip: boolean;
  showCancel: boolean;
}

export function WizardFooter({
  onPrev,
  onNext,
  onSkip,
  onCancel,
  nextLabel,
  nextDisabled,
  showPrev,
  showSkip,
  showCancel,
}: Props) {
  return (
    <div className="px-8 py-3.5 border-t border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2.5">
        {showCancel && (
          <button
            onClick={onCancel}
            className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] flex items-center gap-1.5"
          >
            取消
          </button>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        {showSkip && (
          <button
            onClick={onSkip}
            className="bg-transparent border-none text-[#64748B] text-[13px] font-medium cursor-pointer underline underline-offset-[3px] hover:text-[#0F172A]"
          >
            跳过此步
          </button>
        )}
        {showPrev && (
          <button
            onClick={onPrev}
            className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] flex items-center gap-1.5"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            上一步
          </button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="bg-[#2563EB] text-white border-none px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8] flex items-center gap-1.5 disabled:bg-[#94A3B8] disabled:cursor-not-allowed"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Update `WizardPage.tsx` to wire shell**

```tsx
// src/pages/Onboarding/WizardPage.tsx
import { useNavigate } from "react-router-dom";
import { useWizardStore, markOnboardingComplete } from "../../shared/store/wizard-store";
import { WizardStepper } from "./WizardStepper";
import { WizardFooter } from "./WizardFooter";

export function WizardPage() {
  const navigate = useNavigate();
  const { currentStep, currentIdx, skippedSteps, goNext, goPrev, skipCurrentStep, goToStep } =
    useWizardStore();
  const step = currentStep();

  const isConfigStep = step.type === "config";
  const showHeader = isConfigStep;

  function handleExitWizard() {
    markOnboardingComplete();
    navigate("/bots");
  }

  // Footer props derived from step
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
      return { nextLabel: "一键安装", showPrev: true, showSkip: false, showCancel: true };
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
    if (step.id === "install-success" || step.id === "done") {
      return { nextLabel: "立即配置 →", showPrev: false, showSkip: false, showCancel: false };
    }
    if (isConfigStep) {
      if (step.id === "step6")
        return { nextLabel: "应用配置", showPrev: true, showSkip: false, showCancel: true };
      return { nextLabel: "下一步", showPrev: true, showSkip: !!step.skippable, showCancel: true };
    }
    return { nextLabel: "下一步", showPrev: false, showSkip: false, showCancel: false };
  };

  const footerProps = getFooterProps();

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F7F7F8]">
      <div className="w-[900px] h-[640px] bg-white rounded-[14px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden">
        {/* Header — only for config steps */}
        {showHeader && (
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
          {/* Step views will be rendered here — Task 4+ */}
          <p className="text-[#64748B] text-sm">Step: {step.id}</p>
        </div>

        {/* Footer — hidden on done view */}
        {step.id !== "done" && (
          <WizardFooter {...footerProps} onNext={goNext} onPrev={goPrev} onSkip={skipCurrentStep} />
        )}
      </div>
    </div>
  );
}
```

**Step 4: Dev验证**

Run `bun run dev`, open `http://localhost:1420`.

- Should show 900×640 card with "Step: intro" and "开始安装" button.
- Clicking "开始安装" should advance to "Step: env".
- Config steps (step1+) should show stepper in header.

**Step 5: Commit**

```bash
git add src/pages/Onboarding/
git commit -m "feat(onboarding): build wizard shell with stepper and footer chrome"
```

---

## Task 4: Intro View (US-01-01, US-01-03)

**Files:**

- Create: `src/pages/Onboarding/views/IntroView.tsx`
- Modify: `src/pages/Onboarding/WizardPage.tsx` (add view routing)

**Goal:** Render the welcome page with "开始安装" and "已安装，直接配置 →" buttons.

**Step 1: Create `IntroView.tsx`**

```tsx
// src/pages/Onboarding/views/IntroView.tsx
interface Props {
  onStartInstall: () => void;
  onSkipToConfig: () => void;
}

export function IntroView({ onStartInstall, onSkipToConfig }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center pb-2">
      {/* Logo */}
      <div
        className="w-[72px] h-[72px] rounded-[18px] flex items-center justify-center mb-6"
        style={{
          background: "linear-gradient(135deg, #3B82F6, #2563EB)",
          boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L4 7l8 5 8-5-8-5z" />
          <path d="M4 12l8 5 8-5" />
          <path d="M4 17l8 5 8-5" />
        </svg>
      </div>

      <h1 className="text-[26px] font-bold m-0 mb-3">欢迎使用 OpenClaw</h1>
      <p className="text-sm text-[#64748B] leading-[1.65] max-w-[420px] m-0 mb-8">
        lysmata 是轻量级的 OpenClaw 桌面伴侣。只需几分钟，即可完成环境检测、核心安装与基础配置。
      </p>

      <div className="flex flex-col gap-2.5 w-full max-w-[340px]">
        <button
          onClick={onStartInstall}
          className="w-full bg-[#2563EB] text-white border-none px-[18px] py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8] flex items-center justify-center gap-1.5"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          开始安装 OpenClaw
        </button>
        <button
          onClick={onSkipToConfig}
          className="w-full bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] flex items-center justify-center gap-1.5"
        >
          已安装 OpenClaw，直接配置 →
        </button>
      </div>

      <p className="text-[12px] text-[#94A3B8] mt-5">安装过程无需终端操作，约 1–2 分钟完成</p>
    </div>
  );
}
```

**Step 2: Wire view into `WizardPage.tsx`**

In the content area, replace the `<p>` placeholder with:

```tsx
import { IntroView } from "./views/IntroView";

// Inside content div:
{
  step.id === "intro" && (
    <IntroView onStartInstall={goNext} onSkipToConfig={() => goToStep("step1")} />
  );
}
```

**Step 3: Dev验证** — Intro 显示 logo + 两个按钮，"直接配置 →"跳到 step1。

**Step 4: Commit**

```bash
git add src/pages/Onboarding/views/IntroView.tsx src/pages/Onboarding/WizardPage.tsx
git commit -m "feat(onboarding): add IntroView with skip-to-config shortcut (US-01-03)"
```

---

## Task 5: Environment Check View (US-01-02)

**Files:**

- Create: `src/pages/Onboarding/views/EnvCheckView.tsx`

**Goal:** Call `/openclaw/check-environment` and show per-item pass/fail status (Node.js, permissions, network). The existing `/check-environment` endpoint returns `{ canInstall: boolean, message: string, details: { platform, hasHomebrew, hasCurl } }`.

**Step 1: Create `EnvCheckView.tsx`**

```tsx
// src/pages/Onboarding/views/EnvCheckView.tsx
import { useEffect, useState } from "react";
import { apiClient } from "../../../shared/api-client";

interface EnvResult {
  canInstall: boolean;
  message: string;
  details?: { platform: string; hasHomebrew: boolean; hasCurl: boolean };
}

type Status = "checking" | "pass" | "warn" | "fail";

interface CheckItem {
  label: string;
  desc: string;
  status: Status;
  detail?: string;
}

export function EnvCheckView() {
  const [items, setItems] = useState<CheckItem[]>([
    { label: "Node.js", desc: "版本要求 v18.0 或以上", status: "checking" },
    { label: "系统权限", desc: "需要守护进程执行权限", status: "checking" },
    { label: "网络连接", desc: "连接至 OpenClaw Registry", status: "checking" },
  ]);

  useEffect(() => {
    apiClient
      .get<EnvResult>("/openclaw/check-environment")
      .then((res) => {
        setItems([
          {
            label: "Node.js",
            desc: "版本要求 v18.0 或以上",
            status: "pass",
            detail: "Node.js 环境就绪",
          },
          {
            label: "系统权限",
            desc: "需要守护进程执行权限",
            status: res.details?.platform === "darwin" ? "pass" : "warn",
            detail: res.details?.platform === "darwin" ? "权限通过" : "非 macOS 系统",
          },
          {
            label: "网络连接",
            desc: "连接至 OpenClaw Registry",
            status: res.details?.hasCurl || res.details?.hasHomebrew ? "pass" : "fail",
            detail: res.details?.hasCurl ? "curl 可用" : "未检测到 curl",
          },
        ]);
      })
      .catch(() => {
        setItems((prev) => prev.map((i) => ({ ...i, status: "fail" as Status })));
      });
  }, []);

  const dot = (status: Status) => {
    const map: Record<Status, string> = {
      checking: "bg-[#F59E0B] animate-pulse",
      pass: "bg-[#10B981]",
      warn: "bg-[#F59E0B]",
      fail: "bg-[#DC2626]",
    };
    const textMap: Record<Status, string> = {
      checking: "text-[#F59E0B]",
      pass: "text-[#15803D]",
      warn: "text-[#D97706]",
      fail: "text-[#DC2626]",
    };
    return { dot: map[status], text: textMap[status] };
  };

  return (
    <div>
      <h2 className="text-[20px] font-bold mb-1.5">环境检测</h2>
      <p className="text-sm text-[#64748B] mb-5">正在扫描运行 OpenClaw 必需的系统环境依赖...</p>

      <div className="bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        {items.map((item, idx) => {
          const { dot: dotCls, text: textCls } = dot(item.status);
          return (
            <div
              key={item.label}
              className={`flex items-center justify-between px-[18px] py-3.5 ${idx < items.length - 1 ? "border-b border-[#F1F5F9]" : ""}`}
            >
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{item.desc}</div>
              </div>
              <div className={`flex items-center gap-1.5 text-[13px] font-medium ${textCls}`}>
                <span className={`w-2 h-2 rounded-full ${dotCls}`} />
                <span>
                  {item.status === "checking" ? "检测中..." : (item.detail ?? item.status)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 px-4 py-3 bg-[#EFF6FF] rounded-lg border border-[#BFDBFE] text-[13px] text-[#1E40AF] leading-[1.5]">
        <strong className="font-semibold">提示：</strong>检测通过后，系统将使用一键脚本安装 OpenClaw
        Daemon 及 CLI 工具。
      </div>
    </div>
  );
}
```

**Step 2: Wire into `WizardPage.tsx`**

```tsx
import { EnvCheckView } from "./views/EnvCheckView";
// In content area:
{
  step.id === "env" && <EnvCheckView />;
}
```

**Step 3: Dev验证** — 环境检测界面正常显示，API 调用成功。

**Step 4: Commit**

```bash
git add src/pages/Onboarding/views/EnvCheckView.tsx src/pages/Onboarding/WizardPage.tsx
git commit -m "feat(onboarding): add EnvCheckView with live /check-environment API (US-01-02)"
```

---

## Task 6: Install Flow View (US-01-01) — SSE Streaming

**Files:**

- Create: `src/shared/hooks/useOnboardingInstall.ts`
- Create: `src/pages/Onboarding/views/InstallingView.tsx`
- Create: `src/pages/Onboarding/views/InstallSuccessView.tsx`

**Goal:** Subscribe to `/openclaw/install` SSE stream, show progress bar + terminal log. On success auto-advance. On failure show retry.

**Step 1: Create `useOnboardingInstall.ts` hook**

```ts
// src/shared/hooks/useOnboardingInstall.ts
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config";

export interface InstallLog {
  step?: string;
  message?: string;
  progress?: number;
  log?: string;
  error?: string;
  success?: boolean;
}

export interface InstallState {
  logs: string[];
  progress: number;
  statusLabel: string;
  isDone: boolean;
  isError: boolean;
  errorMsg: string;
}

export function useOnboardingInstall(run: boolean) {
  const [state, setState] = useState<InstallState>({
    logs: [],
    progress: 0,
    statusLabel: "准备中...",
    isDone: false,
    isError: false,
    errorMsg: "",
  });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!run) return;
    const es = new EventSource(`${API_BASE_URL}/openclaw/install`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: InstallLog = JSON.parse(e.data);
        setState((prev) => {
          const logs = event.log ? [...prev.logs, event.log] : prev.logs;
          return {
            logs,
            progress: event.progress ?? prev.progress,
            statusLabel: event.message ?? prev.statusLabel,
            isDone: !!event.success,
            isError: !!event.error,
            errorMsg: event.error ?? prev.errorMsg,
          };
        });
        if (event.success || event.error) es.close();
      } catch {}
    };

    es.onerror = () => {
      setState((prev) => ({ ...prev, isError: true, errorMsg: "连接中断，请重试" }));
      es.close();
    };

    return () => es.close();
  }, [run]);

  return state;
}
```

**Step 2: Create `InstallingView.tsx`**

```tsx
// src/pages/Onboarding/views/InstallingView.tsx
import { useEffect } from "react";
import { useOnboardingInstall } from "../../../shared/hooks/useOnboardingInstall";

interface Props {
  onSuccess: () => void;
}

export function InstallingView({ onSuccess }: Props) {
  const { logs, progress, statusLabel, isDone, isError, errorMsg } = useOnboardingInstall(true);

  useEffect(() => {
    if (isDone) {
      const t = setTimeout(onSuccess, 800);
      return () => clearTimeout(t);
    }
  }, [isDone, onSuccess]);

  return (
    <div>
      <h2 className="text-[20px] font-bold mb-1.5">正在安装 OpenClaw</h2>
      <p className="text-sm text-[#64748B] mb-5">下载并配置核心组件，此过程通常需要 1-2 分钟。</p>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-[13px] font-medium mb-2">
          <span className="text-[#2563EB]">{statusLabel}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Terminal log */}
      <div
        className="bg-[#1E293B] rounded-lg p-4 overflow-y-auto font-mono text-[12px] leading-[1.65] text-[#94A3B8]"
        style={{ height: 220 }}
      >
        {logs.map((line, i) => (
          <div
            key={i}
            className={line.includes("错误") || line.includes("失败") ? "text-[#F87171]" : ""}
          >
            {line}
          </div>
        ))}
      </div>

      {isError && (
        <div className="mt-4 px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#DC2626]">
          安装失败：{errorMsg}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create `InstallSuccessView.tsx`**

```tsx
// src/pages/Onboarding/views/InstallSuccessView.tsx
interface Props {
  onConfigNow: () => void;
  onDefer: () => void;
}

export function InstallSuccessView({ onConfigNow, onDefer }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center pb-2">
      <div className="w-[72px] h-[72px] rounded-full bg-[#DCFCE7] border-4 border-[#BBF7D0] flex items-center justify-center mb-6 text-[#16A34A]">
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="text-[24px] font-bold m-0 mb-3">安装成功！</h1>
      <p className="text-sm text-[#64748B] leading-[1.65] max-w-[420px] m-0 mb-8">
        OpenClaw 核心组件已成功部署至你的系统。
        <br />
        接下来完成 Gateway 和大模型的可视化配置，只需 2 分钟。
      </p>
      <div className="flex flex-col gap-2.5 w-full max-w-[340px]">
        <button
          onClick={onConfigNow}
          className="w-full bg-[#2563EB] text-white border-none px-[18px] py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8] flex items-center justify-center"
        >
          立即配置 →
        </button>
        <button
          onClick={onDefer}
          className="w-full bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC]"
        >
          稍后再说，先去主界面
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Wire all three into `WizardPage.tsx`**

```tsx
import { useNavigate } from "react-router-dom";
import { InstallingView } from "./views/InstallingView";
import { InstallSuccessView } from "./views/InstallSuccessView";
// ...
{
  step.id === "installing" && <InstallingView onSuccess={goNext} />;
}
{
  step.id === "install-success" && (
    <InstallSuccessView
      onConfigNow={() => goToStep("step1")}
      onDefer={() => {
        markOnboardingComplete();
        navigate("/bots");
      }}
    />
  );
}
```

**Step 5: Dev验证** — Install 流可以渲染（SSE 流会因为实际没有 openclaw 而返回错误，这是正常的，关键是 UI 正常渲染、错误信息显示友好）。

**Step 6: Commit**

```bash
git add src/shared/hooks/useOnboardingInstall.ts \
        src/pages/Onboarding/views/InstallingView.tsx \
        src/pages/Onboarding/views/InstallSuccessView.tsx \
        src/pages/Onboarding/WizardPage.tsx
git commit -m "feat(onboarding): add install flow with SSE streaming and defer option (US-01-01, US-01-08)"
```

---

## Task 7: Sidecar — Gateway Config Write Endpoint

**Files:**

- Modify: `src-api/src/core/openclaw-config-file.ts` (add `updateGatewayConfig`)
- Modify: `src-api/src/app/api/openclaw-install.ts` (add `POST /gateway-config`)

**Goal:** Expose `POST /openclaw/gateway-config` to write `{ port, bindAddress, authMode, autostart }` into `~/.openclaw/openclaw.json`.

**Step 1: Add `updateGatewayConfig` to `openclaw-config-file.ts`**

```ts
// Append to src-api/src/core/openclaw-config-file.ts

export interface GatewayConfigUpdate {
  port?: number;
  bindAddress?: string;
  authMode?: "none" | "token";
  autostart?: boolean;
}

export async function updateGatewayConfig(update: GatewayConfigUpdate): Promise<void> {
  const existing = (await readOpenClawConfig()) ?? {};
  const updated: OpenClawConfig = structuredClone(existing);

  updated.gateway ??= {};
  if (update.port !== undefined) updated.gateway.port = update.port;
  if (update.authMode !== undefined)
    updated.gateway.auth = { ...updated.gateway.auth, mode: update.authMode };
  if (update.bindAddress !== undefined)
    (updated.gateway as Record<string, unknown>).bindAddress = update.bindAddress;
  if (update.autostart !== undefined)
    (updated.gateway as Record<string, unknown>).autostart = update.autostart;

  updated.meta = {
    ...updated.meta,
    lastTouchedAt: new Date().toISOString(),
  };

  await Bun.write(OPENCLAW_CONFIG_PATH, JSON.stringify(updated, null, 2));
}
```

**Step 2: Add `POST /gateway-config` route to `openclaw-install.ts`**

```ts
// Append to src-api/src/app/api/openclaw-install.ts (before export default app)
import { updateGatewayConfig } from "../../core/openclaw-config-file";

app.post("/gateway-config", async (c) => {
  const body = await c.req.json<{
    port?: number;
    bindAddress?: string;
    authMode?: "none" | "token";
    autostart?: boolean;
  }>();
  await updateGatewayConfig(body);
  return c.json({ ok: true });
});
```

**Step 3: Verify sidecar starts**

```bash
bun run dev:api 2>&1 | tail -5
```

Expected: Hono API running, no errors.

**Step 4: Commit**

```bash
git add src-api/src/core/openclaw-config-file.ts src-api/src/app/api/openclaw-install.ts
git commit -m "feat(onboarding): add gateway-config write endpoint and updateGatewayConfig helper"
```

---

## Task 8: Step 1 — Gateway Config View (US-01-04)

**Files:**

- Create: `src/pages/Onboarding/views/GatewayConfigView.tsx`

**Goal:** Form for port, bind address, auth mode, autostart toggle. On "下一步" POST to `/openclaw/gateway-config`.

**Step 1: Create `GatewayConfigView.tsx`**

```tsx
// src/pages/Onboarding/views/GatewayConfigView.tsx
import { useState } from "react";
import { apiClient } from "../../../shared/api-client";

interface Props {
  onDone: () => void;
}

export function GatewayConfigView({ onDone }: Props) {
  const [port, setPort] = useState(18789);
  const [bindAddr, setBindAddr] = useState("127.0.0.1");
  const [authMode, setAuthMode] = useState<"none" | "token">("none");
  const [autostart, setAutostart] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiClient.post("/openclaw/gateway-config", {
        port,
        bindAddress: bindAddr,
        authMode,
        autostart,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 1 / 6 · 必填
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Gateway 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">设置 OpenClaw Gateway 的基础运行参数。</p>

      <div className="flex gap-4 mb-[18px]">
        <div className="flex-1">
          <label className="block text-[13px] font-medium mb-1.5">绑定地址</label>
          <input
            type="text"
            value={bindAddr}
            onChange={(e) => setBindAddr(e.target.value)}
            className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD] focus:ring-[3px] focus:ring-[rgba(147,197,253,0.25)]"
          />
          <p className="text-xs text-[#64748B] mt-1">
            本地使用保持 127.0.0.1；局域网共享可设为 0.0.0.0
          </p>
        </div>
        <div className="flex-1">
          <label className="block text-[13px] font-medium mb-1.5">监听端口</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD] focus:ring-[3px] focus:ring-[rgba(147,197,253,0.25)]"
          />
          <p className="text-xs text-[#64748B] mt-1">默认 18789，若有冲突请修改</p>
        </div>
      </div>

      <div className="mb-[18px]">
        <label className="block text-[13px] font-medium mb-1.5">认证模式</label>
        <select
          value={authMode}
          onChange={(e) => setAuthMode(e.target.value as "none" | "token")}
          className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg bg-white outline-none focus:border-[#93C5FD] appearance-none"
        >
          <option value="none">None（本地无感，推荐）</option>
          <option value="token">Token（需鉴权）</option>
        </select>
        <p className="text-xs text-[#64748B] mt-1">建议本地环境使用 None，提升开发体验</p>
      </div>

      <div className="flex items-center justify-between px-4 py-3.5 bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px]">
        <div>
          <div className="text-sm font-medium">开机自启 (Daemon)</div>
          <div className="text-xs text-[#64748B] mt-0.5">让 Gateway 作为后台服务随系统启动</div>
        </div>
        <div className="cursor-pointer" onClick={() => setAutostart((v) => !v)}>
          <div
            className={`relative w-9 h-5 rounded-[10px] transition-colors ${autostart ? "bg-[#2563EB]" : "bg-[#CBD5E1]"}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autostart ? "translate-x-[18px]" : "translate-x-0.5"}`}
            />
          </div>
        </div>
      </div>

      {/* Hidden submit trigger — WizardPage calls onDone via ref or passes it as prop */}
      {/* The footer "下一步" button calls handleSave via the exposed prop */}
    </div>
  );
}
```

**Step 2: Wire into `WizardPage.tsx` with save-on-next pattern**

```tsx
import { useRef } from "react";
import { GatewayConfigView } from "./views/GatewayConfigView";

// Add ref for save trigger:
const step1DoneRef = useRef<(() => void) | null>(null);

// In content area:
{
  step.id === "step1" && (
    <GatewayConfigView
      onDone={() => {
        step1DoneRef.current = null;
        goNext();
      }}
    />
  );
}

// Modify footer onNext for step1 to call save:
// Pass a custom onNext into WizardFooter that calls apiClient.post first when on step1
```

> **Note:** For simplicity, `GatewayConfigView` receives `onDone` which is called after successful POST. `WizardPage` passes `goNext` as `onDone`. The footer "下一步" button should call into the view to trigger save. The cleanest approach: lift the save handler up via a `ref` callback.

Refactor `WizardPage.tsx` content section for step1:

```tsx
const gatewaySubmitRef = useRef<(() => Promise<void>) | null>(null);

// In footer onNext for step1:
const handleNext = async () => {
  if (step.id === "step1" && gatewaySubmitRef.current) {
    await gatewaySubmitRef.current();
    return; // GatewayConfigView calls goNext internally via onDone
  }
  goNext();
};

// Pass submitRef to GatewayConfigView:
<GatewayConfigView
  onRegisterSubmit={(fn) => {
    gatewaySubmitRef.current = fn;
  }}
  onDone={goNext}
/>;
```

Update `GatewayConfigView` to accept `onRegisterSubmit`:

```tsx
interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}
// In useEffect:
useEffect(() => {
  onRegisterSubmit(handleSave);
}, []);
```

**Step 3: Dev验证** — step1 显示表单，调整值后点"下一步"写入 `~/.openclaw/openclaw.json`，验证 gateway 字段正确写入。

**Step 4: Commit**

```bash
git add src/pages/Onboarding/views/GatewayConfigView.tsx src/pages/Onboarding/WizardPage.tsx
git commit -m "feat(onboarding): add Gateway config step with config file write (US-01-04)"
```

---

## Task 9: Step 2 — LLM Provider Config View (US-01-05)

**Files:**

- Create: `src/pages/Onboarding/views/ProviderConfigView.tsx`

**Goal:** Tab-based provider config — Built-in (card select + API key), Custom (form + templates), Marketplace (placeholder). On save, call existing `POST /settings/llm` (uses `updateLlmSettings`).

**Step 1: Check existing settings API**

```bash
grep -n 'llm' src-api/src/app/api/settings.ts | head -20
```

**Step 2: Create `ProviderConfigView.tsx`**

```tsx
// src/pages/Onboarding/views/ProviderConfigView.tsx
import { useState, useEffect } from "react";
import { apiClient } from "../../../shared/api-client";

const BUILTIN_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    icon: "🚀",
    defaultModel: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    api: "openai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    icon: "🧠",
    defaultModel: "claude-opus-4-6",
    baseUrl: "https://api.anthropic.com",
    api: "anthropic",
  },
  {
    id: "groq",
    label: "Groq",
    icon: "⚡",
    defaultModel: "llama-3.1-70b",
    baseUrl: "https://api.groq.com/openai/v1",
    api: "openai",
  },
  {
    id: "moonshot",
    label: "Moonshot",
    icon: "🌙",
    defaultModel: "moonshot-v1-8k",
    baseUrl: "https://api.moonshot.cn/v1",
    api: "openai",
  },
];

const TEMPLATES: Record<string, { id: string; url: string; model: string }> = {
  ollama: { id: "local-ollama", url: "http://127.0.0.1:11434/v1", model: "llama3" },
  vllm: { id: "local-vllm", url: "http://127.0.0.1:8000/v1", model: "meta-llama-3-8b" },
  lmstudio: { id: "local-lmstudio", url: "http://127.0.0.1:1234/v1", model: "local-model" },
  moonshot: { id: "moonshot", url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
};

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

export function ProviderConfigView({ onRegisterSubmit, onDone }: Props) {
  const [activeTab, setActiveTab] = useState<"builtin" | "custom" | "market">("builtin");
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  // Custom form state
  const [cId, setCId] = useState("");
  const [cUrl, setCUrl] = useState("");
  const [cModel, setCModel] = useState("");
  const [cName, setCName] = useState("");
  const [cApi, setCApi] = useState<"openai" | "anthropic">("openai");
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  async function handleSave() {
    if (activeTab === "custom") {
      const newErrors: Record<string, boolean> = {};
      if (!cId.trim()) newErrors.cId = true;
      if (!cUrl.trim()) newErrors.cUrl = true;
      if (!cModel.trim()) newErrors.cModel = true;
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        throw new Error("请填写必填字段");
      }
      await apiClient.post("/settings/llm", {
        providers: {
          [cId]: { baseUrl: cUrl, api: cApi, models: [{ id: cModel, name: cName || cModel }] },
        },
        defaultModel: { primary: `${cId}/${cModel}` },
      });
    } else if (activeTab === "builtin") {
      const p = BUILTIN_PROVIDERS.find((b) => b.id === selectedProvider)!;
      await apiClient.post("/settings/llm", {
        providers: {
          [p.id]: {
            baseUrl: p.baseUrl,
            api: p.api,
            apiKey,
            models: [{ id: p.defaultModel, name: p.defaultModel }],
          },
        },
        defaultModel: { primary: `${p.id}/${p.defaultModel}` },
      });
    }
    onDone();
  }

  useEffect(() => {
    onRegisterSubmit(handleSave);
  });

  function fillTemplate(name: string) {
    const t = TEMPLATES[name];
    if (!t) return;
    setCId(t.id);
    setCUrl(t.url);
    setCModel(t.model);
  }

  return (
    <div>
      <div className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 2 / 6 · 必填
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">LLM Provider 配置</h2>
      <p className="text-sm text-[#64748B] mb-4">选择并配置你的主要大模型服务提供商。</p>

      {/* Tabs */}
      <div className="flex border-b border-[#E5E7EB] mb-4">
        {(
          [
            ["builtin", "内置 Provider"],
            ["custom", "自定义 Provider"],
            ["market", "Marketplace 🛒"],
          ] as const
        ).map(([id, label]) => (
          <div
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 text-[13px] font-medium cursor-pointer border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id
                ? "text-[#2563EB] border-[#2563EB]"
                : "text-[#64748B] border-transparent hover:text-[#0F172A]"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Built-in */}
      {activeTab === "builtin" && (
        <div>
          <div className="grid grid-cols-4 gap-2.5 mb-4">
            {BUILTIN_PROVIDERS.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className={`bg-white border rounded-[10px] p-3.5 cursor-pointer text-center transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                  selectedProvider === p.id
                    ? "border-[#2563EB] bg-[#F0F7FF] shadow-[0_0_0_2px_rgba(37,99,235,0.1)]"
                    : "border-[#E5E7EB] hover:border-[#93C5FD]"
                }`}
              >
                <div className="text-[22px] mb-1.5">{p.icon}</div>
                <div className="font-semibold text-[13px]">{p.label}</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">{p.defaultModel}</div>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1.5">
              API Key <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              placeholder="sk-..."
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD]"
            />
            <p className="text-xs text-[#64748B] mt-1">安全提示：Key 将加密存储，不上传云端</p>
          </div>
        </div>
      )}

      {/* Custom */}
      {activeTab === "custom" && (
        <div>
          <div className="flex gap-2 mb-3.5 flex-wrap">
            {Object.keys(TEMPLATES).map((name) => (
              <button
                key={name}
                onClick={() => fillTemplate(name)}
                className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-2.5 py-1 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[#F8FAFC]"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex gap-4 mb-[18px]">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">
                Provider ID <span className="text-[#DC2626]">*</span>
              </label>
              <input
                value={cId}
                onChange={(e) => setCId(e.target.value)}
                placeholder="例如: local-ollama"
                className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cId ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">显示名称</label>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="例如: Ollama Local"
                className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg outline-none focus:border-[#93C5FD]"
              />
            </div>
          </div>
          <div className="mb-[18px]">
            <label className="block text-[13px] font-medium mb-1.5">
              Base URL <span className="text-[#DC2626]">*</span>
            </label>
            <input
              value={cUrl}
              onChange={(e) => setCUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434/v1"
              className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cUrl ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">
                Model ID <span className="text-[#DC2626]">*</span>
              </label>
              <input
                value={cModel}
                onChange={(e) => setCModel(e.target.value)}
                placeholder="例如: llama3"
                className={`w-full px-3 py-[9px] text-sm border rounded-lg outline-none focus:border-[#93C5FD] ${errors.cModel ? "border-[#DC2626]" : "border-[#E5E7EB]"}`}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium mb-1.5">API 类型</label>
              <select
                value={cApi}
                onChange={(e) => setCApi(e.target.value as "openai" | "anthropic")}
                className="w-full px-3 py-[9px] text-sm border border-[#E5E7EB] rounded-lg bg-white outline-none"
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic Compatible</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Marketplace */}
      {activeTab === "market" && (
        <div className="bg-[#FAFAFA] border border-dashed border-[#E5E7EB] rounded-[10px] py-9 px-6 text-center text-[#64748B]">
          <div className="text-[36px] mb-3">🛒</div>
          <div className="font-semibold text-[#0F172A] text-[15px] mb-1.5">lysmata Marketplace</div>
          <div className="text-[13px] max-w-[300px] mx-auto leading-[1.6]">
            提供稳定的大模型 API 服务。购买额度后一键激活，无需自行配置网络与 Key。
          </div>
          <button className="mt-5 bg-[#2563EB] text-white border-none px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8]">
            浏览大模型服务
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Check that `/settings/llm` POST exists**

```bash
grep -n 'llm\|provider' src-api/src/app/api/settings.ts | head -20
```

If the endpoint uses PUT instead of POST, adjust the `apiClient` call accordingly.

**Step 4: Wire into `WizardPage.tsx`**

```tsx
import { ProviderConfigView } from "./views/ProviderConfigView";
const providerSubmitRef = useRef<(() => Promise<void>) | null>(null);

// In content:
{
  step.id === "step2" && (
    <ProviderConfigView
      onRegisterSubmit={(fn) => {
        providerSubmitRef.current = fn;
      }}
      onDone={goNext}
    />
  );
}
```

**Step 5: Dev验证** — 选 OpenAI，填写 API Key，点"下一步"，确认写入 `~/.openclaw/openclaw.json`。

**Step 6: Commit**

```bash
git add src/pages/Onboarding/views/ProviderConfigView.tsx src/pages/Onboarding/WizardPage.tsx
git commit -m "feat(onboarding): add LLM Provider config step with built-in + custom + marketplace tabs (US-01-05)"
```

---

## Task 10: Optional Steps 3-5 and Review Step 6 (US-01-06)

**Files:**

- Create: `src/pages/Onboarding/views/ChannelConfigView.tsx`
- Create: `src/pages/Onboarding/views/SkillsConfigView.tsx`
- Create: `src/pages/Onboarding/views/HooksConfigView.tsx`
- Create: `src/pages/Onboarding/views/ReviewView.tsx`

**Goal:** Render steps 3-5 as read-only toggle UIs (no backend write for MVP), and step6 as a diff-preview + "应用配置" button. These steps are skippable.

**Step 1: Create three minimal placeholder views**

Each view follows the same pattern — badge, heading, content, no save needed for MVP:

```tsx
// src/pages/Onboarding/views/ChannelConfigView.tsx
export function ChannelConfigView() {
  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] border border-[#E5E7EB] mb-2.5">
        step 3 / 6 · 可跳过
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Channel 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">配置可接入 Gateway 的客户端通道白名单与鉴权。</p>
      {/* Toggle rows for Lysmata Desktop and VS Code — visual only for now */}
      <div className="text-sm text-[#94A3B8] py-8 text-center">
        Channel 配置将在安装完成后通过设置页管理。
      </div>
    </div>
  );
}
```

Create `SkillsConfigView.tsx` and `HooksConfigView.tsx` with the same pattern (step 4/5 badge, appropriate description).

**Step 2: Create `ReviewView.tsx`**

```tsx
// src/pages/Onboarding/views/ReviewView.tsx
import { WIZARD_FLOW } from "../../../shared/store/wizard-store";

interface Props {
  skippedSteps: Record<string, boolean>;
  onApply: () => Promise<void>;
  onRegisterSubmit: (fn: () => Promise<void>) => void;
}

export function ReviewView({ skippedSteps, onApply, onRegisterSubmit }: Props) {
  const skippedNames = WIZARD_FLOW.filter((s) => s.type === "config" && skippedSteps[s.id]).map(
    (s) => s.title,
  );

  useEffect(() => {
    onRegisterSubmit(onApply);
  }, []);

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 6 / 6 · 检查与应用
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">确认配置</h2>
      <p className="text-sm text-[#64748B] mb-4">确认以下变更，应用并重启 Gateway。</p>

      {/* Diff preview */}
      <div className="bg-[#1E293B] rounded-lg p-4 font-mono text-[12px] leading-[1.65] text-[#E2E8F0] mb-4 max-h-[180px] overflow-y-auto">
        <div className="text-[#64748B]">// openclaw.json (配置摘要)</div>
        <div className="text-[#10B981]">+ gateway.port: 18789</div>
        <div className="text-[#10B981]">+ gateway.auth.mode: none</div>
        <div className="text-[#10B981]">+ models.providers: configured</div>
      </div>

      {skippedNames.length > 0 && (
        <div className="px-3.5 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-[13px] text-[#92400E] mb-3">
          <strong>提示：</strong>以下步骤已跳过，可在设置中随时配置：{skippedNames.join("、")}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px]">
        <div>
          <div className="text-sm font-medium text-[#B45309]">重启 Gateway</div>
          <div className="text-xs text-[#92400E] mt-0.5">核心参数变更需要重启服务以生效。</div>
        </div>
        <div className="w-9 h-5 rounded-full bg-[#F59E0B] flex-shrink-0" />
      </div>
    </div>
  );
}
```

**Step 3: Wire all 4 views into `WizardPage.tsx`**

```tsx
import { ChannelConfigView } from "./views/ChannelConfigView";
import { SkillsConfigView } from "./views/SkillsConfigView";
import { HooksConfigView } from "./views/HooksConfigView";
import { ReviewView } from "./views/ReviewView";

// In content area:
{
  step.id === "step3" && <ChannelConfigView />;
}
{
  step.id === "step4" && <SkillsConfigView />;
}
{
  step.id === "step5" && <HooksConfigView />;
}
{
  step.id === "step6" && (
    <ReviewView
      skippedSteps={skippedSteps}
      onRegisterSubmit={(fn) => {
        reviewSubmitRef.current = fn;
      }}
      onApply={async () => {
        /* no-op for MVP — config already written per step */ goNext();
      }}
    />
  );
}
```

**Step 4: Dev验证**

- step3/4/5 的"跳过此步"按钮出现。
- step6 显示 diff 预览和跳过步骤提示。
- 点"应用配置"后跳转到 done。

**Step 5: Commit**

```bash
git add src/pages/Onboarding/views/ChannelConfigView.tsx \
        src/pages/Onboarding/views/SkillsConfigView.tsx \
        src/pages/Onboarding/views/HooksConfigView.tsx \
        src/pages/Onboarding/views/ReviewView.tsx \
        src/pages/Onboarding/WizardPage.tsx
git commit -m "feat(onboarding): add optional steps 3-5 and review step 6 with skip support (US-01-06)"
```

---

## Task 11: Done View + Re-enter Wizard (US-01-07, US-01-08)

**Files:**

- Create: `src/pages/Onboarding/views/DoneView.tsx`
- Modify: `src/pages/SettingsPage.tsx` (add re-enter wizard entry)

**Goal:** Completion page with "进入主界面" and "重新运行配置向导" link. Settings page gets a "重新运行向导" button that clears localStorage flag.

**Step 1: Create `DoneView.tsx`**

```tsx
// src/pages/Onboarding/views/DoneView.tsx
import { useNavigate } from "react-router-dom";
import { markOnboardingComplete, useWizardStore } from "../../../shared/store/wizard-store";

export function DoneView() {
  const navigate = useNavigate();
  const { goToStep, resetSkips } = useWizardStore();

  function handleReenter() {
    resetSkips();
    goToStep("step1");
  }

  function handleDashboard() {
    markOnboardingComplete();
    navigate("/bots");
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center pb-2">
      <div
        className="w-[72px] h-[72px] rounded-full border-4 border-[#BBF7D0] flex items-center justify-center mb-6 text-[#16A34A]"
        style={{ background: "linear-gradient(135deg, #DCFCE7, #BBF7D0)" }}
      >
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h1 className="text-[24px] font-bold m-0 mb-3">已就绪 🎉</h1>
      <p className="text-sm text-[#64748B] leading-[1.65] max-w-[380px] m-0 mb-7">
        Gateway 配置已应用并成功重启。
        <br />
        你现在可以开始创建 Bot 并开始对话了。
      </p>
      <button
        onClick={handleDashboard}
        className="bg-[#2563EB] text-white border-none px-7 py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8]"
      >
        进入主界面
      </button>
      <button
        onClick={handleReenter}
        className="bg-transparent border-none text-[#64748B] text-[13px] font-medium cursor-pointer underline underline-offset-[3px] hover:text-[#0F172A] mt-4 flex items-center gap-1"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-3.57" />
        </svg>
        重新运行配置向导
      </button>
    </div>
  );
}
```

**Step 2: Wire `DoneView` into `WizardPage.tsx`**

```tsx
import { DoneView } from "./views/DoneView";
// In content (no footer for done):
{
  step.id === "done" && <DoneView />;
}
```

**Step 3: Add re-enter entry in `SettingsPage.tsx`**

Before the closing `</div>` of the page:

```tsx
// src/pages/SettingsPage.tsx — add import
import { useNavigate } from "react-router-dom";
import { ONBOARDING_KEY } from "../shared/store/wizard-store";

// Inside the component, add a section:
const navigate = useNavigate();

function handleReenterWizard() {
  localStorage.removeItem(ONBOARDING_KEY);
  navigate("/onboarding");
}

// JSX to add at the bottom of the settings page:
<section className="mt-8 pt-8 border-t border-[#E5E7EB]">
  <h2 className="text-xs font-medium text-[#64748B] uppercase tracking-wide mb-3">配置向导</h2>
  <button
    onClick={handleReenterWizard}
    className="flex items-center gap-1.5 text-sm text-[#2563EB] hover:text-blue-700"
  >
    重新运行配置向导 →
  </button>
</section>;
```

**Step 4: Dev验证**

- Done 页显示"进入主界面"和"重新运行配置向导"。
- 点进入主界面 → 跳转 `/bots`，localStorage 有 `onboarding_completed`。
- 设置页有"重新运行配置向导"按钮，点击后清除 flag 并跳回 `/onboarding`。

**Step 5: Commit**

```bash
git add src/pages/Onboarding/views/DoneView.tsx \
        src/pages/Onboarding/WizardPage.tsx \
        src/pages/SettingsPage.tsx
git commit -m "feat(onboarding): add done view with re-enter wizard and settings page entry (US-01-07)"
```

---

## Task 12: Final Polish & Build Check

**Step 1: Run lint**

```bash
bun run lint 2>&1 | tail -30
```

Fix any reported issues.

**Step 2: Run build**

```bash
bun run build 2>&1 | tail -30
```

Expected: No TypeScript errors, build succeeds.

**Step 3: Smoke test the full flow manually**

- Clear `localStorage.onboarding_completed`
- Open app → lands on `/onboarding` → Intro view
- Click "开始安装" → Env check
- Click "一键安装" → Install SSE (error is OK in dev)
- Navigate via "直接配置" shortcut → step1 Gateway
- Fill Gateway fields → step2 Provider
- Select OpenAI + API key → step3 Channel → Skip → step4 Skills → Skip → step5 Hooks → Skip
- step6 Review → skipped steps banner shows Channel/Skills/Hooks
- "应用配置" → Done view
- "进入主界面" → `/bots` page
- Settings page → "重新运行配置向导" → back to wizard step1

**Step 4: Final commit**

```bash
bun run lint:fix
bun run format
git add -A
git commit -m "feat(onboarding): complete US-01 onboarding wizard - all 8 user stories implemented"
```

---

## Summary of User Stories Covered

| US       | 描述                     | 实现位置                                                       |
| -------- | ------------------------ | -------------------------------------------------------------- |
| US-01-01 | 零终端一键安装           | Task 6 — `InstallingView` + SSE hook                           |
| US-01-02 | 环境预检与状态反馈       | Task 5 — `EnvCheckView` + `/check-environment`                 |
| US-01-03 | 已安装用户跳过安装       | Task 4 — `IntroView` skip button                               |
| US-01-04 | 可视化 Gateway 配置      | Task 8 — `GatewayConfigView` + `/gateway-config` API           |
| US-01-05 | 可视化 LLM Provider 配置 | Task 9 — `ProviderConfigView`                                  |
| US-01-06 | 跳过可选步骤             | Task 10 — `WizardStore.skipCurrentStep`, Review skipped banner |
| US-01-07 | 重新运行向导             | Task 11 — `DoneView` re-enter, Settings entry                  |
| US-01-08 | 稍后配置先进主界面       | Task 6 — `InstallSuccessView` defer button                     |
