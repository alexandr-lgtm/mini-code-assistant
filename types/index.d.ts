export type MiniMood = 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error'
export type MiniKind = 'read' | 'edit' | 'run' | 'web' | 'agent' | 'other'
export type MiniOutcome = 'answer' | 'aborted' | 'refusal' | 'error'
export type MiniMessage = { from: 'you' | 'mini'; text: string }
export type MiniCell = { kind: MiniKind; isError: boolean }

export type MiniLive = { mood: MiniMood; bubble: string; step: string | null }
export type MiniTurn = {
  tools: number
  subTools: number
  errors: number
  ms: number | null
  outcome: MiniOutcome | null
  files: string[]
  tokensIn: number
  tokensOut: number
}
export type MiniUsage = { usd: number | null; contextPercent: number | null; forkTokens: number }
export type MiniActivity = { timeline: MiniCell[]; files: string[]; git: string | null }
export type MiniChat = { messages: MiniMessage[]; askingSince: number | null }
export type MiniTask = { id: string; subject: string; isDone: boolean }
export type MiniTests = {
  command: string[] | null
  status: 'idle' | 'running' | 'pass' | 'fail' | 'none'
  tail: string[]
  exitCode: number | null
  ms: number | null
}
export type MiniTab = 'chat' | 'work' | 'tests' | 'plan' | 'look'
export type MiniView = { tab: MiniTab; isCompact: boolean | null; character: string }

export type MiniAdviceKind = 'check' | 'commit' | 'continue' | 'careful' | 'other'
export type MiniAdviceItem = { kind: MiniAdviceKind; label: string; prompt: string }
export type MiniAdvice = {
  status: 'idle' | 'thinking' | 'ready' | 'error'
  question: string | null
  replies: string[]
  next: MiniAdviceItem[]
}
export type MiniStuck = { failKey: string | null; failCount: number; edits: Record<string, number>; alert: string | null }
export type MiniAdviceMode = 'auto' | 'manual' | 'off'
export type MiniLang = 'ru' | 'en'
export type MiniSettings = { advice: MiniAdviceMode; isAnimated: boolean; scheme: string; lang: MiniLang }

export type MiniStepState = 'todo' | 'sent' | 'done'
export type MiniStep = { title: string; prompt: string; state: MiniStepState }
export type MiniOwnPlan = { status: 'idle' | 'thinking' | 'ready' | 'error'; goal: string | null; steps: MiniStep[] }

declare module 'claude-code' {
  interface PluginState {
    'mini-code-assistant': {
      live: MiniLive
      turn: MiniTurn
      usage: MiniUsage
      activity: MiniActivity
      chat3: MiniChat
      plan: MiniTask[]
      tests: MiniTests
      view: MiniView
      advice: MiniAdvice
      stuck: MiniStuck
      settings: MiniSettings
      ownPlan: MiniOwnPlan
    }
  }
}
