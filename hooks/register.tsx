import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  MiniActivity,
  MiniAdvice,
  MiniAdviceItem,
  MiniAdviceKind,
  MiniAdviceMode,
  MiniSettings,
  MiniStuck,
  MiniCell,
  MiniChat,
  MiniKind,
  MiniLang,
  MiniLive,
  MiniMessage,
  MiniMood,
  MiniOwnPlan,
  MiniStep,
  MiniTab,
  MiniTask,
  MiniTests,
  MiniTurn,
  MiniUsage,
  MiniView,
} from '../types'
import { CHARACTERS } from './characters'
import { LANG_LABEL, STRINGS } from './i18n'
import type { Strings } from './i18n'

const PANE = 'mini'
const TITLE = 'Mini'
const HISTORY_KEY = 'history'
const CHARACTER_KEY = 'character'
const SETTINGS_KEY = 'settings'
const STUCK_FAILS = 3
const STUCK_EDITS = 6
const DEFAULT_CHARACTER = 'bip'
const ASK_STALE_MS = 120_000
const DONE_TO_IDLE_MS = 30_000
const GIT_DEBOUNCE_MS = 1_000
const GIT_POLL_MS = 15_000

const EMPTY_TURN: MiniTurn = {
  tools: 0, subTools: 0, errors: 0, ms: null, outcome: null, files: [], tokensIn: 0, tokensOut: 0,
}

const live = atom({ plugin: 'mini-code-assistant', key: 'live' } as const, {
  mood: 'idle',
  bubble: '',
  step: null,
} as MiniLive)
const turn = atom({ plugin: 'mini-code-assistant', key: 'turn' } as const, EMPTY_TURN)
const usage = atom({ plugin: 'mini-code-assistant', key: 'usage' } as const, { usd: null, contextPercent: null, forkTokens: 0 } as MiniUsage)
const activity = atom({ plugin: 'mini-code-assistant', key: 'activity' } as const, { timeline: [], files: [], git: null } as MiniActivity)
const chat = atom({ plugin: 'mini-code-assistant', key: 'chat3' } as const, { messages: [], askingSince: null } as MiniChat)
const plan = atom({ plugin: 'mini-code-assistant', key: 'plan' } as const, [] as MiniTask[])
const tests = atom({ plugin: 'mini-code-assistant', key: 'tests' } as const, { command: null, status: 'idle', tail: [], exitCode: null, ms: null } as MiniTests)
const view = atom({ plugin: 'mini-code-assistant', key: 'view' } as const, { tab: 'chat', isCompact: null, character: DEFAULT_CHARACTER } as MiniView)

const EMPTY_ADVICE: MiniAdvice = { status: 'idle', question: null, replies: [], next: [] }
const EMPTY_STUCK: MiniStuck = { failKey: null, failCount: 0, edits: {}, alert: null }
const advice = atom({ plugin: 'mini-code-assistant', key: 'advice' } as const, EMPTY_ADVICE)
const stuck = atom({ plugin: 'mini-code-assistant', key: 'stuck' } as const, EMPTY_STUCK)
const settings = atom({ plugin: 'mini-code-assistant', key: 'settings' } as const, { advice: 'auto', isAnimated: true, scheme: 'light dark', lang: 'en' } as MiniSettings)

const EMPTY_OWN_PLAN: MiniOwnPlan = { status: 'idle', goal: null, steps: [] }
const ownPlan = atom({ plugin: 'mini-code-assistant', key: 'ownPlan' } as const, EMPTY_OWN_PLAN)

const ADVICE_ICON: Record<MiniAdviceKind, string> = {
  check: '🧪', commit: '📦', continue: '▶', careful: '⚠', other: '💡',
}

const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

const KINDS: Record<string, MiniKind> = {
  Read: 'read', Glob: 'read', Grep: 'read', LS: 'read',
  Edit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  Bash: 'run',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agent', Task: 'agent',
}

const KIND_COLOR: Record<MiniKind, string> = {
  read: '#4f8ef7', edit: '#f0a020', run: '#9d6cf0', web: '#1fb5c9', agent: '#e8650c', other: '#8a8f98',
}

const MOOD_COLOR: Record<MiniMood, string> = {
  idle: '#5b8def', thinking: '#9b6cf0', working: '#ef9a2a', waiting: '#e3b300', done: '#2fb170', error: '#e5484d',
}

const MOOD_STROKE: Record<MiniMood, string> = {
  idle: '#3d6fd0', thinking: '#7a4ad3', working: '#c97a12', waiting: '#b38c00', done: '#1f8c56', error: '#bb2f33',
}

const MOOD_FACE: Record<MiniMood, string> = {
  idle: '(•‿•)', thinking: '(o.o)…', working: '(•̀_•́)⚙', waiting: '(•_•)?', done: '(^‿^)', error: '(x_x)',
}

const clip = (text: string, size: number) => (text.length > size ? `${text.slice(0, Math.max(1, size - 1))}…` : text)

const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`)

// Module-level runtime handles: they reset on a hot reload, and ensure*() recreates them.
let cwd: string | null = null
let gitTimer: { cancel: () => void } | null = null
let gitDebounce: { cancel: () => void } | null = null
let doneTimer: { cancel: () => void } | null = null
let isGitRunning = false
let isGitQueued = false

function relative(path: string): string {
  if (cwd === null || !path.startsWith('/')) return path
  if (path === cwd) return '.'

  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path
}

function describe(tool: string, input: Record<string, unknown>): string {
  const arg = [input.description, input.command, input.file_path, input.pattern, input.url, input.query]
    .find(value => typeof value === 'string' && value !== '')

  return typeof arg === 'string' ? `${tool}: ${relative(arg)}` : tool
}

async function strings($: EngineInterface): Promise<Strings> {
  return STRINGS[(await read($, settings)).lang]
}

async function myName($: EngineInterface): Promise<string> {
  const [cfg, v] = [await read($, settings), await read($, view)]

  return characterOf(v.character)?.name[cfg.lang] ?? 'Mini'
}

function detectLang(value: string | undefined): MiniLang | null {
  if (value === undefined || value === '') return null

  return /^ru/i.test(value) || /russian|рус/i.test(value) ? 'ru' : 'en'
}

function characterOf(id: string | undefined) {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0]
}

function nestDrawing(source: string, x: number, y: number, side: number): string {
  return source.replace(/^<svg\b[^>]*>/, root => {
    const viewBox = /viewBox="([^"]+)"/.exec(root)?.[1] ?? '0 0 180 180'

    return `<svg x="${x}" y="${y}" width="${side}" height="${side}" viewBox="${viewBox}" fill="none">`
  })
}

function overlay(mood: MiniMood): string {
  const body = MOOD_COLOR[mood]
  const edge = MOOD_STROKE[mood]
  const ink = '#1d1f24'

  return mood === 'thinking'
    ? [0, 1, 2].map(i => `<circle cx="${98 + i * 9}" cy="12" r="4" fill="${body}" stroke="${edge}" stroke-width="1"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="${i * 0.2}s" repeatCount="indefinite"/></circle>`).join('')
    : mood === 'working'
      ? `<g transform="translate(110 16)"><g><circle r="9" fill="none" stroke="${body}" stroke-width="5" stroke-dasharray="5 3"/><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s" repeatCount="indefinite"/></g></g>`
      : mood === 'waiting'
        ? `<g><circle cx="110" cy="16" r="13" fill="${body}" stroke="${edge}" stroke-width="2"/><text x="110" y="23" text-anchor="middle" font-size="20" font-weight="700" fill="${ink}" font-family="sans-serif">?</text><animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.8s" repeatCount="indefinite"/></g>`
        : mood === 'done'
          ? `<path d="M108 4l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#f5c542" stroke="#c99a12" stroke-width="1"><animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/></path>`
          : mood === 'error'
            ? `<g><circle cx="110" cy="16" r="13" fill="${body}" stroke="${edge}" stroke-width="2"/><text x="110" y="23" text-anchor="middle" font-size="20" font-weight="700" fill="#fff" font-family="sans-serif">!</text></g>`
            : ''
}

