import { defineConfig } from 'cypress'

export default defineConfig({
  defaultCommandTimeout: 2000,
  numTestsKeptInMemory: 0,
  e2e: {
    setupNodeEvents(on, config) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('./cypress/plugins/index.js')(on, config)
    },
  },
})
