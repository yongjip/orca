import type { AppState } from '../../../src/renderer/src/store/types'
import type { PaneManager } from '../../../src/renderer/src/lib/pane-manager/pane-manager'
import type { OpenFile, RightSidebarTab } from '../../../src/renderer/src/store/slices/editor'
import type { BrowserWorkspace } from '../../../src/shared/browser-workspace-types'
import type { Repo } from '../../../src/shared/repo-types'
import type { WorkspaceVisibleTabType } from '../../../src/shared/tab-types'
import type { TerminalTab } from '../../../src/shared/terminal-tab-types'
import type { Worktree } from '../../../src/shared/worktree/types'
import type { DictationMeterState } from '../../../src/renderer/src/components/dictation/dictation-audio-meter'
import type { ReactCommitHook } from './tab-render-recorder'

// Why: window.__store is the Zustand bound store itself, so specs get the whole StoreApi.
export type AppStore = {
  getState(): AppState
  setState(partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)): void
  subscribe(listener: (state: AppState, previousState: AppState) => void): () => void
}

export type PaneManagerLike = PaneManager

export type ExplorerFileSummary = Pick<OpenFile, 'id' | 'filePath' | 'relativePath'>
export type BrowserTabSummary = Pick<BrowserWorkspace, 'id' | 'url' | 'title'>
export type TerminalTabSummary = Pick<TerminalTab, 'id' | 'title' | 'customTitle'>
export type SidebarStateSummary = {
  rightSidebarOpen: boolean
  rightSidebarTab: RightSidebarTab
}
export type TestRepoState = {
  repos: Repo[]
  worktreesByRepo: Record<string, Worktree[]>
}
export type TerminalViewState = {
  activeTabId: string | null
  activeTabType: WorkspaceVisibleTabType
  activeWorktreeId: string | null
  ptyIdsByTabId: Record<string, string[]>
  tabsByWorktree: Record<string, TerminalTab[]>
}

declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    __store?: AppStore
    __dictationMeterE2E?: { publish(meter: DictationMeterState): void }
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactCommitHook
    __tabsRenderedPerCommit?: number[]
  }
}

export function getWindowStore(): AppStore | null {
  return window.__store ?? null
}

export function getAppState(): AppState {
  const store = getWindowStore()
  if (!store) {
    throw new Error('window.__store is not available — is the app in dev mode?')
  }

  return store.getState()
}
