import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // The game's rules are full of small integers and bit-twiddly arithmetic ported
      // verbatim; forbidding non-null assertions and the like would fight the port.
      "@typescript-eslint/no-non-null-assertion": "off",
      // Putting a number in a message is safe and constant here. The rule's real value is
      // catching objects stringified to "[object Object]", which stays on.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
);
