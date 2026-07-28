import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import type { Elysia } from 'elysia'

const isProduction = process.env.NODE_ENV === 'production'
const enableSwagger = Bun.env.ENABLE_SWAGGER === '1'
const enableDevCors = !isProduction || Bun.env.ENABLE_CORS === '1'

export const applyRoutePlugins = <T extends Elysia>(app: T): T => {
  let next = app
  if (enableDevCors) {
    next = next.use(cors()) as T
  }
  if (enableSwagger) {
    next = next.use(
      swagger({
        path: '/swagger',
        documentation: { info: { title: 'BoomBoom News API', version: '0.1.0' } },
      }),
    ) as T
  }
  return next
}
