import { describe, expect, it } from "vitest";
import { SPEECH_LOCALE, pickVoice, prepareSpeech, recognitionProblem } from "./speech";

const v = (lang: string, localService = true, name = lang) => ({ lang, localService, name });

describe("pickVoice", () => {
  it("returns null when no voice speaks the language (so the listen button is hidden)", () => {
    // the situation on a Windows desktop with only English voices
    const english = [v("en-US", true, "David"), v("en-US", true, "Zira")];
    expect(pickVoice(english, "bn")).toBeNull();
    expect(pickVoice([], "en")).toBeNull();
  });

  it("prefers the exact locale over another locale of the same language", () => {
    const voices = [v("bn-IN", true, "india"), v("bn-BD", true, "bangladesh")];
    expect(pickVoice(voices, "bn")?.name).toBe("bangladesh");
    expect(pickVoice([v("en-GB", true, "uk"), v("en-US", true, "us")], "en")?.name).toBe("us");
  });

  it("falls back to another locale of the same language", () => {
    expect(pickVoice([v("bn-IN", true, "india")], "bn")?.name).toBe("india");
    expect(pickVoice([v("en-GB", true, "uk")], "en")?.name).toBe("uk");
    expect(pickVoice([v("bn", true, "bare")], "bn")?.name).toBe("bare");
  });

  it("accepts underscores in the locale (some Android versions)", () => {
    expect(pickVoice([v("bn_BD", true, "android")], "bn")?.name).toBe("android");
  });

  it("on a tie, a voice on the device beats an online one, and earlier beats later", () => {
    const voices = [
      v("bn-BD", false, "online"),
      v("bn-BD", true, "device"),
      v("bn-BD", true, "later"),
    ];
    expect(pickVoice(voices, "bn")?.name).toBe("device");
  });

  it("an exact online voice still beats a same-language local one only if nothing local matches exactly", () => {
    // exact online = rank 1, other-locale local = rank 2: exact wins
    expect(
      pickVoice([v("bn-IN", true, "india-local"), v("bn-BD", false, "bd-online")], "bn")?.name,
    ).toBe("bd-online");
  });

  it("does not match a different language that merely starts with the same letters", () => {
    expect(pickVoice([v("ben-US", true), v("bnx-XX", true)], "bn")).toBeNull();
  });

  it("asks for Bangladesh Bangla and US English", () => {
    expect(SPEECH_LOCALE).toEqual({ bn: "bn-BD", en: "en-US" });
  });
});

describe("prepareSpeech", () => {
  it("says taka amounts as words", () => {
    expect(prepareSpeech("You have ৳1,800 left and ৳ 50.", "en")).toEqual([
      "You have 1,800 taka left and 50 taka.",
    ]);
    expect(prepareSpeech("আপনার ৳১,৮০০ আছে।", "bn")).toEqual(["আপনার ১,৮০০ টাকা আছে।"]);
  });

  it("removes markdown marks and joins lines", () => {
    const text = "## Summary\n**Food** is your top category.\n- Spend less\n- Save more";
    expect(prepareSpeech(text, "en")).toEqual([
      "Summary Food is your top category.",
      "Spend less Save more",
    ]);
  });

  it("splits at sentence ends in English and Bangla", () => {
    expect(prepareSpeech("First one. Second one? Third!", "en")).toEqual([
      "First one.",
      "Second one?",
      "Third!",
    ]);
    expect(prepareSpeech("প্রথম বাক্য। দ্বিতীয় বাক্য।", "bn")).toEqual([
      "প্রথম বাক্য।",
      "দ্বিতীয় বাক্য।",
    ]);
  });

  it("breaks a very long sentence at word boundaries, never above 180 characters", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const chunks = prepareSpeech(long, "en");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(180);
    expect(chunks.join(" ")).toBe(long); // nothing lost
  });

  it("returns nothing for empty text", () => {
    expect(prepareSpeech("  \n ", "en")).toEqual([]);
  });
});

describe("recognitionProblem", () => {
  it("names what went wrong, and stays quiet when we stopped it ourselves", () => {
    expect(recognitionProblem("not-allowed")).toBe("denied");
    expect(recognitionProblem("service-not-allowed")).toBe("denied");
    expect(recognitionProblem("audio-capture")).toBe("no_mic");
    expect(recognitionProblem("no-speech")).toBe("no_speech");
    expect(recognitionProblem("language-not-supported")).toBe("unsupported_language");
    expect(recognitionProblem("network")).toBe("network");
    expect(recognitionProblem("aborted")).toBeNull();
    expect(recognitionProblem("something-new")).toBe("other");
  });
});
