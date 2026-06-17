interface ApiSuccess<T> {
  ok: true
  data: T
}

interface ApiError {
  ok: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError