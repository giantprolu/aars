import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'public/sw.js',
      'public/swe-worker-*.js',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            "Lire process.env uniquement dans src/server/env.ts (convention de configuration du spine).",
        },
      ],
    },
  },
  {
    files: ['src/server/env.ts', 'scripts/**/*.ts', 'drizzle.config.ts', 'next.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];

export default config;
