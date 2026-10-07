# Mini — Code Assistant

Mini is a companion pane for **Claude Code**. A small animated robot sits beside the conversation, follows what the agent is doing, and helps you steer it: it suggests the next step after each turn, offers one-click answers when the agent asks you something, notices when the agent goes in circles, sketches a plan for the task in each chat, and runs your project's tests on demand.

The interface is available in **English and Russian** (switch it under *Character & settings*).

> Mini is a Claude Code plugin built on mods (function hooks). It draws a pane in Claude Code — the desktop app's Code tab and the terminal. It does nothing in claude.ai chat or Cowork.

## Features

- **Live companion.** 20 robot characters (DiceBear "Bottts") with six moods: standing by, thinking, working, needs you, done, trouble. Pick yours under *Character & settings*.
- **"Needs you" alerts.** When the agent waits for a permission or for your reply, Mini turns yellow, says what it is waiting for, and shows a notification.
- **Turn summary.** After each turn: outcome, duration, number of actions, files changed, tokens.
- **What's next.** After a turn where something happened (files changed, a failed action, a long turn, or a question), Mini suggests 2–3 next steps as buttons — check, commit, continue, careful. The best one is offered as a dim suggestion in the prompt box (press Tab to take it). Modes: *auto*, *on demand*, *off*.
- **Quick replies.** If the agent ends a turn with a question, Mini shows buttons with likely answers.
- **Loop detector.** If the same action fails 3 times in a row, or one file is edited 6 times in a turn, Mini warns you and offers to nudge the agent to change its approach.
- **Plan per chat.** After the first substantial turn, Mini sketches a 3–7 step plan for your task. Send any step to the agent with one click, tick steps off, or rebuild the plan.
- **Chat with Mini.** Ask questions about the session on the side — "Explain the changes", "Find risks", "Commit message" — without interrupting the agent.
- **Changes, tests, usage.** Files changed this session and `git status`; one-click test runs with pass/fail and the end of the output; session cost and context usage, with a hint to `/compact` above 80%.

## Install

From the Claude plugin directory, once listed: add **Mini — Code Assistant** and open a new Claude Code session.

Manually: put this folder at `~/.claude/skills/mini-code-assistant` (Claude Code loads plugins from that folder in every session), then start a new session. The pane opens by itself; `/mini` opens it again if you close it.

## What Mini runs, reads and sends

Mini has no server of its own and makes no network requests of its own. Everything below happens inside your Claude Code session:

- **Model requests through your own Claude session.** The chat, the "what's next" suggestions and the plan each make one request to the session's model over the current conversation (the same provider and account Claude Code already uses). Automatic suggestions run at most once per turn and only after turns where something happened; switch them to *on demand* or *off* in settings. The tokens Mini spends are shown in the pane.
- **Local commands.** `git --no-optional-locks status --short --branch` in the session's folder (at most once per second while you work, and every 15 seconds). Your project's test command only when you press *Run tests*: detected from `package.json` (`npm`/`pnpm`/`yarn`/`bun test`), `Cargo.toml`, `go.mod`, `pytest.ini`/`pyproject.toml` or a `Makefile` `test:` target.
- **Local files read.** `package.json`, lockfile names and `Makefile` in the project folder, only to find the test command. Mini never writes to your project.
- **Messages to the agent — only when you press a button.** A suggestion, a quick reply, a plan step, a test failure or a "change approach" nudge is sent as your next prompt; a nudge during a running turn is added to the conversation for the agent to read. Automatic suggestions are only shown in the prompt box and are never sent by themselves.
- **Local storage.** The last 20 chat messages, your character and your settings are kept in Claude Code's plugin store on your machine.
- **Settings read.** Claude Code's `theme` and `language` settings and the `LANG`/`LC_ALL` environment variables, to match the colour scheme and pick the default language.

## Settings

Open *Character & settings* in the pane header:

- **Language:** English or Русский.
- **"What's next" suggestions:** auto, on demand, off.
- **Character animation:** on or off (off draws the character as a still image).

## Credits

Character artwork: [DiceBear](https://www.dicebear.com/) "Bottts" style, design by [Pablo Stanley](https://bottts.com/), free for personal and commercial use. See [NOTICE](NOTICE). To regenerate the characters: `cd tools && npm install && npm run characters`.

## License

[MIT](LICENSE) for the plugin's code. The character artwork is covered by its own terms, see [NOTICE](NOTICE).

---

## По-русски

Mini — помощник-панель для **Claude Code**. Анимированный робот рядом с диалогом следит за агентом и помогает им управлять: после каждого хода предлагает, что делать дальше, даёт кнопки быстрых ответов на вопросы агента, замечает, когда агент ходит по кругу, в каждом чате составляет план работы и по кнопке запускает тесты проекта. Интерфейс на русском и английском — язык переключается в «Персонаж и настройки».

Mini работает только в Claude Code (вкладка Code в приложении и терминал). Собственного сервера и собственных сетевых запросов у него нет: вопросы к модели идут через вашу же сессию Claude Code, локально он запускает только `git status` и, по кнопке, команду тестов, а агенту что-то отправляет только по нажатию кнопки. Подробности — в разделе «What Mini runs, reads and sends» выше.
