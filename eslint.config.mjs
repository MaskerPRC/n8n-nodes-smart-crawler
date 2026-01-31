import { config } from '@n8n/node-cli/eslint';

const base = Array.isArray(config) ? config : [config];
export default [
	...base,
	{ ignores: ['**/test-huggingface.ts'] },
	{
		files: ['nodes/**/*.ts'],
		rules: {
			'@n8n/community-nodes/no-restricted-imports': 'off',
		},
	},
];
