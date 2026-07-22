// Flat config (ESLint 9+). Rigor inicial: presets recommended SEM type-checked —
// o tsc strict (noUnusedLocals/Parameters) já cobre a parte de tipos; promover pra
// type-aware é decisão futura, se fizer falta. Sem Prettier/formatação por decisão.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // .eslintignore não existe mais — ignores globais vivem aqui.
  { ignores: ["dist", "src-tauri", "node_modules"] },

  // Código da aplicação (browser/WebView).
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Regras novas do React Compiler (hooks v7): rebaixadas pra WARN por decisão —
      // apontam padrões deliberados do projeto (latest-ref na mecânica de clock,
      // performance.now no countdown visual do Cronometrado). rules-of-hooks e
      // exhaustive-deps seguem error. Promover a error se o projeto adotar o Compiler.
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // Convenção do ecossistema (e do tsc): prefixo _ = ignorado de propósito.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Arquivos de build/tooling (Node).
  {
    files: ["vite.config.ts", "scripts/**/*.mjs"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  }
);
