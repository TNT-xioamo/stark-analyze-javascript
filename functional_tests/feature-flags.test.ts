import { v4 } from 'uuid'
import { createPosthogInstance } from './posthog-instance'
import { waitFor } from '@testing-library/dom'
import { getRequests, resetRequests } from './mock-server'

test('person properties set in identify() with new distinct_id are sent to decide', async () => {
  const token = v4()
  const posthog = await createPosthogInstance(token, { advanced_disable_decide: false })

  const anonymousId = posthog.get_distinct_id()

  await waitFor(() => {
    expect(getRequests(token)['/decide/']).toEqual([
      {
        distinct_id: anonymousId,
        groups: {},
        token,
      },
    ])
  })

  resetRequests(token)

  posthog.identify('test-id', {
    email: 'test@email.com',
  })

  await waitFor(() => {
    expect(getRequests(token)['/decide/']).toEqual([
      // `identify()`.
      {
        $anon_distinct_id: anonymousId,
        distinct_id: 'test-id',
        person_properties: {
          email: 'test@email.com',
        },
        groups: {},
        token,
      },
    ])
  })
})

test('person properties set in identify() with the same distinct_id are sent to decide', async () => {
  const token = v4()
  const posthog = await createPosthogInstance(token, { advanced_disable_decide: false })

  const anonymousId = posthog.get_distinct_id()

  await waitFor(() => {
    expect(getRequests(token)['/decide/']).toEqual([
      {
        distinct_id: anonymousId,
        groups: {},
        token,
      },
    ])
  })

  resetRequests(token)

  posthog.identify('test-id')

  await waitFor(() => {
    expect(getRequests(token)['/decide/']).toEqual([
      // `identify()`.
      {
        $anon_distinct_id: anonymousId,
        distinct_id: 'test-id',
        groups: {},
        person_properties: {},
        token,
      },
    ])
  })

  resetRequests(token)

  posthog.identify('test-id', { email: 'test@email.com' })

  await waitFor(() => {
    expect(getRequests(token)['/decide/']).toEqual([
      {
        distinct_id: 'test-id',
        groups: {},
        person_properties: { email: 'test@email.com' },
        token,
      },
    ])
  })
})
