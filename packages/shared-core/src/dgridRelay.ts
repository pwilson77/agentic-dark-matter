import type { NegotiationEnvelope } from "./types.js";

export interface DgridRelayItemResult {
  envelopeId: string;
  ok: boolean;
  status: number;
  relayId?: string;
  error?: string;
}

export interface DgridRelayBatchResult {
  endpoint: string;
  topic: string;
  published: number;
  failed: number;
  results: DgridRelayItemResult[];
}

export interface RelayNegotiationEnvelopesInput {
  endpoint: string;
  topic: string;
  envelopes: NegotiationEnvelope[];
  apiKey?: string;
  timeoutMs?: number;
}

export async function relayNegotiationEnvelopesToDgrid(
  input: RelayNegotiationEnvelopesInput,
): Promise<DgridRelayBatchResult> {
  const endpoint = input.endpoint.trim();
  if (!endpoint) {
    throw new Error("DGrid relay endpoint is required.");
  }
  if (!input.topic.trim()) {
    throw new Error("DGrid relay topic is required.");
  }

  const timeoutMs = Math.max(500, input.timeoutMs ?? 8000);
  const results: DgridRelayItemResult[] = [];

  for (const envelope of input.envelopes) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
        },
        body: JSON.stringify({
          topic: input.topic,
          envelope,
        }),
        signal: controller.signal,
      });

      let relayId: string | undefined;
      try {
        const payload = (await response.json()) as
          | { id?: string; relayId?: string }
          | undefined;
        relayId = payload?.relayId || payload?.id;
      } catch {
        // best effort only
      }

      results.push({
        envelopeId: envelope.envelopeId,
        ok: response.ok,
        status: response.status,
        relayId,
        error: response.ok
          ? undefined
          : `DGrid relay rejected envelope (${response.status})`,
      });
    } catch (error) {
      results.push({
        envelopeId: envelope.envelopeId,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return {
    endpoint,
    topic: input.topic,
    published: results.length - failed,
    failed,
    results,
  };
}
