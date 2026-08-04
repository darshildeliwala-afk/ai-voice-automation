import { buildPersonaPrompt } from "./persona-prompt.builder";

function baseInput() {
  return {
    tone: "FRIENDLY" as const,
    language: "hi-en",
    warmth: 0.5,
    professionalism: 0.5,
    fillerWordsEnabled: true,
    maxResponseLength: 60,
    greetingStyle: null,
    closingStyle: null,
  };
}

describe("buildPersonaPrompt", () => {
  it("explicitly bans the generic-chatbot phrases rather than omitting them silently", () => {
    const result = buildPersonaPrompt(baseInput());

    expect(result).toContain("Never use robotic, generic-chatbot phrases");
    expect(result).toContain("How may I assist you today?");
    expect(result).toContain("I understand your concern.");
  });

  it("instructs Hinglish by default", () => {
    const result = buildPersonaPrompt(baseInput());

    expect(result).toContain("Hinglish");
  });

  it("instructs short sentences bounded by maxResponseLength", () => {
    const result = buildPersonaPrompt({ ...baseInput(), maxResponseLength: 25 });

    expect(result).toContain("25 words");
  });

  it("includes filler-word guidance only when fillerWordsEnabled is true", () => {
    const withFillers = buildPersonaPrompt({ ...baseInput(), fillerWordsEnabled: true });
    const withoutFillers = buildPersonaPrompt({ ...baseInput(), fillerWordsEnabled: false });

    expect(withFillers).toContain("Haan ji");
    expect(withoutFillers).not.toContain("Haan ji");
  });

  it("instructs stopping immediately when interrupted", () => {
    const result = buildPersonaPrompt(baseInput());

    expect(result.toLowerCase()).toContain("stop immediately");
  });

  it("instructs reusing known customer/order context instead of re-asking", () => {
    const result = buildPersonaPrompt(baseInput());

    expect(result.toLowerCase()).toContain("never re-ask");
  });

  it("never claims to be an AI", () => {
    const result = buildPersonaPrompt(baseInput());

    expect(result).toContain("Never mention that you are an AI");
  });

  it("produces different phrasing for different tones", () => {
    const friendly = buildPersonaPrompt({ ...baseInput(), tone: "FRIENDLY" });
    const banking = buildPersonaPrompt({
      ...baseInput(),
      tone: "BANKING",
      professionalism: 0.9,
    });

    expect(friendly).not.toBe(banking);
    expect(banking).toContain("security-conscious");
    expect(banking).toContain("more formal than casual");
  });

  it("includes greeting/closing style guidance only when configured", () => {
    const withStyles = buildPersonaPrompt({
      ...baseInput(),
      greetingStyle: "warm and brief",
      closingStyle: "reassuring",
    });
    const withoutStyles = buildPersonaPrompt(baseInput());

    expect(withStyles).toContain("warm and brief");
    expect(withStyles).toContain("reassuring");
    expect(withoutStyles).not.toContain("greet the customer");
  });
});
