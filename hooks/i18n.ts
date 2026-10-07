import type { MiniAdviceMode, MiniKind, MiniLang, MiniMood, MiniOutcome } from '../types'

const ruPlural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

  return many
}

const enPlural = (n: number, one: string, many: string) => (n === 1 ? one : many)

const splitMs = (ms: number) => {
  const seconds = Math.round(ms / 1000)

  return { seconds, minutes: Math.floor(seconds / 60), rest: seconds % 60 }
}

const ADVICE_JSON = `{"question": "...", "replies": ["..."], "next": [{"kind": "check|commit|continue|careful|other", "label": "...", "prompt": "..."}]}`
const PLAN_JSON = `{"steps": [{"title": "...", "prompt": "...", "done": false}]}`

const ru = {
  kind: { read: 'чтение', edit: 'правки', run: 'команды', web: 'веб', agent: 'агенты', other: 'прочее' } as Record<MiniKind, string>,
  mood: {
    idle: 'на связи', thinking: 'думает', working: 'работает', waiting: 'ждёт тебя', done: 'готово', error: 'проблема',
  } as Record<MiniMood, string>,
  outcome: { answer: 'готово', aborted: 'прервано', refusal: 'отказ', error: 'ошибка' } as Record<MiniOutcome, string>,
  adviceMode: { auto: 'сам', manual: 'по кнопке', off: 'выкл' } as Record<MiniAdviceMode, string>,
  quick: [
    { key: 'explain', label: 'Объясни изменения', prompt: 'Объясни простыми словами, что агент изменил в коде за эту сессию и зачем. 3-6 пунктов.' },
    { key: 'risks', label: 'Найди риски', prompt: 'Посмотри на изменения этой сессии критично: что может сломаться, что не проверено, что забыли? До 5 пунктов, самое важное первым.' },
    { key: 'commit', label: 'Текст коммита', prompt: 'Напиши сообщение коммита для изменений этой сессии: заголовок до 60 символов и 2-4 строки тела. Только сам текст в блоке кода.' },
  ],
  examples: ['Как устроен этот проект?', 'Где лучше начать рефакторинг?'],
  actions: (n: number) => `${n} ${ruPlural(n, 'действие', 'действия', 'действий')}`,
  files: (n: number) => `${n} ${ruPlural(n, 'файл', 'файла', 'файлов')}`,
  duration: (ms: number) => {
    const { seconds, minutes, rest } = splitMs(ms)

    return seconds < 60 ? `${seconds} с` : `${minutes} мин ${rest} с`
  },

  greeting: (name: string) => `Привет! Я ${name}. Слежу за агентом, отвечаю на вопросы и позову, когда понадобишься.`,
  commandDescription: 'Открыть панель Mini — помощника по коду',
  commandOpened: 'Панель Mini открыта.',
  notGitRepo: 'не git-репозиторий',
  gitUnavailable: 'git недоступен',
  nowI: (name: string) => `Теперь я ${name}!`,
  stillAnswering: 'Ещё отвечаю на прошлый вопрос',
  askPrompt: (name: string, question: string) =>
    `Ты ${name}, дружелюбный помощник рядом с агентом в этой сессии. Отвечай кратко и по делу, по-русски. Вопрос: ${question}`,
  nothingToFork: 'Пока не о чем говорить: агент ещё ни разу не ответил. Дай ему задачу, и я подключусь.',
  askFailedWith: (reason: string) => `Не получилось ответить (${reason}). Попробуй ещё раз.`,
  askFailed: 'Не получилось ответить. Попробуй ещё раз.',
  testsPassedToast: 'Тесты прошли ✓',
  testsFailedToast: 'Тесты упали ✗',
  testsDidNotRun: 'Команда не запустилась или не уложилась в 10 минут.',
  testFailurePrompt: (command: string, code: string, tail: string) =>
    `Тесты упали (\`${command}\`, код ${code}). Конец вывода:\n\n\`\`\`\n${tail}\n\`\`\`\n\nРазберись и почини.`,
  sentTestFailure: 'Отправил ошибку тестов агенту',
  sendFailed: 'Не удалось отправить',
  fillFailed: 'Не удалось вставить в поле ввода',
  advicePrompt: (name: string) => `Ты ${name}, помощник разработчика рядом с агентом. Посмотри на последний ответ агента и на всю сессию.
Верни ТОЛЬКО JSON, без пояснений и без блока кода, в такой форме:
${ADVICE_JSON}
question — вопрос, который агент задал пользователю в последнем ответе, или null; replies — до 4 коротких вариантов ответа на него (пустой массив, если вопроса нет).
В next дай 2-3 самых полезных следующих шага именно для этой ситуации: check — проверить (тесты, запуск), commit — зафиксировать, continue — продолжить задачу, careful — заметный риск или упущение, other — прочее. label — текст кнопки до 40 символов, prompt — полный текст запроса агенту. Пиши по-русски.`,
  planPrompt: (name: string, goal: string) => `Ты ${name}, помощник разработчика рядом с агентом. Цель пользователя в этом чате: «${goal}».
Составь план работы над этой целью с учётом того, что уже сделано в сессии.
Верни ТОЛЬКО JSON, без пояснений и без блока кода, в такой форме:
${PLAN_JSON}
3-7 шагов по порядку: title — шаг до 60 символов, prompt — полный текст запроса агенту для этого шага, done — true, если шаг уже выполнен в этой сессии. Пиши по-русски.`,
  planGoalFallback: 'то, над чем мы работаем в этой сессии',
  planReady: (n: number) => `Я набросал план из ${n} ${ruPlural(n, 'шага', 'шагов', 'шагов')} — он во вкладке «План».`,
  nudgeText: (alert: string) =>
    `Похоже, ты ходишь по кругу: ${alert}. Остановись, коротко опиши, что именно не получается и почему, и предложи другой подход, прежде чем продолжать.`,
  nudgeFailed: 'Не получилось подсказать',
  nudgedLive: 'Подсказал агенту прямо в ходе',
  nudgeSent: 'Отправил подсказку агенту',
  stuckBubble: (alert: string) => `Кажется, агент застрял: ${alert}`,
  stuckToast: (alert: string) => `Агент, похоже, зациклился — ${alert}`,
  stuckFails: (what: string, n: number) => `«${what}» падает ${n} раза подряд`,
  stuckEdits: (path: string, n: number) => `файл ${path} правится уже ${n} раз за ход`,
  bubbleThinking: 'Думаю над задачей…',
  stepThinking: 'думает…',
  bubbleNow: (kind: string) => `Сейчас: ${kind}`,
  bubbleFailed: (what: string) => `Не вышло: ${what}. Агент обычно разбирается сам.`,
  bubbleDenied: 'Действие отклонено.',
  bubbleThanks: 'Спасибо, продолжаю.',
  permissionBubble: (what: string) => `Нужно твоё разрешение: ${what}`,
  permissionToast: (what: string) => `Агент ждёт разрешения — ${what}`,
  idleBubble: 'Агент ждёт твоего ответа.',
  filesNone: 'файлы не менял',
  filesChanged: (n: number) => `${n} ${ruPlural(n, 'файл изменён', 'файла изменено', 'файлов изменено')}`,
  bubbleDone: (time: string, files: string) => `Готово за ${time}, ${files}.`,
  bubbleQuestion: 'Агент задал тебе вопрос.',
  toastFinished: (time: string) => `Агент закончил (${time})`,
  bubbleAborted: 'Ход прерван. Жду новую задачу.',
  bubbleRefusal: 'Модель отказалась выполнять запрос.',
  bubbleApiError: 'Ход закончился ошибкой API.',

  errors: (n: number) => `ошибок ${n}`,
  expand: 'Развернуть',
  collapse: 'Свернуть',
  lookButton: 'Персонаж и настройки',
  subagents: (n: number) => `субагенты ${n}`,
  context: (p: number) => `контекст ${p}%`,
  turnTokens: (a: string, b: string) => `ход ${a}→${b}`,
  compactHint: ' — пора /compact',
  tabChat: 'Чат',
  tabChanges: 'Изменения',
  tabTests: 'Тесты',
  tabPlan: 'План',
  stuckTitle: '⟳ Похоже, агент ходит по кругу',
  nudgeButton: 'Подсказать сменить подход',
  allFine: 'Всё нормально',
  escHint: 'Чтобы остановить агента сразу, нажми Esc.',
  waitingTask: 'Ждёт задачи',
  stripAlt: 'Лента последних действий агента',
  digestTitle: 'Итог хода',
  filesUnchanged: 'Файлы не менялись.',
  andMore: (n: number) => `…и ещё ${n}`,
  adviceThinking: (name: string) => `${name} думает, что делать дальше…`,
  adviceError: 'Не получилось придумать совет.',
  agentAsks: 'Агент спрашивает: ',
  suggestNext: 'Предлагаю дальше',
  firstInBox: 'Первый вариант уже в поле ввода — Tab, чтобы взять.',
  whatNext: '💡 Что дальше?',
  chatEmpty: 'Спроси что угодно о проекте — я отвечаю в сторонке и не мешаю агенту. Например:',
  typing: (name: string) => `${name} печатает…`,
  askPlaceholder: (name: string) => `Спроси ${name}…`,
  askSubmit: 'Спросить',
  clearChat: 'Очистить чат',
  changedInSession: 'Изменено за сессию',
  agentNoChanges: 'Агент пока ничего не менял.',
  checking: 'Проверяю…',
  clean: '✓ Чисто',
  refresh: 'Обновить',
  clearList: 'Очистить список',
  testsNotFound: 'Не нашёл команду тестов (package.json, Cargo.toml, go.mod, pytest, Makefile).',
  commandLabel: 'Команда: ',
  runningTests: 'Запускаю тесты…',
  testsPassed: (time: string | null) => `✓ Тесты прошли${time !== null ? ` за ${time}` : ''}`,
  testsFailed: (code: number | null, time: string | null) =>
    `✗ Тесты упали${code !== null ? ` (код ${code})` : ''}${time !== null ? ` за ${time}` : ''}`,
  running: 'Идёт…',
  runTests: 'Запустить тесты',
  sendFailure: 'Отправить ошибку агенту',
  chooseCharacter: 'Выбери персонажа',
  settingsTitle: 'Настройки',
  languageLabel: 'Язык:',
  adviceLabel: 'Советы «что дальше»:',
  animationLabel: 'Анимация персонажа:',
  on: 'вкл',
  off: 'выкл',
  credits: 'Персонажи: DiceBear «Bottts», дизайн Pablo Stanley (bottts.com), бесплатно для личного и коммерческого использования.',
  back: 'Назад',
  planFrom: (name: string) => `План от ${name}`,
  goal: 'Цель: ',
  planning: 'Составляю план…',
  planError: 'Не получилось составить план, попробуй ещё раз.',
  planEmpty: 'Опиши задачу агенту — после первого хода я сам предложу план. Или составлю его сейчас.',
  sent: ' · отправлен',
  makePlan: '🗺 Составить план',
  rebuildPlan: '↻ Пересобрать план',
  agentTasks: 'Задачи агента',
  agentTasksEmpty: 'Когда агент заведёт список задач, он появится здесь с галочками.',
  doneOf: (a: number, b: number) => `Выполнено ${a} из ${b}`,
}

