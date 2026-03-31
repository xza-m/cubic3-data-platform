import { beforeEach, describe, expect, it, vi } from 'vitest'

const mainEntryMocks = vi.hoisted(() => ({
  createRoot: vi.fn(),
  render: vi.fn(),
}))

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: mainEntryMocks.createRoot,
  },
  createRoot: mainEntryMocks.createRoot,
}))

vi.mock('./App', () => ({
  default: () => <div>应用壳层</div>,
}))

describe('main entry', () => {
  beforeEach(() => {
    vi.resetModules()
    mainEntryMocks.render.mockReset()
    mainEntryMocks.createRoot.mockReset()
    mainEntryMocks.createRoot.mockReturnValue({ render: mainEntryMocks.render })
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('挂载 React 根节点并渲染应用', async () => {
    await import('./main')

    expect(mainEntryMocks.createRoot).toHaveBeenCalledWith(document.getElementById('root'))
    expect(mainEntryMocks.render).toHaveBeenCalledTimes(1)
  })
})
