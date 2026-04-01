import { createCharacterProfile } from '../../../packages/character-profile/src/profile'
import { OpenClawGatewayWebSocketTransport } from '../../../packages/openclaw-adapter/src/websocket-transport'
import { createBuiltinCharacterEntry } from '../../desktop-electron/src/renderer/builtin-character'

import { HeadlessDemo } from './headless-demo'

export interface HeadlessDemoCliArgs {
  url: string
  token?: string
  password?: string
  sessionKey: string
  runId: string
  message: string
}

export function parseHeadlessDemoCliArgs(args: string[]): HeadlessDemoCliArgs {
  const values = [...args]
  let url = 'ws://127.0.0.1:18789'
  let token: string | undefined
  let password: string | undefined
  let sessionKey = 'main'
  let runId = `run-${crypto.randomUUID()}`
  const messageParts: string[] = []

  while (values.length > 0) {
    const current = values.shift()
    if (!current) {
      break
    }

    if (current === '--url') {
      url = values.shift() ?? url
      continue
    }

    if (current === '--token') {
      token = values.shift()
      continue
    }

    if (current === '--password') {
      password = values.shift()
      continue
    }

    if (current === '--session-key') {
      sessionKey = values.shift() ?? sessionKey
      continue
    }

    if (current === '--run-id') {
      runId = values.shift() ?? runId
      continue
    }

    messageParts.push(current)
  }

  const message = messageParts.join(' ').trim()
  if (!message) {
    throw new Error('Headless demo message is required')
  }

  return {
    url,
    token,
    password,
    sessionKey,
    runId,
    message,
  }
}

export function createDefaultDemoProfile() {
  const entry = createBuiltinCharacterEntry()

  return createCharacterProfile({
    id: entry.profile.id,
    displayName: entry.profile.displayName,
    renderer: entry.profile.renderer,
    voice: entry.profile.voice,
    emotionMotionMap: entry.profile.emotionMotionMap,
  })
}

export async function runHeadlessDemoCli(
  args: string[],
  logger: { info(message: string): void, error(message: string): void } = console,
) {
  const parsed = parseHeadlessDemoCliArgs(args)
  const transport = new OpenClawGatewayWebSocketTransport({
    url: parsed.url,
    token: parsed.token,
    password: parsed.password,
  })
  const demo = new HeadlessDemo({
    transport,
    profile: createDefaultDemoProfile(),
    logger,
  })

  await demo.start()

  try {
    await demo.sendMessageAndWait({
      sessionKey: parsed.sessionKey,
      runId: parsed.runId,
      message: parsed.message,
    })
  } finally {
    demo.stop()
  }
}
