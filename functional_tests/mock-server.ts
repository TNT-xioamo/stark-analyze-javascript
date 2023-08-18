import { rest } from 'msw'
import { setupServer } from 'msw/lib/node'
import assert from 'assert'

const capturedRequests: { '/e/': any[]; '/engage/': any[]; '/decide/': any[] } = {
  '/e/': [],
  '/engage/': [],
  '/decide/': [],
}

const server = setupServer(
  rest.post('http://localhost/e/', (req: any, res: any, ctx: any) => {
    const body = req.body
    if (typeof body !== 'string') {
      assert(false, 'body is not a string')
      return
    }
    const data = JSON.parse(Buffer.from(decodeURIComponent(body.split('=')[1]), 'base64').toString())
    capturedRequests['/e/'] = [...(capturedRequests['/e/'] || []), data]
    return res(ctx.status(200))
  }),
  rest.post('http://localhost/engage/', (req: any, res: any, ctx: any) => {
    const body = req.body
    if (typeof body !== 'string') {
      assert(false, 'body is not a string')
      return
    }
    const data = JSON.parse(Buffer.from(decodeURIComponent(body.split('=')[1]), 'base64').toString())
    capturedRequests['/engage/'] = [...(capturedRequests['/engage/'] || []), data]
    return res(ctx.status(200))
  }),
  rest.post('http://localhost/decide/', (req: any, res: any, ctx: any) => {
    const body = req.body
    if (typeof body !== 'string') {
      assert(false, 'body is not a string')
      return
    }
    const data = JSON.parse(Buffer.from(decodeURIComponent(body.split('=')[1]), 'base64').toString())
    capturedRequests['/decide/'] = [...(capturedRequests['/decide/'] || []), data]
    return res(ctx.status(200), ctx.json({}))
  })
)

beforeAll(() =>
  server.listen({
    onUnhandledRequest: 'error',
  })
)
afterAll(() => server.close())

export const getRequests = (token: string) => {
  return {
    '/e/': capturedRequests['/e/'].filter((request) => request.properties.token === token),
    '/engage/': capturedRequests['/engage/'].filter((request) => request.properties.token === token),
    '/decide/': capturedRequests['/decide/'].filter((request) => request.token === token),
  }
}

export const resetRequests = (token: string) => {
  Object.assign(capturedRequests, {
    '/e/': (capturedRequests['/e/'] = capturedRequests['/e/'].filter((request) => request.properties.token !== token)),
    '/engage/': (capturedRequests['/engage/'] = capturedRequests['/engage/'].filter(
      (request) => request.properties.token !== token
    )),
    '/decide/': (capturedRequests['/decide/'] = capturedRequests['/decide/'].filter(
      (request) => request.token !== token
    )),
  })
}
