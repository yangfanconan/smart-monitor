import crypto from 'node:crypto'

const ACCESS_TTL = 24 * 3600 * 1000
const REFRESH_TTL = 7 * 24 * 3600 * 1000
const CLEANUP_INTERVAL = 3600 * 1000

const sessions = new Map()

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

function createSession(userId, username, roles) {
  const accessToken = generateToken()
  const refreshToken = generateToken()
  const now = Date.now()

  sessions.set(accessToken, {
    userId, username, roles,
    refreshToken,
    createdAt: now,
    expiresAt: now + ACCESS_TTL,
    refreshExpiresAt: now + REFRESH_TTL,
  })

  return { accessToken, refreshToken }
}

function validateToken(token) {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    return null
  }
  return { userId: session.userId, username: session.username, roles: session.roles }
}

function refreshSession(refreshToken) {
  if (!refreshToken) return null
  const now = Date.now()

  for (const [accessToken, session] of sessions) {
    if (session.refreshToken === refreshToken) {
      if (now > session.refreshExpiresAt) {
        sessions.delete(accessToken)
        return null
      }
      const newAccessToken = generateToken()
      const newRefreshToken = generateToken()
      sessions.delete(accessToken)
      sessions.set(newAccessToken, {
        ...session,
        refreshToken: newRefreshToken,
        expiresAt: now + ACCESS_TTL,
        refreshExpiresAt: now + REFRESH_TTL,
      })
      return { accessToken: newAccessToken, refreshToken: newRefreshToken }
    }
  }
  return null
}

function revokeToken(token) {
  sessions.delete(token)
}

function revokeAllForUser(userId) {
  for (const [token, session] of sessions) {
    if (session.userId === userId) sessions.delete(token)
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now > session.refreshExpiresAt) sessions.delete(token)
  }
}, CLEANUP_INTERVAL).unref?.()

export const tokenManager = {
  createSession,
  validateToken,
  refreshSession,
  revokeToken,
  revokeAllForUser,
}
