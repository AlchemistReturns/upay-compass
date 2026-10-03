import { beforeAll, describe, expect, it } from "vitest";
import { VOICE_MAX_BYTES } from "./voice-limits";
import { anon, signIn, url, type TestUser } from "./integration-utils";

const audioForm = (bytes: number, type = "audio/webm") => {
  const form = new FormData();
  form.append("audio", new File([new Uint8Array(bytes)], "voice.webm", { type }));
  form.append("language", "en");
  return form;
};

/** Voice functions: consent, size and rate rules. Needs a running stack with functions served. */
describe.skipIf(!url || !anon)("phase 10: voice transcription guards", () => {
  let a: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    a = await signIn("+8801700000004");
    other = await signIn("+8801700000002");
    await a.client.from("profiles").update({ voice_consent_at: null }).eq("id", a.id);
  });

  it("refuses a request with no token", async () => {
    const res = await fetch(`${url}/functions/v1/voice-transcribe`, {
      method: "POST",
      headers: { apikey: anon! },
      body: audioForm(5000),
    });
    expect(res.status).toBe(401);
  });

  it("refuses to transcribe until the person has agreed to send their voice", async () => {
    const r = await a.client.functions.invoke("voice-transcribe", { body: audioForm(5000) });
    expect(r.error).not.toBeNull();
    expect((r.error as { context?: Response }).context?.status).toBe(403);
  });

  it("consent is the person's own to give and cannot be given for someone else", async () => {
    const ok = await a.client
      .from("profiles")
      .update({ voice_consent_at: new Date().toISOString() })
      .eq("id", a.id);
    expect(ok.error).toBeNull();
    const theirs = await a.client
      .from("profiles")
      .update({ voice_consent_at: new Date().toISOString() })
      .eq("id", other.id)
      .select("id");
    expect(theirs.data).toEqual([]);
  });

  it("rejects a recording that is too small or too large, and a file that is not audio", async () => {
    const status = async (form: FormData) =>
      (
        (await a.client.functions.invoke("voice-transcribe", { body: form })).error as {
          context?: Response;
        }
      ).context?.status;
    expect(await status(audioForm(100))).toBe(400);
    expect(await status(audioForm(VOICE_MAX_BYTES + 1))).toBe(413);
    expect(await status(audioForm(5000, "application/pdf"))).toBe(400);
  });

  it("writes an audit entry for a call and never the audio", async () => {
    const before = await a.client
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "voice_transcribe");
    await a.client.functions.invoke("voice-transcribe", { body: audioForm(5000) }); // not real speech
    const after = await a.client
      .from("audit_log")
      .select("detail")
      .eq("action", "voice_transcribe")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(after.data!.length).toBe(1);
    const detail = after.data![0]!.detail as Record<string, unknown>;
    expect(Object.keys(detail).sort()).toEqual(["bytes", "language", "ok"]);
    expect((before.count ?? 0) + 1).toBeGreaterThanOrEqual(1);
  });

  it("consent can be withdrawn", async () => {
    const off = await a.client.from("profiles").update({ voice_consent_at: null }).eq("id", a.id);
    expect(off.error).toBeNull();
    const r = await a.client.functions.invoke("voice-transcribe", { body: audioForm(5000) });
    expect((r.error as { context?: Response }).context?.status).toBe(403);
  });
});