function motion(mood: MiniMood): string {
  return mood === 'error'
    ? '<animateTransform attributeName="transform" type="translate" values="0 0;-2 0;2 0;0 0" dur="0.4s" repeatCount="3"/>'
    : mood === 'working' || mood === 'thinking' || mood === 'waiting'
      ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.9s" repeatCount="indefinite"/>'
      : '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0" dur="3s" repeatCount="indefinite"/>'
}

// An interactive Svg is drawn in a sandboxed frame: a frame whose colour scheme differs from the
// app's gets an opaque (white) canvas, so every root states the app's scheme and a clear background.
function svgOpen(width: number, height: number, viewBox: string, scheme: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" style="color-scheme:${scheme};background:transparent"><style>:root{color-scheme:${scheme};background:transparent}</style>`
}

function character(id: string | undefined, mood: MiniMood, size: number, scheme: string): string {
  const drawing = nestDrawing(characterOf(id)?.moods[mood] ?? '', 14, 4, 96)
  const height = Math.round((size * 100) / 124)

  return `${svgOpen(size, height, '0 0 124 100', scheme)}<g>${motion(mood)}${drawing}</g>${overlay(mood)}</svg>`
}

function portrait(id: string, size: number): string {
  const drawing = nestDrawing(characterOf(id)?.moods.idle ?? '', 0, 0, size)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${drawing}</svg>`
}

function strip(cells: MiniCell[], columns: number): string {
  const slots = Math.max(12, Math.min(60, Math.floor(columns * 0.9)))
  const shown = cells.slice(-slots)
  const step = 7
  const width = slots * step
  const track = `<rect x="0" y="0" width="${width}" height="14" rx="3" fill="#8a8f98" opacity="0.15"/>`
  const rects = shown
    .map((cell, i) => {
      const tick = cell.isError ? `<rect x="${i * step + 1}" y="16" width="${step - 3}" height="3" rx="1" fill="#e5484d"/>` : ''

      return `<rect x="${i * step + 1}" y="2" width="${step - 3}" height="10" rx="1.5" fill="${KIND_COLOR[cell.kind]}"/>${tick}`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 20" width="${width}" height="20">${track}${rects}</svg>`
}

async function ensureCwd($: EngineInterface) {
  if (cwd === null) {
    cwd = await $.session.cwd()
  }
}

async function runGit($: EngineInterface) {
  if (isGitRunning) {
    isGitQueued = true

    return
  }
  isGitRunning = true
  try {
    const { exitCode, stdout } = await $.process.run(
      ['git', '--no-optional-locks', 'status', '--short', '--branch'],
      { timeoutMs: 5000 },
    )
    const text = exitCode === 0 ? stdout.trimEnd().split('\n').slice(0, 40).join('\n') : (await strings($)).notGitRepo
    await update($, activity, a => ({ ...a, git: text }))
  } catch {
    const gitUnavailable = (await strings($)).gitUnavailable
    await update($, activity, a => ({ ...a, git: gitUnavailable }))
  } finally {
    isGitRunning = false
  }
  if (isGitQueued) {
    isGitQueued = false
    void runGit($)
  }
}

function scheduleGit($: EngineInterface) {
  gitDebounce?.cancel()
  gitDebounce = $.clock.after(GIT_DEBOUNCE_MS, () => void runGit($))
}

function ensureTimers($: EngineInterface) {
  if (gitTimer === null) {
    gitTimer = $.clock.every(GIT_POLL_MS, () => void runGit($))
    void runGit($)
  }
}

async function refreshUsage($: EngineInterface) {
  try {
    const now = await $.session.usage()
    await update($, usage, u => ({
      ...u,
      usd: now.cost?.usd ?? null,
      contextPercent: now.context.percent ?? null,
    }))
  } catch {
    // usage is best effort: some hosts keep no ledger
  }
}

async function settleIdle($: EngineInterface) {
  await update($, live, l => (l.mood === 'done' ? { ...l, mood: 'idle' as MiniMood } : l))
}

async function loadCharacter($: EngineInterface) {
  const saved = await $.store.get(CHARACTER_KEY)
  if (typeof saved === 'string' && CHARACTERS.some(c => c.id === saved)) {
    await update($, view, v => ({ ...v, character: saved }))
  }
}

async function pickCharacter($: EngineInterface, id: string) {
  await update($, view, v => ({ ...v, character: id, tab: 'chat' as MiniTab }))
  await $.store.set(CHARACTER_KEY, id)
  $.ui.toast((await strings($)).nowI(await myName($)))
}

async function loadHistory($: EngineInterface) {
  const saved = await $.store.get(HISTORY_KEY)
  if (!Array.isArray(saved)) return
  const messages = saved
    .filter((m): m is MiniMessage => typeof m === 'object' && m !== null && 'from' in m && 'text' in m)
    .slice(-20)
  await update($, chat, c => (c.messages.length === 0 ? { ...c, messages } : c))
}

async function saveHistory($: EngineInterface) {
  const { messages } = await read($, chat)
  await $.store.set(HISTORY_KEY, messages.slice(-20))
}

