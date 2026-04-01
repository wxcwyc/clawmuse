import { describe, expect, it, vi } from 'vitest'

import { createDesktopRendererModel } from './app-model'

describe('desktop-electron renderer model', () => {
  it('collects connection fields and starts a session through the injected factory', async () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }
    const createSession = vi.fn(() => session)

    const model = createDesktopRendererModel({ createSession })

    model.setConnectionField('url', 'ws://127.0.0.1:6121/ws')
    model.setConnectionField('token', 'gateway-token')
    model.setConnectionField('sessionKey', 'main')

    await model.connect()

    expect(createSession).toHaveBeenCalledWith({
      url: 'ws://127.0.0.1:6121/ws',
      token: 'gateway-token',
      password: '',
      sessionKey: 'main',
      onEvent: expect.any(Function),
    })
    expect(session.start).toHaveBeenCalledTimes(1)
    expect(model.state.logs).toContain('[session] connected')
  })

  it('normalizes an OpenClaw chat page URL into a websocket gateway URL before connecting', async () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }
    const createSession = vi.fn(() => session)

    const model = createDesktopRendererModel({ createSession })
    model.setConnectionField('url', 'http://127.0.0.1:18789/A123456_s/chat?session=main')

    await model.connect()

    expect(createSession).toHaveBeenCalledWith({
      url: 'ws://127.0.0.1:18789/A123456_s',
      token: '',
      password: '',
      sessionKey: 'main',
      onEvent: expect.any(Function),
    })
    expect(model.state.connection.url).toBe('ws://127.0.0.1:18789/A123456_s')
    expect(model.state.logs).toContain(
      '[session] normalized gateway URL: http://127.0.0.1:18789/A123456_s/chat?session=main -> ws://127.0.0.1:18789/A123456_s',
    )
  })

  it('records connect failure reasons and recreates session on retry', async () => {
    const session = {
      start: vi
        .fn()
        .mockRejectedValueOnce(new Error('gateway closed (1006): closed'))
        .mockResolvedValueOnce(undefined),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }
    const createSession = vi.fn(() => session)

    const model = createDesktopRendererModel({ createSession })

    await expect(model.connect()).rejects.toThrow('gateway closed (1006): closed')
    expect(model.state.logs).toContain('[session] connect failed: gateway closed (1006): closed')

    await model.connect()

    expect(createSession).toHaveBeenCalledTimes(2)
    expect(session.stop).toHaveBeenCalledTimes(1)
    expect(model.state.logs).toContain('[session] connected')
  })

  it('sends a message, renders subtitle text, renders log text, and marks the stage as mounted', async () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }

    const model = createDesktopRendererModel({
      createSession: () => session,
    })

    await model.connect()
    model.mountStage()
    model.setDraftMessage('Hello there')

    await model.sendMessage({
      runId: 'run-1',
    })

    model.handleRuntimeEvent({
      type: 'assistant.segment',
      sessionKey: 'main',
      runId: 'run-1',
      segmentId: 'run-1:1',
      text: 'Hello there.',
      finalInSentence: true,
      ts: 100,
    })

    expect(session.sendUserMessage).toHaveBeenCalledWith({
      sessionKey: 'main',
      runId: 'run-1',
      message: 'Hello there',
    })
    expect(model.state.stageMounted).toBe(true)
    expect(model.state.subtitles).toEqual(['Hello there.'])
    expect(model.state.logs).toContain('[user] Hello there')
    expect(model.state.logs).toContain('[subtitle] Hello there.')
  })

  it('records send failure reasons when gateway rejects chat.send', async () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => {
        throw new Error('chat.send rejected: unauthorized')
      }),
    }

    const model = createDesktopRendererModel({
      createSession: () => session,
    })

    await model.connect()
    model.setDraftMessage('Hello there')

    await expect(model.sendMessage({
      runId: 'run-2',
    })).rejects.toThrow('chat.send rejected: unauthorized')

    expect(model.state.logs).toContain('[session] send failed: chat.send rejected: unauthorized')
  })

  it('records adapter/runtime error events in logs', () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }

    const model = createDesktopRendererModel({
      createSession: () => session,
    })

    model.handleRuntimeEvent({
      type: 'assistant.error',
      sessionKey: 'main',
      runId: 'run-3',
      error: 'OpenClaw chat run failed',
      recoverable: true,
      ts: 100,
    })

    expect(model.state.logs).toContain('[assistant:error] OpenClaw chat run failed')
  })

  it('does not duplicate subtitle lines when completed is followed by a segmented flush', () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }

    const model = createDesktopRendererModel({
      createSession: () => session,
    })

    model.handleRuntimeEvent({
      type: 'assistant.completed',
      sessionKey: 'main',
      runId: 'run-dup-1',
      finalText: '你好，我这边已经回了。',
      ts: 100,
    })

    model.handleRuntimeEvent({
      type: 'assistant.segment',
      sessionKey: 'main',
      runId: 'run-dup-1',
      segmentId: 'run-dup-1:1',
      text: '你好，我这边已经回了。',
      finalInSentence: true,
      ts: 101,
    })

    expect(model.state.subtitles).toEqual(['你好，我这边已经回了。'])
  })

  it('ignores duplicate assistant.completed events from the same run', () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }

    const model = createDesktopRendererModel({
      createSession: () => session,
    })

    model.handleRuntimeEvent({
      type: 'assistant.completed',
      sessionKey: 'main',
      runId: 'run-dup-2',
      finalText: 'done',
      ts: 100,
    })
    model.handleRuntimeEvent({
      type: 'assistant.completed',
      sessionKey: 'main',
      runId: 'run-dup-2',
      finalText: 'done',
      ts: 101,
    })

    const duplicateLogs = model.state.logs.filter(line => line.includes('duplicate completion ignored'))
    expect(duplicateLogs).toHaveLength(1)
  })

  it('ignores assistant.segment events that arrive after run completion', () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }

    const model = createDesktopRendererModel({
      createSession: () => session,
    })

    model.handleRuntimeEvent({
      type: 'assistant.completed',
      sessionKey: 'main',
      runId: 'run-order-1',
      finalText: 'final',
      ts: 100,
    })

    model.handleRuntimeEvent({
      type: 'assistant.segment',
      sessionKey: 'main',
      runId: 'run-order-1',
      segmentId: 'run-order-1:1',
      text: 'final',
      finalInSentence: true,
      ts: 101,
    })

    expect(model.state.subtitles).toEqual(['final'])
    expect(model.state.logs).toContain('[subtitle] ignored segment after completion (run=run-order-1, segment=run-order-1:1)')
  })

  it('ignores duplicate segment ids from repeated events', () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }

    const model = createDesktopRendererModel({
      createSession: () => session,
    })

    const duplicateSegmentEvent = {
      type: 'assistant.segment' as const,
      sessionKey: 'main',
      runId: 'run-seg-dup-1',
      segmentId: 'run-seg-dup-1:3',
      text: '同一分片',
      finalInSentence: true,
      ts: 100,
    }

    model.handleRuntimeEvent(duplicateSegmentEvent)
    model.handleRuntimeEvent(duplicateSegmentEvent)

    expect(model.state.subtitles).toEqual(['同一分片'])
    expect(model.state.logs).toContain('[subtitle] ignored duplicate segment (run=run-seg-dup-1, segment=run-seg-dup-1:3)')
  })

  it('records stage preflight warnings when required live2d runtime inputs are missing', async () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }
    const inspectStage = vi.fn(async () => [
      '[stage] missing Live2D Cubism Core at /live2d-core/live2dcubismcore.min.js',
      '[stage] missing Live2D model asset at /live2d/builtin-hiyori/Hiyori.model3.json',
    ])

    const model = createDesktopRendererModel({
      createSession: () => session,
      inspectStage,
    })

    await model.mountStage({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
    })

    expect(model.state.stageMounted).toBe(true)
    expect(model.state.stageWarnings).toEqual([
      '[stage] missing Live2D Cubism Core at /live2d-core/live2dcubismcore.min.js',
      '[stage] missing Live2D model asset at /live2d/builtin-hiyori/Hiyori.model3.json',
    ])
    expect(model.state.logs).toContain('[stage] missing Live2D Cubism Core at /live2d-core/live2dcubismcore.min.js')
    expect(model.state.logs).toContain('[stage] missing Live2D model asset at /live2d/builtin-hiyori/Hiyori.model3.json')
  })

  it('can refresh stage warnings and clear them after assets become available', async () => {
    const session = {
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      sendUserMessage: vi.fn(async () => []),
    }
    const inspectStage = vi
      .fn()
      .mockResolvedValueOnce([
        '[stage] missing Live2D Cubism Core at /live2d-core/live2dcubismcore.min.js',
      ])
      .mockResolvedValueOnce([])

    const model = createDesktopRendererModel({
      createSession: () => session,
      inspectStage,
    })

    await model.mountStage({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
    })

    expect(model.state.stageWarnings).toEqual([
      '[stage] missing Live2D Cubism Core at /live2d-core/live2dcubismcore.min.js',
    ])

    await model.refreshStageWarnings({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
    })

    expect(model.state.stageWarnings).toEqual([])
  })
})
