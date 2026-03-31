# Onboarding Specification

## 总体规范
1. src/pages/OnboardingV2/Page.tsx 作为路由基石
2. src/pages/OnboardingV2/OnboardingPageShell.tsx 作为页面内容区域布局基础
3. 能让sidecar做的事情就让sidecar做
4. 涉及到桌面原生的才让rust做
5. 优先考虑macOS