async function ask($: EngineInterface, shown: string, prompt: string) {
  const now = await $.clock.now()
  let isBusy = false
  await update($, chat, c => {
    isBusy = c.askingSince !== null && now - c.askingSince < ASK_STALE_MS
    if (isBusy) return c

    return { ...c, askingSince: now, messages: [...c.messages, { from: 'you', text: clip(shown, 500) } as MiniMessage].slice(-30) }
  })
  const L = await strings($)
  if (isBusy) {
    $.ui.toast(L.stillAnswering)

    return
  }
  await update($, view, v => ({ ...v, tab: 'chat' as MiniTab }))

  let text = ''
  try {
    const reply = await $.model.fork({
      prompt: L.askPrompt(await myName($), prompt),
    })
    const spent = reply.isAnswered || reply.reason !== 'nothing-to-fork'
      ? reply.usage.input_tokens + reply.usage.output_tokens + reply.usage.cache_creation_input_tokens
      : 0
    await update($, usage, u => ({ ...u, forkTokens: u.forkTokens + spent }))
    text = reply.isAnswered
      ? reply.text.trim()
      : reply.reason === 'nothing-to-fork'
        ? L.nothingToFork
        : L.askFailedWith(reply.reason)
  } catch {
    text = L.askFailed
  } finally {
    await update($, chat, c => ({
      ...c,
      askingSince: null,
      messages: [...c.messages, { from: 'mini', text: clip(text, 4000) } as MiniMessage].slice(-30),
    }))
  }
  await saveHistory($)
}

async function clearChat($: EngineInterface) {
  await update($, chat, c => ({ ...c, messages: [] }))
  await $.store.set(HISTORY_KEY, [])
}

async function readText($: EngineInterface, path: string): Promise<string | null> {
  try {
    if (!(await $.fs.exists(path))) return null
    const value: unknown = await $.fs.read(path)

    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

async function detectTests($: EngineInterface): Promise<string[] | null> {
  const pkg = await readText($, 'package.json')
  if (pkg !== null) {
    try {
      const parsed = JSON.parse(pkg) as { scripts?: Record<string, unknown> }
      if (typeof parsed.scripts?.test === 'string' && !parsed.scripts.test.includes('no test specified')) {
        const runner = (await $.fs.exists('pnpm-lock.yaml'))
          ? 'pnpm'
          : (await $.fs.exists('yarn.lock'))
            ? 'yarn'
            : (await $.fs.exists('bun.lock')) || (await $.fs.exists('bun.lockb'))
              ? 'bun'
              : 'npm'

        return runner === 'npm' ? ['npm', 'test', '--silent'] : [runner, 'test']
      }
    } catch {
      // a broken package.json falls through to the other detectors
    }
  }
  if (await $.fs.exists('Cargo.toml')) return ['cargo', 'test']
  if (await $.fs.exists('go.mod')) return ['go', 'test', './...']
  if ((await $.fs.exists('pytest.ini')) || (await $.fs.exists('pyproject.toml'))) return ['python3', '-m', 'pytest', '-q']
  const make = await readText($, 'Makefile')
  if (make !== null && /^test:/m.test(make)) return ['make', 'test']

  return null
}

async function prepareTests($: EngineInterface) {
  const current = await read($, tests)
  if (current.command !== null || current.status === 'none') return
  const command = await detectTests($)
  await update($, tests, (t): MiniTests => ({ ...t, command, status: command === null ? 'none' : t.status }))
}

async function runTests($: EngineInterface) {
  const current = await read($, tests)
  if (current.status === 'running') return
  const command = current.command ?? (await detectTests($))
  if (command === null) {
    await update($, tests, (t): MiniTests => ({ ...t, status: 'none' }))

    return
  }
  await update($, tests, (t): MiniTests => ({ ...t, command, status: 'running', tail: [], exitCode: null, ms: null }))
  const startedAt = await $.clock.now()
  try {
    const { exitCode, stdout, stderr } = await $.process.run(command, { timeoutMs: 600_000 })
    const lines = `${stdout}\n${stderr}`.split('\n').map(line => line.trimEnd()).filter(line => line !== '')
    const ms = (await $.clock.now()) - startedAt
    await update($, tests, (t): MiniTests => ({ ...t, status: exitCode === 0 ? 'pass' : 'fail', exitCode, ms, tail: lines.slice(-30) }))
    const L = await strings($)
    $.ui.toast(exitCode === 0 ? L.testsPassedToast : L.testsFailedToast)
  } catch {
    const ms = (await $.clock.now()) - startedAt
    const didNotRun = (await strings($)).testsDidNotRun
    await update($, tests, (t): MiniTests => ({ ...t, status: 'fail', exitCode: null, ms, tail: [didNotRun] }))
  }
}

async function sendTestFailure($: EngineInterface) {
  const t = await read($, tests)
  if (t.status !== 'fail' || t.command === null) return
  const L = await strings($)
  try {
    await $.prompt.submit({ text: L.testFailurePrompt(t.command.join(' '), `${t.exitCode ?? '—'}`, t.tail.slice(-20).join('\n')) })
    $.ui.toast(L.sentTestFailure)
  } catch {
    $.ui.toast(L.sendFailed)
  }
}

async function setTab($: EngineInterface, tab: MiniTab) {
  await update($, view, v => ({ ...v, tab }))
  if (tab === 'tests') void prepareTests($)
  if (tab === 'work') void runGit($)
}

async function setCompact($: EngineInterface, isCompact: boolean) {
  await update($, view, v => ({ ...v, isCompact }))
}

async function clearFiles($: EngineInterface) {
  await update($, activity, a => ({ ...a, files: [] }))
}

const ADVICE_KINDS = new Set<MiniAdviceKind>(['check', 'commit', 'continue', 'careful', 'other'])

function looksLikeQuestion(answer: string): boolean {
  const tail = answer.trim().slice(-400)

  return /\?\s*(\*\*)?\s*$/.test(tail) || /\?\s*\n/.test(tail.slice(-200))
}

function parseAdvice(text: string): MiniAdvice | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const question = typeof raw.question === 'string' && raw.question.trim() !== '' ? clip(raw.question.trim(), 300) : null
    const replies = Array.isArray(raw.replies)
      ? raw.replies.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map(r => clip(r.trim(), 120)).slice(0, 4)
      : []
    const next = Array.isArray(raw.next)
      ? raw.next
          .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
          .map(n => ({
            kind: (ADVICE_KINDS.has(n.kind as MiniAdviceKind) ? n.kind : 'other') as MiniAdviceKind,
            label: typeof n.label === 'string' ? clip(n.label.trim(), 48) : '',
            prompt: typeof n.prompt === 'string' ? clip(n.prompt.trim(), 1500) : '',
          }))
          .filter((n): n is MiniAdviceItem => n.label !== '' && n.prompt !== '')
          .slice(0, 3)
      : []

    return { status: 'ready', question: question !== null && replies.length > 0 ? question : null, replies: question !== null ? replies : [], next }
  } catch {
    return null
  }
}

