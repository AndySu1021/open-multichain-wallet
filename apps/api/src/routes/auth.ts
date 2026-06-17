import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { RegisterSchema, LoginSchema, RefreshTokenSchema } from '@fox-wallet/shared'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { Errors } from '../lib/errors.js'

type TokenPayload = { sub: string; email: string; type: 'access' | 'refresh' }

export async function authRoutes(app: FastifyInstance) {
  // ── Email register ─────────────────────────────────────────────────────────
  app.post('/auth/register', async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing) {
      const err = Errors.Conflict('Email already registered')
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const passwordHash = await bcrypt.hash(body.data.password, 12)
    const user = await prisma.user.create({
      data: { email: body.data.email, passwordHash },
    })

    return reply.code(201).send({
      ok: true,
      data: {
        user: { id: user.id.toString(), email: user.email, createdAt: user.createdAt.toISOString() },
        tokens: issueTokens(app, user.id.toString(), user.email),
      },
    })
  })

  // ── Email login ────────────────────────────────────────────────────────────
  app.post('/auth/login', async (request, reply) => {
    const body = LoginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user?.passwordHash) {
      const err = Errors.Unauthorized()
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) {
      const err = Errors.Unauthorized()
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }

    return reply.send({
      ok: true,
      data: {
        user: { id: user.id.toString(), email: user.email, createdAt: user.createdAt.toISOString() },
        tokens: issueTokens(app, user.id.toString(), user.email),
      },
    })
  })

  // ── Refresh token ──────────────────────────────────────────────────────────
  app.post('/auth/refresh', async (request, reply) => {
    const body = RefreshTokenSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION', message: body.error.message } })
    }

    try {
      const payload = app.jwt.verify<TokenPayload>(body.data.refreshToken)
      if (payload.type !== 'refresh') throw new Error('Not a refresh token')

      const accessToken = app.jwt.sign(
        { sub: payload.sub, email: payload.email, type: 'access' } satisfies TokenPayload,
        { expiresIn: '15m' },
      )
      return reply.send({ ok: true, data: { accessToken } })
    } catch {
      const err = Errors.Unauthorized()
      return reply.code(err.statusCode).send({ ok: false, error: { code: err.code, message: err.message } })
    }
  })

  // ── Google OAuth — redirect ────────────────────────────────────────────────
  app.get('/auth/google', async (_request, reply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return reply.code(503).send({
        ok: false,
        error: { code: 'NOT_CONFIGURED', message: 'Google OAuth not configured' },
      })
    }

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL ?? '',
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    })
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  })

  // ── Google OAuth — callback ────────────────────────────────────────────────
  app.get('/auth/google/callback', async (request, reply) => {
    const { code, error } = request.query as { code?: string; error?: string }
    const webOrigin = env.WEB_ORIGIN

    if (error || !code) {
      return reply.redirect(`${webOrigin}/login?error=oauth_denied`)
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID ?? '',
          client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
          redirect_uri: env.GOOGLE_CALLBACK_URL ?? '',
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = await tokenRes.json() as { access_token?: string }
      if (!tokenData.access_token) throw new Error('No access token from Google')

      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      const googleUser = await userRes.json() as { sub: string; email: string }

      let user = await prisma.user.findFirst({
        where: { OR: [{ googleId: googleUser.sub }, { email: googleUser.email }] },
      })
      if (!user) {
        user = await prisma.user.create({
          data: { email: googleUser.email, googleId: googleUser.sub },
        })
      } else if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: googleUser.sub },
        })
      }

      const tokens = issueTokens(app, user.id.toString(), user.email)
      const params = new URLSearchParams({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      })
      return reply.redirect(`${webOrigin}/auth/callback?${params.toString()}`)
    } catch (e) {
      app.log.error(e)
      return reply.redirect(`${webOrigin}/login?error=oauth_failed`)
    }
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────
function issueTokens(app: FastifyInstance, userId: string, email: string) {
  return {
    accessToken: app.jwt.sign(
      { sub: userId, email, type: 'access' } satisfies TokenPayload,
      { expiresIn: '15m' },
    ),
    refreshToken: app.jwt.sign(
      { sub: userId, email, type: 'refresh' } satisfies TokenPayload,
      { expiresIn: '30d' },
    ),
  }
}