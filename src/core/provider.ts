import type { FetchLike } from "./types";

/** One model call: a system prompt, a user prompt, and a key naming the claim and source. */
export interface CompletionRequest {
  /** "<claim id>:<reference number>", used by the replay provider. */
  key: string;
  system: string;
  user: string;
}

/** The only thing the rest of the app knows about a model. */
export interface ModelProvider {
  /** Shown in the results footer, for example "OpenRouter google/gemma-4-31b-it:free". */
  readonly label: string;
  /** Returns the model's raw text reply. */
  complete(request: CompletionRequest): Promise<string>;
}

export type ProviderErrorKind = "auth" | "rate_limit" | "http" | "network" | "bad_response";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

/** Documented in the OpenRouter API reference as the chat completions endpoint. */
export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface OpenRouterOptions {
  apiKey: string;
  /** Must end in ":free"; any other model id is refused so no paid route is ever called. */
  model: string;
  fetchImpl: FetchLike;
}

function errorMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = body.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  return typeof error.message === "string" ? error.message : null;
}

function messageContent(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("choices" in body)) return null;
  const choices = body.choices;
  if (!Array.isArray(choices)) return null;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null || !("message" in first)) return null;
  const message = first.message;
  if (typeof message !== "object" || message === null || !("content" in message)) return null;
  return typeof message.content === "string" ? message.content : null;
}

/** Bring-your-own-key provider for OpenRouter free models, called from the browser. */
export function createOpenRouterProvider(options: OpenRouterOptions): ModelProvider {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (apiKey === "") {
    throw new Error("An OpenRouter key is required.");
  }
  if (!model.endsWith(":free")) {
    throw new Error(`Only free models are allowed; "${model}" does not end in ":free".`);
  }
  const fetchImpl = options.fetchImpl;

  return {
    label: `OpenRouter ${model}`,
    async complete({ system, user }) {
      let response: Response;
      try {
        response = await fetchImpl(OPENROUTER_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature: 0,
          }),
        });
      } catch {
        throw new ProviderError("network", "Could not reach OpenRouter.");
      }

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = errorMessage(body);
        const suffix = detail ? `: ${detail}` : "";
        if (response.status === 401 || response.status === 403) {
          throw new ProviderError(
            "auth",
            `OpenRouter rejected the key (HTTP ${response.status})${suffix}`,
          );
        }
        if (response.status === 429) {
          throw new ProviderError(
            "rate_limit",
            `OpenRouter rate limit reached (HTTP 429)${suffix}`,
          );
        }
        throw new ProviderError("http", `OpenRouter answered HTTP ${response.status}${suffix}`);
      }

      const content = messageContent(body);
      if (content === null) {
        throw new ProviderError("bad_response", "OpenRouter's reply had no message content.");
      }
      return content;
    },
  };
}

/** Replays stored replies by request key. Used by the sample run. */
export function createReplayProvider(
  replies: Readonly<Record<string, string>>,
  label = "Recorded replies",
): ModelProvider {
  return {
    label,
    async complete({ key }) {
      const reply = replies[key];
      if (reply === undefined) {
        throw new ProviderError("bad_response", `No stored reply for ${key}.`);
      }
      return reply;
    },
  };
}
