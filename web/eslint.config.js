import pluginVue from 'eslint-plugin-vue'
import {defineConfigWithVueTs, vueTsConfigs} from '@vue/eslint-config-typescript'

// ESLint 9 flat config, matching nom-webwallet and ferry. Formatting is Prettier's job.
export default defineConfigWithVueTs(
  {name: 'app/files-to-lint', files: ['**/*.{ts,mts,tsx,vue}']},
  {name: 'app/files-to-ignore', ignores: ['**/dist/**', 'node_modules/**']},
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'app/rules',
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-console': ['warn', {allow: ['warn', 'error']}],
      // Wall messages are attacker-controlled text. There is no v-html in this
      // app and there should never be one.
      'vue/no-v-html': 'error',
    },
  },
)
