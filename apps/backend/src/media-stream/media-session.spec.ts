import { MediaSession, type MediaSessionDeps } from "./media-session";

const WORKSPACE_ID = "workspace-1";
const CALL_ID = "call-1";

async function flush(times = 15): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function fakeSttStream() {
  let transcriptListener: ((result: { text: string; isFinal: boolean }) => void) | null = null;
  let errorListener: ((error: Error) => void) | null = null;

  return {
    sendAudio: jest.fn(),
    onTranscript: jest.fn((cb) => {
      transcriptListener = cb;
    }),
    onError: jest.fn((cb) => {
      errorListener = cb;
    }),
    onClose: jest.fn(),
    close: jest.fn(),
    emitTranscript: (result: { text: string; isFinal: boolean }) => transcriptListener?.(result),
    emitError: (error: Error) => errorListener?.(error),
  };
}

function fakeTtsStream() {
  const chunkListeners: Array<(chunk: Buffer) => void> = [];
  const endListeners: Array<() => void> = [];
  return {
    onAudioChunk: jest.fn((cb) => chunkListeners.push(cb)),
    onEnd: jest.fn((cb) => endListeners.push(cb)),
    onError: jest.fn(),
    cancel: jest.fn(),
    emitEnd: () => endListeners.forEach((cb) => cb()),
  };
}

const PERSONA = {
  tone: "FRIENDLY",
  language: "hi-en",
  voiceGender: null,
  voiceName: "voice-a",
  indianAccent: true,
  speakingRate: 1.0,
  pitch: 0.0,
  warmth: 0.5,
  professionalism: 0.5,
  pauseShortMs: 300,
  pauseMediumMs: 500,
  pauseLongMs: 700,
  fillerWordsEnabled: true,
  bargeInEnabled: true,
  maxResponseLength: 60,
  silenceThresholdMs: 2000,
  greetingStyle: null,
  closingStyle: null,
};

function setup(personaOverrides: Partial<typeof PERSONA> = {}) {
  const ws = { send: jest.fn(), close: jest.fn(), readyState: 1 };

  const call = {
    id: CALL_ID,
    workspaceId: WORKSPACE_ID,
    customerId: "customer-1",
    orderId: "order-1",
    callQueueId: "cq-1",
  };
  const prisma = {
    call: { findFirst: jest.fn().mockResolvedValue(call) },
    conversation: { findUnique: jest.fn().mockResolvedValue({ id: "conv-1" }) },
    conversationMessage: {
      findFirst: jest.fn().mockResolvedValue({ content: "Namaste! Main kaise madad karu?" }),
    },
    liveCallState: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  };

  const callQueueService = {
    findById: jest.fn().mockResolvedValue({ id: "cq-1", aiAgentId: "agent-1" }),
  };

  const voicePersonaConfigService = {
    resolveEffectiveConfig: jest.fn().mockResolvedValue({ ...PERSONA, ...personaOverrides }),
  };

  const sttStream = fakeSttStream();
  const sttProviderFactory = {
    createForWorkspace: jest.fn().mockResolvedValue({
      startStream: jest.fn().mockReturnValue(sttStream),
    }),
  };

  const ttsStreams: ReturnType<typeof fakeTtsStream>[] = [];
  const synthesizeStream = jest.fn(() => {
    const stream = fakeTtsStream();
    ttsStreams.push(stream);
    return stream;
  });
  const ttsProviderFactory = {
    createForWorkspace: jest.fn().mockResolvedValue({ synthesizeStream }),
  };

  const conversationEngine = {
    processMessage: jest.fn().mockResolvedValue({
      conversationId: "conv-1",
      content: "Aapka order kal deliver hoga.",
      resolvedLanguage: "hi-en",
    }),
  };

  const mediaSessionConfig = { silenceTimeoutMs: 2000, aiResponseTimeoutMs: 15000 };

  const deps: MediaSessionDeps = {
    prisma: prisma as never,
    sttProviderFactory: sttProviderFactory as never,
    ttsProviderFactory: ttsProviderFactory as never,
    conversationEngine: conversationEngine as never,
    callQueueService: callQueueService as never,
    voicePersonaConfigService: voicePersonaConfigService as never,
    mediaSessionConfig,
  };

  const session = new MediaSession(ws as never, CALL_ID, deps);

  return {
    session,
    ws,
    prisma,
    call,
    callQueueService,
    voicePersonaConfigService,
    sttProviderFactory,
    ttsProviderFactory,
    synthesizeStream,
    ttsStreams,
    sttStream,
    conversationEngine,
  };
}

