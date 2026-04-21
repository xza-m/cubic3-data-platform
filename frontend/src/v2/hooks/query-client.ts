// frontend/src/v2/hooks/query-client.ts
//
// 单一 react-query QueryClient 与默认值。
// 所有页面/hook 共用这一个 QueryClient，由 v2/App.tsx 注入 Provider。
//
// 默认值与 plan §03 §3.1 一致：staleTime 30s、retry 1、refetchOnWindowFocus false。

import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

/**
 * Query key 规范工具：始终生成 [domain, action, ...args] 形态。
 * 见 plan §01 §5。
 */
export function qk(domain: string, action: string, ...args: unknown[]): readonly unknown[] {
  return [domain, action, ...args] as const
}
