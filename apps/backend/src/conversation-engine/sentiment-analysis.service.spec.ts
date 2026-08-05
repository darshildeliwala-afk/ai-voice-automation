import { SentimentAnalysisService } from "./sentiment-analysis.service";

describe("SentimentAnalysisService", () => {
  const service = new SentimentAnalysisService();

  it("detects positive sentiment", () => {
    expect(
      service.analyze("Thank you so much, this was really helpful and great service!"),
    ).toBe("POSITIVE");
  });

  it("detects negative sentiment", () => {
    expect(
      service.analyze("This is terrible, I am so frustrated with the delay."),
    ).toBe("NEGATIVE");
  });

  it("defaults to neutral when no sentiment words are present", () => {
    expect(service.analyze("My order number is 12345.")).toBe("NEUTRAL");
  });

  it("defaults to neutral when positive and negative signals cancel out", () => {
    expect(service.analyze("It was good but also a bit of a problem.")).toBe(
      "NEUTRAL",
    );
  });

  it("is case-insensitive", () => {
    expect(service.analyze("THANK YOU, EXCELLENT!")).toBe("POSITIVE");
  });

  it("recognizes common Hinglish sentiment words", () => {
    expect(service.analyze("Bahut badhiya, shukriya!")).toBe("POSITIVE");
    expect(service.analyze("Bilkul bekaar service, bahut pareshan hoon.")).toBe(
      "NEGATIVE",
    );
  });
});
