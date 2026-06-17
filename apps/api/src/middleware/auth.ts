import type { FastifyRequest, FastifyReply } from 'fastify'
import { Errors } from '../lib/errors.js'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const payload = request.user as { type?: string }
    if (payload.type !== 'access') throw new Error('Not an access token')
  } catch {
    const err = Errors.Unauthorized()
    reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; type: 'access' | 'refresh' }
    user: { sub: string; email: string; type: 'access' | 'refresh' }
  }
}