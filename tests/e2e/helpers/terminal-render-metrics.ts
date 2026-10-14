import type { Terminal } from '@xterm/xterm'

// Pinned xterm renderer metrics, used only by grid/pixel E2E oracles.
export type TerminalWithRenderMetrics = Terminal & {
  _core: {
    _renderService: {
      dimensions: { css: { cell: { width: number; height: number } } }
    }
  }
}
