/**
 * Where OpenAI-style requests go. Set OPENAI_BASE_URL to use any server that speaks the same API
 * (for example a local Ollama or vLLM at http://host:11434/v1) instead of api.openai.com.
 * Models are still chosen by the OPENAI_*_MODEL settings, and the API key is still OPENAI_API_KEY
 * (most local servers accept any value).
 */
const DEFAULT_BASE = "https://api.openai.com/v1";

export function openaiUrl(path: string): string {
  const base = (Deno.env.get("OPENAI_BASE_URL") || DEFAULT_BASE).replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}
