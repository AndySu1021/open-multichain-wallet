export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  Unauthorized: () => new AppError('UNAUTHORIZED', 'Unauthorized', 401),
  NotFound: (resource: string) => new AppError('NOT_FOUND', `${resource} not found`, 404),
  Conflict: (msg: string) => new AppError('CONFLICT', msg, 409),
  BadRequest: (msg: string) => new AppError('BAD_REQUEST', msg, 400),
  Internal: () => new AppError('INTERNAL', 'Internal server error', 500),
} as const