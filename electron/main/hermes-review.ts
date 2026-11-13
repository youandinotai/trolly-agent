import { sanitizeHermesReviewPacket, type HermesReviewPacket } from '../../src/lib/hermes-review.js';

/** Optional Hermes ethics/QA review through the user's local Hermes proxy. */
export class HermesReviewer {
  private readonly baseUrl: string;
  private model = '';

  constructor(baseUrl = 'http://127.0.0.1:8645') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async defaultModel(): Promise<string> {
    if (this.model) return this.model;
    const response = await fetch(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Hermes proxy returned HTTP ${response.status}`);
    const data = await response.json();
    this.model = data?.usage_basis?.model_id ?? data?.data?.[0]?.id ?? '';
    if (!this.model) throw new Error('Hermes proxy has no active review model.');
    return this.model;
  }

  async status(): Promise<{ online: boolean; model?: string; error?: string }> {
    try {
      return { online: true, model: await this.defaultModel() };
    } catch (error: any) {
      return { online: false, error: String(error?.message ?? error) };
    }
  }

  async review(input: unknown): Promise<{ review: string; model: string; sanitized: true }> {
    const packet: HermesReviewPacket = sanitizeHermesReviewPacket(input);
    const model = await this.defaultModel();
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer trolly-local-review' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 600,
        messages: [
          {
            role: 'system',
            content: [
              'You are Hermes, an ethics and QA reviewer for a local avatar studio.',
              'Review only the sanitized evidence supplied. Never request prompts, images, base64, or file paths.',
              'Do not claim you saw the avatar or ran the tests yourself.',
              'Return PASS or NEEDS_WORK, then concise reasons and any high-value missing check.',
            ].join(' '),
          },
          { role: 'user', content: `Sanitized review packet: ${JSON.stringify(packet)}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Hermes review failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const review = typeof content === 'string'
      ? content
      : Array.isArray(content) ? content.map((part: any) => part?.text ?? '').join('') : '';
    if (!review.trim()) throw new Error('Hermes returned an empty review.');
    return { review: review.trim(), model, sanitized: true };
  }
}
