// ESLint (este nombre de archivo lo exige ESLint): revisa errores comunes antes de ejecutar.
// Uso: npm run lint
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  { ignores: ["dist"] },
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      // Variables sin usar: error, excepto las que empiezan en mayuscula (componentes usados en JSX)
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" }],
      // Regla nueva de react-hooks 7: desaconseja cambiar estado al inicio de un efecto
      // (patron "cargar datos en useEffect" que usan las paginas). No es un error funcional;
      // queda como aviso para revisarlo al rediseñar cada pantalla.
      "react-hooks/set-state-in-effect": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
];
