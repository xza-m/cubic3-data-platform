import { useMemo } from 'react'
import Editor from '@monaco-editor/react'
import type { CubeDetail } from '@/api/semantic'

function buildPythonPreview(cube?: CubeDetail) {
  if (!cube) {
    return '# 请选择一个 Cube 后查看 Python 预览\n'
  }

  const dimensions = Object.entries(cube.dimensions)
    .map(([key, value]) => `    "${key}": {"title": "${value.title || key}", "type": "${value.type}"}`)
    .join(',\n')

  const measures = Object.entries(cube.measures)
    .map(([key, value]) => `    "${key}": {"title": "${value.title || key}", "type": "${value.type}"}`)
    .join(',\n')

  const joins = Object.entries(cube.joins)
    .map(([key, value]) => `    "${key}": {"target_cube": "${value.target_cube}", "type": "${value.type}"}`)
    .join(',\n')

  return `from cubic.semantic import CubeDefinition

${cube.name} = CubeDefinition(
    name="${cube.name}",
    title="${cube.title}",
    table="${cube.table}",
    description="${cube.description || ''}",
    dimensions={
${dimensions || '        # 暂无维度'}
    },
    measures={
${measures || '        # 暂无指标'}
    },
    joins={
${joins || '        # 暂无关联'}
    },
)`
}

export function PythonPreviewTab({ cube }: { cube?: CubeDetail }) {
  const preview = useMemo(() => buildPythonPreview(cube), [cube])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))]">
      <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
        <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">Python 实现预览</div>
        <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">当前仅作为对象定义参考，不参与保存与发布。</div>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language="python"
          value={preview}
          theme="vs"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbersMinChars: 3,
          }}
        />
      </div>
    </div>
  )
}
