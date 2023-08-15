let $captures, $fullCaptures

Cypress.Commands.add('posthog', () => cy.window().then(($window) => $window.posthog))

Cypress.Commands.add('posthogInit', (options) => {
  $captures = []
  $fullCaptures = []

  cy.posthog().invoke('init', 'test_token', {
    api_host: location.origin,
    debug: true,
    _onCapture: (event, eventData) => {
      $captures.push(event)
      $fullCaptures.push(eventData)
    },
    ...options,
  })
})

Cypress.Commands.add('phCaptures', (options = {}) => {
  function resolve() {
    const result = options.full ? $fullCaptures : $captures
    return cy.verifyUpcomingAssertions(result, options, {
      onRetry: resolve,
    })
  }

  return resolve()
})

Cypress.Commands.add('resetPhCaptures', () => {
  $captures = []
  $fullCaptures = []
})

Cypress.Commands.add('shouldBeCalled', (alias, timesCalled) => {
  const calls = cy.state('requests').filter((call) => call.alias === alias)
  expect(calls).to.have.length(timesCalled, `${alias} should have been called ${timesCalled} times`)
})