export type Strings = typeof ru

const en: Strings = {
  kind: { read: 'reading', edit: 'edits', run: 'commands', web: 'web', agent: 'agents', other: 'other' },
  mood: { idle: 'standing by', thinking: 'thinking', working: 'working', waiting: 'needs you', done: 'done', error: 'trouble' },
  outcome: { answer: 'done', aborted: 'interrupted', refusal: 'refused', error: 'error' },
  adviceMode: { auto: 'auto', manual: 'on demand', off: 'off' },
  quick: [
    { key: 'explain', label: 'Explain the changes', prompt: 'Explain in plain words what the agent changed in the code this session and why. 3-6 bullet points.' },
    { key: 'risks', label: 'Find risks', prompt: "Look at this session's changes critically: what could break, what is untested, what was forgotten? Up to 5 points, most important first." },
    { key: 'commit', label: 'Commit message', prompt: "Write a commit message for this session's changes: a subject up to 60 characters and 2-4 body lines. Only the text, in a code block." },
  ],
  examples: ['How is this project structured?', 'Where should refactoring start?'],
  actions: (n: number) => `${n} ${enPlural(n, 'action', 'actions')}`,
  files: (n: number) => `${n} ${enPlural(n, 'file', 'files')}`,
  duration: (ms: number) => {
    const { seconds, minutes, rest } = splitMs(ms)

    return seconds < 60 ? `${seconds}s` : `${minutes}m ${rest}s`
  },

  greeting: (name: string) => `Hi! I'm ${name}. I watch the agent, answer questions and call you when you're needed.`,
  commandDescription: 'Open the Mini pane, your code assistant',
  commandOpened: 'Mini pane opened.',
  notGitRepo: 'not a git repository',
  gitUnavailable: 'git is not available',
  nowI: (name: string) => `I'm ${name} now!`,
  stillAnswering: 'Still answering the previous question',
  askPrompt: (name: string, question: string) =>
    `You are ${name}, a friendly assistant beside the agent in this session. Answer briefly and to the point, in English. Question: ${question}`,
  nothingToFork: 'Nothing to talk about yet: the agent has not answered once. Give it a task and I will join in.',
  askFailedWith: (reason: string) => `Could not answer (${reason}). Try again.`,
  askFailed: 'Could not answer. Try again.',
  testsPassedToast: 'Tests passed ✓',
  testsFailedToast: 'Tests failed ✗',
  testsDidNotRun: 'The command did not start or did not finish within 10 minutes.',
  testFailurePrompt: (command: string, code: string, tail: string) =>
    `Tests failed (\`${command}\`, exit code ${code}). End of the output:\n\n\`\`\`\n${tail}\n\`\`\`\n\nFind the cause and fix it.`,
  sentTestFailure: 'Sent the test failure to the agent',
  sendFailed: 'Could not send',
  fillFailed: 'Could not put it in the prompt box',
  advicePrompt: (name: string) => `You are ${name}, a developer's assistant beside the agent. Look at the agent's last answer and the whole session.
Return ONLY JSON, no explanations and no code block, in this shape:
${ADVICE_JSON}
question: the question the agent asked the user in its last answer, or null; replies: up to 4 short answers to it (an empty array if there is no question).
In next give the 2-3 most useful next steps for this exact situation: check — verify (tests, a run), commit — record the work, continue — carry on with the task, careful — a notable risk or omission, other — anything else. label is the button text, up to 40 characters; prompt is the full request to the agent. Write in English.`,
  planPrompt: (name: string, goal: string) => `You are ${name}, a developer's assistant beside the agent. The user's goal in this chat: "${goal}".
Make a work plan for this goal, taking into account what has already been done in the session.
Return ONLY JSON, no explanations and no code block, in this shape:
${PLAN_JSON}
3-7 steps in order: title is the step, up to 60 characters; prompt is the full request to the agent for that step; done is true if the step is already done in this session. Write in English.`,
  planGoalFallback: 'what we are working on in this session',
  planReady: (n: number) => `I sketched a ${n}-step plan — it's in the Plan tab.`,
  nudgeText: (alert: string) =>
    `You seem to be going in circles: ${alert}. Stop, briefly describe what exactly is not working and why, and propose a different approach before you continue.`,
  nudgeFailed: 'Could not nudge the agent',
  nudgedLive: 'Nudged the agent mid-turn',
  nudgeSent: 'Sent the nudge to the agent',
  stuckBubble: (alert: string) => `The agent looks stuck: ${alert}`,
  stuckToast: (alert: string) => `The agent seems to be looping — ${alert}`,
  stuckFails: (what: string, n: number) => `"${what}" failed ${n} times in a row`,
  stuckEdits: (path: string, n: number) => `${path} edited ${n} times this turn`,
  bubbleThinking: 'Thinking about the task…',
  stepThinking: 'thinking…',
  bubbleNow: (kind: string) => `Now: ${kind}`,
  bubbleFailed: (what: string) => `That failed: ${what}. The agent usually sorts it out.`,
  bubbleDenied: 'Action declined.',
  bubbleThanks: 'Thanks, carrying on.',
  permissionBubble: (what: string) => `Your permission is needed: ${what}`,
  permissionToast: (what: string) => `The agent is waiting for permission — ${what}`,
  idleBubble: 'The agent is waiting for your reply.',
  filesNone: 'no files changed',
  filesChanged: (n: number) => `${n} ${enPlural(n, 'file', 'files')} changed`,
  bubbleDone: (time: string, files: string) => `Done in ${time}, ${files}.`,
  bubbleQuestion: 'The agent asked you a question.',
  toastFinished: (time: string) => `The agent finished (${time})`,
  bubbleAborted: 'Turn interrupted. Waiting for a new task.',
  bubbleRefusal: 'The model declined the request.',
  bubbleApiError: 'The turn ended with an API error.',

  errors: (n: number) => `${n} ${enPlural(n, 'error', 'errors')}`,
  expand: 'Expand',
  collapse: 'Collapse',
  lookButton: 'Character & settings',
  subagents: (n: number) => `subagents ${n}`,
  context: (p: number) => `context ${p}%`,
  turnTokens: (a: string, b: string) => `turn ${a}→${b}`,
  compactHint: ' — time to /compact',
  tabChat: 'Chat',
  tabChanges: 'Changes',
  tabTests: 'Tests',
  tabPlan: 'Plan',
  stuckTitle: '⟳ The agent seems to be going in circles',
  nudgeButton: 'Nudge it to change approach',
  allFine: "It's fine",
  escHint: 'To stop the agent right away, press Esc.',
  waitingTask: 'Waiting for a task',
  stripAlt: "The agent's latest actions",
  digestTitle: 'Turn summary',
  filesUnchanged: 'No files changed.',
  andMore: (n: number) => `…and ${n} more`,
  adviceThinking: (name: string) => `${name} is thinking about what's next…`,
  adviceError: 'Could not come up with a suggestion.',
  agentAsks: 'The agent asks: ',
  suggestNext: 'Suggested next',
  firstInBox: 'The first one is already in the prompt box — press Tab to take it.',
  whatNext: "💡 What's next?",
  chatEmpty: "Ask anything about the project — I answer on the side and don't disturb the agent. For example:",
  typing: (name: string) => `${name} is typing…`,
  askPlaceholder: (name: string) => `Ask ${name}…`,
  askSubmit: 'Ask',
  clearChat: 'Clear chat',
  changedInSession: 'Changed this session',
  agentNoChanges: 'The agent has not changed anything yet.',
  checking: 'Checking…',
  clean: '✓ Clean',
  refresh: 'Refresh',
  clearList: 'Clear list',
  testsNotFound: 'No test command found (package.json, Cargo.toml, go.mod, pytest, Makefile).',
  commandLabel: 'Command: ',
  runningTests: 'Running tests…',
  testsPassed: (time: string | null) => `✓ Tests passed${time !== null ? ` in ${time}` : ''}`,
  testsFailed: (code: number | null, time: string | null) =>
    `✗ Tests failed${code !== null ? ` (exit code ${code})` : ''}${time !== null ? ` in ${time}` : ''}`,
  running: 'Running…',
  runTests: 'Run tests',
  sendFailure: 'Send the failure to the agent',
  chooseCharacter: 'Choose a character',
  settingsTitle: 'Settings',
  languageLabel: 'Language:',
  adviceLabel: '"What\'s next" suggestions:',
  animationLabel: 'Character animation:',
  on: 'on',
  off: 'off',
  credits: 'Characters: DiceBear "Bottts", design by Pablo Stanley (bottts.com), free for personal and commercial use.',
  back: 'Back',
  planFrom: (name: string) => `${name}'s plan`,
  goal: 'Goal: ',
  planning: 'Making a plan…',
  planError: 'Could not make a plan, try again.',
  planEmpty: "Describe a task to the agent — after the first turn I'll suggest a plan myself. Or I can make one now.",
  sent: ' · sent',
  makePlan: '🗺 Make a plan',
  rebuildPlan: '↻ Rebuild the plan',
  agentTasks: "Agent's tasks",
  agentTasksEmpty: "When the agent creates a task list, it shows up here with checkboxes.",
  doneOf: (a: number, b: number) => `${a} of ${b} done`,
}

export const STRINGS: Record<MiniLang, Strings> = { ru, en }

export const LANG_LABEL: Record<MiniLang, string> = { ru: 'Русский', en: 'English' }
