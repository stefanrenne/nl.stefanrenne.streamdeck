// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['.homeybuild/**', 'node_modules/**'],
  },
  {
    files: ['**/*.mts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Carried over from eslint-config-athom's homey-app preset
      '@typescript-eslint/no-floating-promises': 'error',
      // The Homey SDK accepts async callbacks in event/capability/lifecycle
      // slots that @types/homey types as void-returning, so only disable the
      // void-return sub-checks that flag that idiom; keep the rest.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false, inheritedMethods: false } },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { vars: 'all', args: 'none', ignoreRestSiblings: true },
      ],
    },
  },
);
