// frontend/src/v2/observability/instance.ts
//
// 模块单例。拆出独立文件是为了避免 client / bootstrap / index 之间的循环引用：
//   - api/client.ts、components/ErrorBoundary.tsx 等业务模块从这里 import { obs }
//   - bootstrap.ts 从这里 import { obs } 并通过 obs.setSinks(...) 装配
//
// 默认装一个 ConsoleSink + BufferSink，让单测 / 早期 import 阶段也能产生可观测产物。

import { Observability } from './client'
import { BufferSink, ConsoleSink } from './sink'

const _defaultBuffer = new BufferSink()

export const obs = new Observability({
  sinks: [new ConsoleSink({ enabled: false }), _defaultBuffer],
  sampleRate: 1,
})

/** 仅供单测：拿到默认 buffer，断言早期事件 */
export function _internalDefaultBuffer(): BufferSink {
  return _defaultBuffer
}