async function advise($: EngineInterface, isAuto: boolean) {
  const current = await read($, advice)
  if (current.status === 'thinking') return
  await update($, advice, () => ({ ...EMPTY_ADVICE, status: 'thinking' as const }))
  try {
    const reply = await $.model.fork({ prompt: (await strings($)).advicePrompt(await myName($)) })
    if (reply.isAnswered || reply.reason !== 'nothing-to-fork') {
      const spent = reply.usage.input_tokens + reply.usage.output_tokens + reply.usage.cache_creation_input_tokens
      await update($, usage, u => ({ ...u, forkTokens: u.forkTokens + spent }))
    }
    const parsed = reply.isAnswered ? parseAdvice(reply.text) : null
    if (parsed === null) {
      await update($, advice, () => ({ ...EMPTY_ADVICE, status: 'error' as const }))

      return
    }
    await update($, advice, () => parsed)
    const first = parsed.next[0]
    if (isAuto && parsed.question === null && first !== undefined) {
      void $.prompt.suggest({ text: first.prompt })
    }
  } catch {
    await update($, advice, () => ({ ...EMPTY_ADVICE, status: 'error' as const }))
  }
}

function parsePlan(text: string): MiniStep[] | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { steps?: unknown }
    if (!Array.isArray(raw.steps)) return null
    const steps = raw.steps
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map(x => ({
        title: typeof x.title === 'string' ? clip(x.title.trim(), 80) : '',
        prompt: typeof x.prompt === 'string' ? clip(x.prompt.trim(), 1500) : '',
        state: (x.done === true ? 'done' : 'todo') as MiniStep['state'],
      }))
      .filter(x => x.title !== '' && x.prompt !== '')
      .slice(0, 7)

    return steps.length > 0 ? steps : null
  } catch {
    return null
  }
}

async function makePlan($: EngineInterface, isAuto: boolean) {
  const current = await read($, ownPlan)
  if (current.status === 'thinking') return
  const L = await strings($)
  const goal = current.goal ?? L.planGoalFallback
  await update($, ownPlan, p => ({ ...p, status: 'thinking' as const }))
  try {
    const reply = await $.model.fork({ prompt: L.planPrompt(await myName($), goal) })
    if (reply.isAnswered || reply.reason !== 'nothing-to-fork') {
      const spent = reply.usage.input_tokens + reply.usage.output_tokens + reply.usage.cache_creation_input_tokens
      await update($, usage, u => ({ ...u, forkTokens: u.forkTokens + spent }))
    }
    const steps = reply.isAnswered ? parsePlan(reply.text) : null
    if (steps === null) {
      await update($, ownPlan, p => ({ ...p, status: 'error' as const }))

      return
    }
    await update($, ownPlan, p => ({ ...p, status: 'ready' as const, steps }))
    const next = steps.find(step => step.state === 'todo')
    await update($, live, l => ({ ...l, bubble: L.planReady(steps.length) }))
    if (isAuto && next !== undefined) {
      void $.prompt.suggest({ text: next.prompt })
    }
  } catch {
    await update($, ownPlan, p => ({ ...p, status: 'error' as const }))
  }
}

async function sendStep($: EngineInterface, index: number) {
  const step = (await read($, ownPlan)).steps[index]
  if (step === undefined) return
  await update($, ownPlan, p => ({ ...p, steps: p.steps.map((x, i) => (i === index ? { ...x, state: 'sent' as const } : x)) }))
  await submitText($, step.prompt)
}

async function toggleStep($: EngineInterface, index: number) {
  await update($, ownPlan, p => ({
    ...p,
    steps: p.steps.map((x, i) => (i === index ? { ...x, state: x.state === 'done' ? ('todo' as const) : ('done' as const) } : x)),
  }))
}

async function submitText($: EngineInterface, text: string) {
  await update($, advice, () => EMPTY_ADVICE)
  try {
    await $.prompt.submit({ text })
  } catch {
    $.ui.toast((await strings($)).sendFailed)
  }
}

async function fillText($: EngineInterface, text: string) {
  const filled = await $.prompt.fill({ text })
  if (!filled.isFilled) $.ui.toast((await strings($)).fillFailed)
}

async function nudgeAgent($: EngineInterface) {
  const s = await read($, stuck)
  if (s.alert === null) return
  const L = await strings($)
  const text = L.nudgeText(s.alert)
  const l = await read($, live)
  const isRunning = l.mood === 'working' || l.mood === 'thinking' || l.mood === 'waiting'
  await update($, stuck, st => ({ ...st, alert: null, failKey: null, failCount: 0 }))
  try {
    if (isRunning) {
      const appended = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: `[Mini] ${text}` }] } })
      $.ui.toast('deny' in appended && appended.deny !== undefined ? L.nudgeFailed : L.nudgedLive)
    } else {
      await $.prompt.submit({ text })
      $.ui.toast(L.nudgeSent)
    }
  } catch {
    $.ui.toast(L.nudgeFailed)
  }
}

async function dismissStuck($: EngineInterface) {
  await update($, stuck, st => ({ ...st, alert: null }))
}

async function raiseStuck($: EngineInterface, alert: string) {
  await update($, stuck, st => ({ ...st, alert }))
  const L = await strings($)
  await update($, live, l => ({ ...l, mood: 'error' as MiniMood, bubble: L.stuckBubble(alert) }))
  $.ui.toast(L.stuckToast(clip(alert, 60)), { timeoutMs: 8000 })
}

async function loadSettings($: EngineInterface) {
  const saved = await $.store.get(SETTINGS_KEY)
  let scheme = 'light dark'
  try {
    const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
    if (typeof theme === 'string') scheme = theme.includes('dark') ? 'dark' : theme.includes('light') ? 'light' : 'light dark'
  } catch {
    // keep following the system scheme
  }
  const stored = typeof saved === 'object' && saved !== null ? (saved as Partial<MiniSettings>) : {}
  let lang: MiniLang | null = stored.lang === 'ru' || stored.lang === 'en' ? stored.lang : null
  if (lang === null) {
    try {
      const configured = (await $.config.list()).find(row => row.key === 'language')?.value
      lang = detectLang(typeof configured === 'string' ? configured : undefined)
    } catch {
      // no language row on this host
    }
  }
  if (lang === null) {
    try {
      lang = detectLang(await $.env.get('LANG')) ?? detectLang(await $.env.get('LC_ALL'))
    } catch {
      // environment not readable
    }
  }
  await update($, settings, st => ({
    advice: stored.advice === 'auto' || stored.advice === 'manual' || stored.advice === 'off' ? stored.advice : st.advice,
    isAnimated: typeof stored.isAnimated === 'boolean' ? stored.isAnimated : st.isAnimated,
    scheme,
    lang: lang ?? 'en',
  }))
}

