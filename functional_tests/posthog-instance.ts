// The library depends on having the module initialized before it can be used.

import { v4 } from 'uuid'
import { PostHog, init_as_module } from '../src/posthog-core'
import 'regenerator-runtime/runtime'
import { PostHogConfig } from '../src/types'

beforeAll(() => init_as_module())

export const createPosthogInstance = async (token: string = v4(), config: Partial<PostHogConfig> = {}) => {
  const posthog = new PostHog()
  return await new Promise<PostHog>((resolve) =>
    posthog.init(
      token,
      {
        request_batching: false,
        api_host: 'http://localhost',
        ...config,
        loaded: (p) => {
          config.loaded?.(p)
          resolve(p)
        },
      },
      'test'
    )
  )
}