function startEvent() {
  return JSON.stringify({ event: "start", start: { callId: CALL_ID } });
}

function mediaEvent(text = "audio") {
  return JSON.stringify({
    event: "media",
    media: { track: "inbound", payload: Buffer.from(text).toString("base64") },
  });
}

describe("MediaSession", () => {
  it("on start: resolves the persona exactly once and speaks the existing greeting", async () => {
    const { session, voicePersonaConfigService, synthesizeStream, ttsProviderFactory } = setup();

    session.handleMessage(startEvent());
    await flush();

    expect(voicePersonaConfigService.resolveEffectiveConfig).toHaveBeenCalledTimes(1);
    expect(voicePersonaConfigService.resolveEffectiveConfig).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "agent-1",
    );
    expect(ttsProviderFactory.createForWorkspace).toHaveBeenCalledTimes(1);
    expect(synthesizeStream).toHaveBeenCalledWith(
      "Namaste! Main kaise madad karu?",
      expect.objectContaining({ voice: "voice-a", speakingRate: 1.0, warmth: 0.5 }),
    );
  });

  it("streams synthesized audio chunks back over the ws connection as playAudio frames", async () => {
    const { session, ws, ttsStreams } = setup();

    session.handleMessage(startEvent());
    await flush();

    const [chunkListener] = ttsStreams[0].onAudioChunk.mock.calls[0];
    chunkListener(Buffer.from("chunk"));

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"event":"playAudio"'));
  });

  it("raw inbound audio frames while the AI is speaking do NOT trigger barge-in", async () => {
    // Regression test: Plivo streams continuous bidirectional audio for
    // the whole call (silence included), not just when the customer is
    // actually talking. Gating barge-in on "a media frame arrived" would
    // cancel the AI's own speech within milliseconds of it starting,
    // every single time -- barge-in must be keyed off STT-detected
    // speech (see the next test), never off raw audio frames.
    const { session, ws, ttsStreams, sttStream } = setup();

    session.handleMessage(startEvent());
    await flush();
    expect(ttsStreams).toHaveLength(1); // greeting is playing

    session.handleMessage(mediaEvent());
    session.handleMessage(mediaEvent());
    session.handleMessage(mediaEvent());

    expect(sttStream.sendAudio).toHaveBeenCalledTimes(3); // audio still forwarded to STT
    expect(ttsStreams[0].cancel).not.toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining('"event":"clearAudio"'));
  });

  it("an STT transcript event while the AI is speaking cancels TTS and clears audio (barge-in)", async () => {
    const { session, ws, ttsStreams, sttStream } = setup();

    session.handleMessage(startEvent());
    await flush();
    expect(ttsStreams).toHaveLength(1); // greeting is playing

    sttStream.emitTranscript({ text: "wait wait", isFinal: false });

    expect(ttsStreams[0].cancel).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"event":"clearAudio"'));
  });

  it("an STT transcript event while an LLM call is in flight (before any TTS starts) aborts the running LLM request", async () => {
    const { session, sttStream, conversationEngine, prisma } = setup();
    prisma.conversationMessage.findFirst.mockResolvedValue(null); // no greeting -- isolate to the turn
    session.handleMessage(startEvent());
    await flush();

    let capturedSignal: AbortSignal | undefined;
    conversationEngine.processMessage.mockImplementationOnce((input: never) => {
      capturedSignal = (input as { abortSignal: AbortSignal }).abortSignal;
      return new Promise(() => {}); // never resolves within this test -- still "thinking"
    });

    sttStream.emitTranscript({ text: "first utterance", isFinal: true });
    await flush();
    expect(capturedSignal?.aborted).toBe(false);

    sttStream.emitTranscript({ text: "customer interrupts before AI has said anything", isFinal: false });

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not barge in when the persona has bargeInEnabled: false", async () => {
    const { session, ttsStreams, sttStream } = setup({ bargeInEnabled: false });

    session.handleMessage(startEvent());
    await flush();

    sttStream.emitTranscript({ text: "wait wait", isFinal: false });

    expect(ttsStreams[0].cancel).not.toHaveBeenCalled();
  });

  it("an isFinal transcript triggers exactly one processMessage() call and speaks the reply", async () => {
    const { session, sttStream, conversationEngine, synthesizeStream, prisma } = setup();
    prisma.conversationMessage.findFirst.mockResolvedValue(null); // no greeting -- isolate to the turn

    session.handleMessage(startEvent());
    await flush();
    expect(synthesizeStream).not.toHaveBeenCalled();

    sttStream.emitTranscript({ text: "Mera order kahan hai?", isFinal: true });
    await flush();

    expect(conversationEngine.processMessage).toHaveBeenCalledTimes(1);
    expect(conversationEngine.processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        customerId: "customer-1",
        conversationId: "conv-1",
        message: "Mera order kahan hai?",
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(synthesizeStream).toHaveBeenCalledTimes(1);
    expect(synthesizeStream).toHaveBeenCalledWith(
      "Aapka order kal deliver hoga.",
      expect.anything(),
    );
  });

  it("ignores non-final (partial) transcripts -- does not trigger a turn", async () => {
    const { session, sttStream, conversationEngine } = setup();

    session.handleMessage(startEvent());
    await flush();

    sttStream.emitTranscript({ text: "Mera...", isFinal: false });
    await flush();

    expect(conversationEngine.processMessage).not.toHaveBeenCalled();
  });

  it("stop cleans up the STT stream, in-flight TTS, and any pending turn", async () => {
    const { session, sttStream, ttsStreams } = setup();

    session.handleMessage(startEvent());
    await flush();

    session.handleMessage(JSON.stringify({ event: "stop" }));

    expect(sttStream.close).toHaveBeenCalledTimes(1);
    expect(ttsStreams[0].cancel).toHaveBeenCalledTimes(1);
  });

  it("handleError logs and tears down the session the same way stop does", async () => {
    const { session, sttStream, ttsStreams } = setup();

    session.handleMessage(startEvent());
    await flush();

    session.handleError(new Error("ws exploded"));

    expect(sttStream.close).toHaveBeenCalledTimes(1);
    expect(ttsStreams[0].cancel).toHaveBeenCalledTimes(1);
  });

  describe("race conditions between overlapping turns", () => {
    it("a second finalized utterance while the first turn is in flight aborts the stale turn without clobbering the new one's controller", async () => {
      const { session, sttStream, conversationEngine, synthesizeStream, prisma } = setup();
      prisma.conversationMessage.findFirst.mockResolvedValue(null); // isolate to turns
      session.handleMessage(startEvent());
      await flush();

      let firstSignal: AbortSignal | undefined;
      let resolveFirst!: (value: { content: string; resolvedLanguage: string }) => void;
      conversationEngine.processMessage.mockImplementationOnce((input: never) => {
        firstSignal = (input as { abortSignal: AbortSignal }).abortSignal;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      });

      sttStream.emitTranscript({ text: "first utterance", isFinal: true });
      await flush();

      let secondSignal: AbortSignal | undefined;
      conversationEngine.processMessage.mockImplementationOnce((input: never) => {
        secondSignal = (input as { abortSignal: AbortSignal }).abortSignal;
        return Promise.resolve({ content: "second reply", resolvedLanguage: "hi-en" });
      });

      sttStream.emitTranscript({ text: "second utterance", isFinal: true });
      await flush();

      expect(firstSignal?.aborted).toBe(true);
      expect(secondSignal?.aborted).toBe(false);
      expect(synthesizeStream).toHaveBeenCalledWith("second reply", expect.anything());

      // The stale first turn resolving late must not speak over the new one.
      synthesizeStream.mockClear();
      resolveFirst({ content: "stale reply", resolvedLanguage: "hi-en" });
      await flush();

      expect(synthesizeStream).not.toHaveBeenCalled();
      expect(secondSignal?.aborted).toBe(false); // the stale turn's cleanup didn't touch it
    });
  });

  describe("live call state (Sprint 20 admin Live Call API)", () => {
    it("seeds LiveCallState (LISTENING/SILENCE) on start, then flips to SPEAKING/AI before the greeting plays", async () => {
      const { session, prisma } = setup();

      session.handleMessage(startEvent());
      await flush();

      expect(prisma.liveCallState.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { callId: CALL_ID },
          create: expect.objectContaining({
            callId: CALL_ID,
            workspaceId: WORKSPACE_ID,
            speakingParty: "SILENCE",
            aiStatus: "LISTENING",
          }),
        }),
      );
      expect(prisma.liveCallState.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          create: expect.objectContaining({ speakingParty: "AI", aiStatus: "SPEAKING" }),
        }),
      );
    });

    it("flips to CUSTOMER/LISTENING on barge-in", async () => {
      const { session, prisma, sttStream, ttsStreams } = setup();

      session.handleMessage(startEvent());
      await flush();
      expect(ttsStreams).toHaveLength(1); // greeting is playing
      prisma.liveCallState.upsert.mockClear();

      sttStream.emitTranscript({ text: "wait wait", isFinal: false });

      expect(prisma.liveCallState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ speakingParty: "CUSTOMER", aiStatus: "LISTENING" }),
        }),
      );
    });

    it("flips to THINKING/SILENCE while a turn is being processed, then records the resulting workflow node", async () => {
      const { session, sttStream, prisma, conversationEngine } = setup();
      prisma.conversationMessage.findFirst.mockResolvedValue(null); // isolate to the turn
      session.handleMessage(startEvent());
      await flush();
      prisma.liveCallState.upsert.mockClear();
      conversationEngine.processMessage.mockResolvedValue({
        conversationId: "conv-1",
        content: "Aapka order kal deliver hoga.",
        resolvedLanguage: "hi-en",
        lastNodeKey: "lookup_order_node",
      });

      sttStream.emitTranscript({ text: "Mera order kahan hai?", isFinal: true });
      await flush();

      expect(prisma.liveCallState.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          update: expect.objectContaining({
            aiStatus: "THINKING",
            speakingParty: "SILENCE",
            lastTranscriptSnippet: "Mera order kahan hai?",
          }),
        }),
      );
      expect(prisma.liveCallState.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          update: expect.objectContaining({ currentWorkflowNodeKey: "lookup_order_node" }),
        }),
      );
    });

    it("deletes the live call state row on close", async () => {
      const { session, prisma } = setup();

      session.handleMessage(startEvent());
      await flush();

      session.handleMessage(JSON.stringify({ event: "stop" }));

      expect(prisma.liveCallState.deleteMany).toHaveBeenCalledWith({
        where: { callId: CALL_ID },
      });
    });

    it("a live-state write failure never breaks the call (fire-and-forget, only logged)", async () => {
      const { session, prisma } = setup();
      prisma.liveCallState.upsert.mockRejectedValue(new Error("db down"));

      session.handleMessage(startEvent());
      await flush();

      // No throw propagated -- the greeting still gets synthesized despite
      // every live-state write failing.
      expect(prisma.call.findFirst).toHaveBeenCalled();
    });
  });

  describe("startup/teardown races", () => {
    it("closing the connection while onStart() is still awaiting closes the STT stream instead of leaking it", async () => {
      const { session, sttProviderFactory, sttStream, callQueueService } = setup();

      // Delay callQueueService.findById so handleClose() can run mid-startup,
      // after the STT stream (an expensive live connection) has already
      // been opened but before onTranscript listeners are wired up.
      let resolveQueueLookup!: (value: { id: string; aiAgentId: string }) => void;
      callQueueService.findById.mockReturnValue(
        new Promise((resolve) => {
          resolveQueueLookup = resolve;
        }),
      );

      session.handleMessage(startEvent());
      await flush(2);

      session.handleClose(); // customer hangs up before startup finished
      resolveQueueLookup({ id: "cq-1", aiAgentId: "agent-1" });
      await flush();

      expect(sttProviderFactory.createForWorkspace).toHaveBeenCalled();
      expect(sttStream.close).toHaveBeenCalled();
    });
  });
});
