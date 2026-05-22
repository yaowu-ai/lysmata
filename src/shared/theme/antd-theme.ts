import type { ThemeConfig } from "antd";

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: "#2563EB",
    colorInfo: "#2563EB",
    colorSuccess: "#16a34a",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    colorBgBase: "#ffffff",
    colorTextBase: "#0f172a",
    borderRadius: 10,
    fontFamily:
      '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 36,
    },
    Input: {
      paddingBlock: 8,
      borderRadius: 8,
    },
    InputNumber: {
      borderRadius: 8,
    },
    Select: {
      borderRadius: 8,
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Card: {
      borderRadiusLG: 12,
    },
  },
};
