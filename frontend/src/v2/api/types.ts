// frontend/src/v2/api/types.ts
//
// 通用网络层类型定义。所有 v2/api/* 必须使用这些类型。
// 与后端契约对齐：snake_case 在 wire 上保留，前端通过 ts 类型 Pick/Omit 不重命名。

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ApiErrorPayload {
  code: string
  message: string
  details?: unknown
}

export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  static isAppError(err: unknown): err is AppError {
    return err instanceof AppError
  }
}

export interface ListQueryParams {
  page?: number
  page_size?: number
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
}
