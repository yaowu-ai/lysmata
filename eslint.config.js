import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src-tauri/target",
      "src-tauri/gen",
      "src-tauri/bin",
      "src/pages/Onboarding/**",
      "src-api/src/app/api/settings.ts",
      "src/pages/BotManagement/BotFormDrawer.tsx",
      "src/pages/BotManagement/BotStatusPage.tsx",
      "src/pages/Chat/NewConversationDialog.tsx",
      "src/pages/Settings/AgentFormDrawer.tsx",
      "src/pages/Settings/GatewayConfigSection.tsx",
      "src/pages/Settings/ProviderFormDrawer.tsx",
      "src/pages/SettingsPage.tsx",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        Bun: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-else-return": ["error", { allowElseIf: false }],
      "prefer-const": "error",
    },
  },
  prettier,
);