async function changeSettings($: EngineInterface, change: Partial<MiniSettings>) {
  const next = await update($, settings, st => ({ ...st, ...change }))
  await $.store.set(SETTINGS_KEY, { advice: next.advice, isAnimated: next.isAnimated, lang: next.lang })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({ name: 'mini', description: STRINGS.en.commandDescription })
    if (e.isInteractive) {
      ensureTimers($)
      void loadHistory($)
      void loadCharacter($)
      void loadSettings($)
      void refreshUsage($)
      void $.ui.open({ id: PANE, title: TITLE })
    }

    return next(e)
  })

  on('command.run', { command: 'mini' }, async $ => {
    await ensureCwd($)
    ensureTimers($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: (await strings($)).commandOpened }
  })

  on('turn.start', async ($, e, next) => {
    await ensureCwd($)
    ensureTimers($)
    doneTimer?.cancel()
    doneTimer = null
    await update($, turn, () => EMPTY_TURN)
    await update($, advice, () => EMPTY_ADVICE)
    await update($, stuck, () => EMPTY_STUCK)
    const goal = e.text.trim()
    if (goal.length >= 25 && !goal.startsWith('/')) {
      await update($, ownPlan, p => (p.goal === null ? { ...p, goal: clip(goal.replace(/\s+/g, ' '), 300) } : p))
    }
    const L = await strings($)
    await update($, live, () => ({ mood: 'thinking' as MiniMood, bubble: L.bubbleThinking, step: L.stepThinking }))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await update($, turn, t => ({ ...t, subTools: t.subTools + 1 }))

      return next(e)
    }

    const input = e as unknown as Record<string, unknown>
    const kind = KINDS[e.tool] ?? (e.tool.startsWith('mcp__') ? 'web' : 'other')
    const what = clip(describe(e.tool, input), 160)
    const L = await strings($)
    await update($, live, () => ({ mood: 'working' as MiniMood, bubble: L.bubbleNow(L.kind[kind]), step: what }))
    await update($, activity, a => ({ ...a, timeline: [...a.timeline, { kind, isError: false }].slice(-120) }))
    await update($, turn, t => ({ ...t, tools: t.tools + 1 }))

    const ran = await next(e)

    const hasFailed = ran.deny === undefined && ran.isError === true
    if (hasFailed) {
      await update($, turn, t => ({ ...t, errors: t.errors + 1 }))
      await update($, activity, a => ({
        ...a,
        timeline: a.timeline.map((cell, i) => (i === a.timeline.length - 1 ? { ...cell, isError: true } : cell)),
      }))
      await update($, live, l => ({ ...l, bubble: L.bubbleFailed(clip(what, 50)) }))
      const key = `${e.tool}:${what}`
      const st = await update($, stuck, x => (x.failKey === key ? { ...x, failCount: x.failCount + 1 } : { ...x, failKey: key, failCount: 1 }))
      if (st.failCount === STUCK_FAILS) {
        await raiseStuck($, L.stuckFails(clip(what, 70), STUCK_FAILS))
      }
    } else if (ran.deny !== undefined) {
      await update($, live, l => ({ ...l, mood: 'working' as MiniMood, bubble: L.bubbleDenied }))
    } else {
      await update($, live, l => (l.mood === 'waiting' ? { ...l, mood: 'working' as MiniMood, bubble: L.bubbleThanks } : l))
      await update($, stuck, x => (x.failKey === `${e.tool}:${what}` ? { ...x, failKey: null, failCount: 0 } : x))
    }

    if (WRITE_TOOLS.has(e.tool) && typeof input.file_path === 'string' && !hasFailed) {
      const path = relative(input.file_path)
      await update($, activity, a => (a.files.includes(path) ? a : { ...a, files: [...a.files, path].slice(-200) }))
      await update($, turn, t => (t.files.includes(path) ? t : { ...t, files: [...t.files, path].slice(-50) }))
      const st = await update($, stuck, x => ({ ...x, edits: { ...x.edits, [path]: (x.edits[path] ?? 0) + 1 } }))
      if (st.edits[path] === STUCK_EDITS) {
        await raiseStuck($, L.stuckEdits(clip(path, 60), STUCK_EDITS))
      }
      scheduleGit($)
    }

    return ran
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.agent_id === undefined) {
      const input = typeof e.tool_input === 'object' && e.tool_input !== null ? (e.tool_input as Record<string, unknown>) : {}
      const what = clip(describe(e.tool_name, input), 80)
      const L = await strings($)
      await update($, live, l => ({ ...l, mood: 'waiting' as MiniMood, bubble: L.permissionBubble(what) }))
      $.ui.toast(L.permissionToast(clip(what, 60)), { timeoutMs: 8000 })
    }

    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.agent_id === undefined && (e.notification_type === 'permission_prompt' || e.notification_type === 'idle_prompt')) {
      const current = await read($, live)
      if (current.mood !== 'waiting') {
        const bubble = e.notification_type === 'idle_prompt' ? (await strings($)).idleBubble : clip(e.message, 120)
        await update($, live, l => ({ ...l, mood: 'waiting' as MiniMood, bubble }))
        $.ui.toast(bubble, { timeoutMs: 8000 })
      }
    }

    return next(e)
  })

  on('classic.TaskCreated', async ($, e, next) => {
    await update($, plan, list =>
      list.some(task => task.id === e.task_id)
        ? list
        : [...list, { id: e.task_id, subject: clip(e.task_subject, 200), isDone: false }].slice(-50),
    )

    return next(e)
  })

  on('classic.TaskCompleted', async ($, e, next) => {
    await update($, plan, list =>
      list.some(task => task.id === e.task_id)
        ? list.map(task => (task.id === e.task_id ? { ...task, isDone: true } : task))
        : [...list, { id: e.task_id, subject: clip(e.task_subject, 200), isDone: true }].slice(-50),
    )

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const tokensIn = e.usage === undefined ? 0 : e.usage.input_tokens + e.usage.cache_creation_input_tokens + e.usage.cache_read_input_tokens
    const tokensOut = e.usage?.output_tokens ?? 0
    await update($, turn, t => ({ ...t, ms: e.durationMs, outcome: e.reason, tokensIn, tokensOut }))
    const t = await read($, turn)
    const fileCount = t.files.length
    const L = await strings($)
    const filesText = fileCount === 0 ? L.filesNone : L.filesChanged(fileCount)

    if (e.reason === 'answer') {
      await update($, live, () => ({
        mood: 'done' as MiniMood,
        bubble: L.bubbleDone(L.duration(e.durationMs), filesText),
        step: null,
      }))
      const mode = (await read($, settings)).advice
      const isQuestion = looksLikeQuestion(e.answer)
      const isWorthIt = isQuestion || t.files.length > 0 || t.errors > 0 || e.durationMs > 60_000
      const own = await read($, ownPlan)
      const needsPlan = own.goal !== null && own.steps.length === 0 && own.status === 'idle' && (t.tools >= 2 || t.files.length > 0)
      if (mode === 'auto' && needsPlan && !isQuestion) {
        void makePlan($, true)
      } else if (mode === 'auto' && isWorthIt) {
        void advise($, true)
      }
      if (isQuestion) {
        await update($, live, l => ({ ...l, mood: 'waiting' as MiniMood, bubble: L.bubbleQuestion }))
      }
      doneTimer?.cancel()
      doneTimer = $.clock.after(DONE_TO_IDLE_MS, () => void settleIdle($))
      if (e.durationMs > 60_000) $.ui.toast(L.toastFinished(L.duration(e.durationMs)))
    } else if (e.reason === 'aborted') {
      await update($, live, () => ({ mood: 'idle' as MiniMood, bubble: L.bubbleAborted, step: null }))
    } else {
      await update($, live, () => ({
        mood: 'error' as MiniMood,
        bubble: e.reason === 'refusal' ? L.bubbleRefusal : L.bubbleApiError,
        step: null,
      }))
    }
    void refreshUsage($)
    scheduleGit($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = els
    const Input = 'Input' in els ? els.Input : undefined
    const Svg = 'Svg' in els ? els.Svg : undefined
    const columns = Math.max(24, e.props.bodyColumns)

    const l = await read($, live)
    const v = await read($, view)
    const t = await read($, turn)
    const u = await read($, usage)
    const act = await read($, activity)
    const c = await read($, chat)
    const tasks = await read($, plan)
    const tst = await read($, tests)
    const adv = await read($, advice)
    const stk = await read($, stuck)
    const cfg = await read($, settings)
    const own = await read($, ownPlan)
    const ownDone = own.steps.filter(step => step.state === 'done').length

    const L = STRINGS[cfg.lang]
    const color = MOOD_COLOR[l.mood]
    const who = characterOf(v.character) ?? { id: DEFAULT_CHARACTER, name: { ru: 'Mini', en: 'Mini' } }
    const name = who.name[cfg.lang]
    const bubble = l.bubble === '' ? L.greeting(name) : l.bubble
    const isAsking = c.askingSince !== null
    const isCompact = v.isCompact ?? (e.props.placement === 'inline' || columns < 44)
    const isContextHigh = u.contextPercent !== null && u.contextPercent >= 80
    const doneTasks = tasks.filter(task => task.isDone).length

    if (isCompact) {
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          {Svg !== undefined ? (
            <Svg source={character(v.character, l.mood, 40, cfg.scheme)} alt={`${name}: ${L.mood[l.mood]}`} width={40} height={32} isInteractive={cfg.isAnimated ? true : undefined} />
          ) : (
            <Text bold color={color}>{MOOD_FACE[l.mood]}</Text>
          )}
          <Box flexDirection="column" flexShrink={1} flexGrow={1}>
            <Text bold color={color} wrap="truncate-end">{name} · {L.mood[l.mood]}{t.errors > 0 ? ` · ${L.errors(t.errors)}` : ''}</Text>
            <Text dimColor wrap="truncate-middle">{l.step ?? bubble}</Text>
          </Box>
          <Button key="expand" label={L.expand} plain dimColor onPress={() => void setCompact($, false)} />
        </Box>
      )
    }

    const statsParts = [
      L.actions(t.tools),
      ...(t.subTools > 0 ? [L.subagents(t.subTools)] : []),
      L.files(act.files.length),
      ...(t.ms !== null ? [L.duration(t.ms)] : []),
    ]
    const usageParts = [
      ...(u.usd !== null ? [`$${u.usd.toFixed(2)}`] : []),
      ...(u.contextPercent !== null ? [L.context(Math.round(u.contextPercent))] : []),
      ...(t.tokensIn + t.tokensOut > 0 ? [L.turnTokens(formatTokens(t.tokensIn), formatTokens(t.tokensOut))] : []),
      ...(u.forkTokens > 0 ? [`${name} ${formatTokens(u.forkTokens)}`] : []),
    ]
    const gitLines = act.git === null ? null : act.git.split('\n').filter(line => line !== '')
    const isClean = gitLines !== null && gitLines.every(line => line.startsWith('##'))

    const tabs: { key: MiniTab; label: string; hotkey: string }[] = [
      { key: 'chat', label: L.tabChat, hotkey: '1' },
      { key: 'work', label: `${L.tabChanges}${act.files.length > 0 ? ` ${act.files.length}` : ''}`, hotkey: '2' },
      { key: 'tests', label: `${L.tabTests}${tst.status === 'pass' ? ' ✓' : tst.status === 'fail' ? ' ✗' : tst.status === 'running' ? ' …' : ''}`, hotkey: '3' },
      { key: 'plan', label: `${L.tabPlan}${own.steps.length > 0 ? ` ${ownDone}/${own.steps.length}` : tasks.length > 0 ? ` ${doneTasks}/${tasks.length}` : ''}`, hotkey: '4' },
    ]

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} alignItems="center">
          {Svg !== undefined ? (
            <Svg key={`face-${v.character}-${l.mood}`} source={character(v.character, l.mood, 84, cfg.scheme)} alt={`${name}: ${L.mood[l.mood]}`} width={84} height={68} isInteractive={cfg.isAnimated ? true : undefined} />
          ) : (
            <Text bold color={color}>{MOOD_FACE[l.mood]}</Text>
          )}
          <Box flexDirection="column" flexShrink={1} flexGrow={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold color={color}>{name} · {L.mood[l.mood]}</Text>
              <Box flexDirection="row" gap={1}>
                <Button key="look" label={L.lookButton} plain dimColor onPress={() => void setTab($, v.tab === 'look' ? 'chat' : 'look')} />
                <Button key="compact" label={L.collapse} plain dimColor onPress={() => void setCompact($, true)} />
              </Box>
            </Box>
            <Box borderStyle="round" borderColor={color} paddingX={1}>
              <Text>{clip(bubble, columns * 2)}</Text>
            </Box>
          </Box>
        </Box>

        {stk.alert !== null && (
          <Box key="stuck" borderStyle="round" borderColor={MOOD_COLOR.error} paddingX={1} flexDirection="column" gap={1}>
            <Text bold color={MOOD_COLOR.error}>{L.stuckTitle}</Text>
            <Text>{stk.alert}</Text>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="nudge" label={L.nudgeButton} variant="primary" onPress={() => void nudgeAgent($)} />
              <Button key="stuck-hide" label={L.allFine} plain dimColor onPress={() => void dismissStuck($)} />
            </Box>
            <Text dimColor>{L.escHint}</Text>
          </Box>
        )}

        <Box flexDirection="column">
          <Text dimColor wrap="truncate-middle">{l.step ?? L.waitingTask}</Text>
          {Svg !== undefined && <Svg key="strip" source={strip(act.timeline, columns)} alt={L.stripAlt} height={20} />}
          <Text dimColor wrap="truncate-end">
            {statsParts.join(' · ')}
            {t.errors > 0 ? ' · ' : ''}
            {t.errors > 0 ? <Text color={MOOD_COLOR.error}>{L.errors(t.errors)}</Text> : ''}
          </Text>
          {usageParts.length > 0 && (
            <Text dimColor={!isContextHigh} color={isContextHigh ? MOOD_COLOR.waiting : undefined} wrap="truncate-end">
              {usageParts.join(' · ')}{isContextHigh ? L.compactHint : ''}
            </Text>
          )}
        </Box>

        {t.outcome !== null && l.mood !== 'working' && l.mood !== 'thinking' && (
          <Box key="digest" borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
            <Text bold>
              {L.digestTitle}: <Text color={t.outcome === 'answer' ? MOOD_COLOR.done : t.outcome === 'aborted' ? undefined : MOOD_COLOR.error}>{L.outcome[t.outcome]}</Text>
              {t.ms !== null ? ` · ${L.duration(t.ms)}` : ''} · {L.actions(t.tools)}
            </Text>
            {t.files.length === 0 && <Text dimColor>{L.filesUnchanged}</Text>}
            {t.files.slice(0, 5).map(path => (
              <Text key={`digest-${path}`} color={KIND_COLOR.edit} wrap="truncate-middle">✎ {path}</Text>
            ))}
            {t.files.length > 5 && <Text dimColor>{L.andMore(t.files.length - 5)}</Text>}

            {adv.status === 'thinking' && <Text color={MOOD_COLOR.thinking}>{L.adviceThinking(name)}</Text>}
            {adv.status === 'error' && <Text dimColor>{L.adviceError}</Text>}

            {adv.question !== null && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color={MOOD_COLOR.waiting}>{L.agentAsks}<Text bold={false}>{adv.question}</Text></Text>
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  {adv.replies.map((answer, i) => (
                    <Button key={`reply-${i}`} label={answer} variant={i === 0 ? 'primary' : undefined} onPress={() => void submitText($, answer)} />
                  ))}
                </Box>
              </Box>
            )}

            {adv.next.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>{L.suggestNext}</Text>
                {adv.next.map((item, i) => (
                  <Box key={`next-${i}`} flexDirection="row" gap={1} alignItems="center">
                    <Button
                      key={`next-send-${i}`}
                      label={`${ADVICE_ICON[item.kind]} ${item.label}`}
                      variant={i === 0 && adv.question === null ? 'primary' : undefined}
                      onPress={() => void submitText($, item.prompt)}
                    />
                    <Button key={`next-edit-${i}`} label="✎" plain dimColor onPress={() => void fillText($, item.prompt)} />
                  </Box>
                ))}
                {cfg.advice === 'auto' && adv.question === null && <Text dimColor>{L.firstInBox}</Text>}
              </Box>
            )}

            {adv.status !== 'thinking' && adv.next.length === 0 && adv.question === null && cfg.advice !== 'off' && t.outcome === 'answer' && (
              <Box flexDirection="row" marginTop={1}>
                <Button key="advise" label={L.whatNext} onPress={() => void advise($, false)} />
              </Box>
            )}
          </Box>
        )}

        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {tabs.map(tab => (
            <Button
              key={`tab-${tab.key}`}
              label={tab.label}
              hotkey={tab.hotkey}
              variant={v.tab === tab.key ? 'primary' : 'secondary'}
              onPress={() => void setTab($, tab.key)}
            />
          ))}
        </Box>

        {v.tab === 'chat' && (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {L.quick.map(item => (
                <Button key={`quick-${item.key}`} label={item.label} onPress={() => void ask($, item.label, item.prompt)} />
              ))}
            </Box>

            {c.messages.length === 0 && !isAsking && (
              <Box flexDirection="column">
                <Text dimColor>{L.chatEmpty}</Text>
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  {L.examples.map((example, i) => (
                    <Button key={`example-${i}`} label={example} plain dimColor onPress={() => void ask($, example, example)} />
                  ))}
                </Box>
              </Box>
            )}

            {c.messages.slice(-8).map((message, i) =>
              message.from === 'you' ? (
                <Box key={`msg-${i}`} alignSelf="flex-end" paddingX={1} borderStyle="round" borderColor={MOOD_COLOR.idle}>
                  <Text>{message.text}</Text>
                </Box>
              ) : (
                <Box key={`msg-${i}`} flexDirection="column" alignSelf="flex-start">
                  <Text dimColor>{name}</Text>
                  <Box borderStyle="round" borderDimColor paddingX={1}>
                    <Markdown text={message.text} />
                  </Box>
                </Box>
              ),
            )}

            {isAsking && (
              <Box flexDirection="row" gap={1} alignItems="center">
                <Text color={MOOD_COLOR.thinking}>{L.typing(name)}</Text>
              </Box>
            )}

            {Input !== undefined && (
              <Input
                key="ask"
                placeholder={L.askPlaceholder(name)}
                submitLabel={L.askSubmit}
                onSubmit={value => {
                  const text = value.trim()
                  if (text !== '') void ask($, text, text)
                }}
              />
            )}
            {c.messages.length > 0 && (
              <Button key="clear-chat" label={L.clearChat} plain dimColor onPress={() => void clearChat($)} />
            )}
          </Box>
        )}

        {v.tab === 'work' && (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text bold>{L.changedInSession}</Text>
              {act.files.length === 0 && <Text dimColor>{L.agentNoChanges}</Text>}
              {act.files.slice(-15).map(path => (
                <Text key={`file-${path}`} color={KIND_COLOR.edit} wrap="truncate-middle">✎ {path}</Text>
              ))}
              {act.files.length > 15 && <Text dimColor>{L.andMore(act.files.length - 15)}</Text>}
            </Box>
            <Box flexDirection="column">
              <Text bold>git status</Text>
              {gitLines === null && <Text dimColor>{L.checking}</Text>}
              {gitLines !== null && isClean && (
                <Text color={MOOD_COLOR.done}>{L.clean}{gitLines[0] !== undefined ? ` — ${gitLines[0].replace(/^## /, '')}` : ''}</Text>
              )}
              {gitLines !== null && !isClean &&
                gitLines.slice(0, 15).map((line, i) => (
                  <Text key={`git-${i}`} dimColor={line.startsWith('##')} wrap="truncate-middle">{line}</Text>
                ))}
              {gitLines !== null && gitLines.length > 15 && <Text dimColor>{L.andMore(gitLines.length - 15)}</Text>}
            </Box>
            <Box flexDirection="row" gap={1}>
              <Button key="refresh" label={L.refresh} hotkey="r" onPress={() => void runGit($)} />
              {act.files.length > 0 && <Button key="clear-files" label={L.clearList} plain dimColor onPress={() => void clearFiles($)} />}
            </Box>
          </Box>
        )}

        {v.tab === 'tests' && (
          <Box flexDirection="column" gap={1}>
            {tst.status === 'none' && <Text dimColor>{L.testsNotFound}</Text>}
            {tst.command !== null && (
              <Text dimColor>{L.commandLabel}<Text bold>{tst.command.join(' ')}</Text></Text>
            )}
            {tst.status === 'running' && <Text color={MOOD_COLOR.working}>{L.runningTests}</Text>}
            {tst.status === 'pass' && (
              <Text bold color={MOOD_COLOR.done}>{L.testsPassed(tst.ms !== null ? L.duration(tst.ms) : null)}</Text>
            )}
            {tst.status === 'fail' && (
              <Text bold color={MOOD_COLOR.error}>{L.testsFailed(tst.exitCode, tst.ms !== null ? L.duration(tst.ms) : null)}</Text>
            )}
            {tst.tail.length > 0 && (
              <Box borderStyle="round" borderDimColor paddingX={1} flexDirection="column">
                {tst.tail.slice(-12).map((line, i) => (
                  <Text key={`tail-${i}`} dimColor wrap="truncate-end">{line}</Text>
                ))}
              </Box>
            )}
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              {tst.status !== 'none' && (
                <Button key="run-tests" label={tst.status === 'running' ? L.running : L.runTests} hotkey="t" variant="primary" onPress={() => void runTests($)} />
              )}
              {tst.status === 'fail' && (
                <Button key="send-failure" label={L.sendFailure} onPress={() => void sendTestFailure($)} />
              )}
            </Box>
          </Box>
        )}

        {v.tab === 'look' && (
          <Box flexDirection="column" gap={1}>
            {Svg !== undefined && <Text bold>{L.chooseCharacter}</Text>}
            {Svg !== undefined && <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {CHARACTERS.map(c => (
                <Box
                  key={`pick-${c.id}`}
                  flexDirection="column"
                  alignItems="center"
                  paddingX={1}
                  borderStyle="round"
                  borderColor={c.id === who.id ? color : undefined}
                  borderDimColor={c.id !== who.id}
                >
                  <Svg source={portrait(c.id, 48)} alt={c.name[cfg.lang]} width={48} height={48} />
                  <Button
                    key={`pick-btn-${c.id}`}
                    label={c.name[cfg.lang]}
                    plain
                    variant={c.id === who.id ? 'primary' : undefined}
                    onPress={() => void pickCharacter($, c.id)}
                  />
                </Box>
              ))}
            </Box>}
            <Box flexDirection="column" gap={1}>
              <Text bold>{L.settingsTitle}</Text>
              <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
                <Text>{L.languageLabel}</Text>
                {(['en', 'ru'] as const).map(lang => (
                  <Button
                    key={`lang-${lang}`}
                    label={LANG_LABEL[lang]}
                    variant={cfg.lang === lang ? 'primary' : 'secondary'}
                    onPress={() => void changeSettings($, { lang })}
                  />
                ))}
              </Box>
              <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
                <Text>{L.adviceLabel}</Text>
                {(['auto', 'manual', 'off'] as const).map(mode => (
                  <Button
                    key={`mode-${mode}`}
                    label={L.adviceMode[mode]}
                    variant={cfg.advice === mode ? 'primary' : 'secondary'}
                    onPress={() => void changeSettings($, { advice: mode })}
                  />
                ))}
              </Box>
              <Box flexDirection="row" gap={1} alignItems="center">
                <Text>{L.animationLabel}</Text>
                <Button key="anim" label={cfg.isAnimated ? L.on : L.off} variant={cfg.isAnimated ? 'primary' : 'secondary'} onPress={() => void changeSettings($, { isAnimated: !cfg.isAnimated })} />
              </Box>
            </Box>
            <Text dimColor>{L.credits}</Text>
            <Button key="look-back" label={L.back} plain dimColor onPress={() => void setTab($, 'chat')} />
          </Box>
        )}

        {v.tab === 'plan' && (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column" gap={1}>
              <Text bold>{L.planFrom(name)}</Text>
              {own.goal !== null && <Text dimColor wrap="truncate-end">{L.goal}{own.goal}</Text>}
              {own.status === 'thinking' && <Text color={MOOD_COLOR.thinking}>{L.planning}</Text>}
              {own.status === 'error' && <Text dimColor>{L.planError}</Text>}
              {own.steps.length === 0 && own.status !== 'thinking' && (
                <Text dimColor>{L.planEmpty}</Text>
              )}
              {own.steps.length > 0 && Svg !== undefined && (
                <Svg
                  key="own-progress"
                  source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 8" width="200" height="8"><rect width="200" height="8" rx="4" fill="#8a8f98" opacity="0.2"/><rect width="${Math.round((200 * ownDone) / own.steps.length)}" height="8" rx="4" fill="${MOOD_COLOR.done}"/></svg>`}
                  alt={L.doneOf(ownDone, own.steps.length)}
                  width={200}
                  height={8}
                />
              )}
              {own.steps.map((step, i) => (
                <Box key={`own-${i}`} flexDirection="row" gap={1} alignItems="center">
                  <Button key={`own-toggle-${i}`} label={step.state === 'done' ? '☑' : '☐'} plain onPress={() => void toggleStep($, i)} />
                  <Box flexGrow={1} flexShrink={1}>
                    <Text dimColor={step.state === 'done'} strikethrough={step.state === 'done'} wrap="truncate-end">
                      {i + 1}. {step.title}{step.state === 'sent' ? L.sent : ''}
                    </Text>
                  </Box>
                  {step.state !== 'done' && (
                    <Button key={`own-send-${i}`} label="▶" plain variant={step.state === 'todo' && own.steps.findIndex(x => x.state === 'todo') === i ? 'primary' : undefined} onPress={() => void sendStep($, i)} />
                  )}
                </Box>
              ))}
              {own.status !== 'thinking' && (
                <Box flexDirection="row">
                  <Button key="make-plan" label={own.steps.length === 0 ? L.makePlan : L.rebuildPlan} onPress={() => void makePlan($, false)} />
                </Box>
              )}
            </Box>

            <Text bold>{L.agentTasks}</Text>
            {tasks.length === 0 && <Text dimColor>{L.agentTasksEmpty}</Text>}
            {tasks.length > 0 && (
              <Text dimColor>{L.doneOf(doneTasks, tasks.length)}</Text>
            )}
            {tasks.length > 0 && Svg !== undefined && (
              <Svg
                key="progress"
                source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 8" width="200" height="8"><rect width="200" height="8" rx="4" fill="#8a8f98" opacity="0.2"/><rect width="${Math.round((200 * doneTasks) / tasks.length)}" height="8" rx="4" fill="${MOOD_COLOR.done}"/></svg>`}
                alt={L.doneOf(doneTasks, tasks.length)}
                width={200}
                height={8}
              />
            )}
            {tasks.slice(-20).map(task => (
              <Text key={`task-${task.id}`} dimColor={task.isDone} strikethrough={task.isDone} wrap="truncate-end">
                {task.isDone ? '☑' : '☐'} {task.subject}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
