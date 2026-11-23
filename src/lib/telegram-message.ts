import { assertAdultContent21Plus, assertCleanPrompt } from './content-policy.ts';

export interface TelegramText {
  text: string;
  chatId: number;
}

export function acceptTelegramText(
  update: { text?: string; chatId?: number },
  options: { clean?: boolean; adult?: boolean } = {},
): TelegramText {
  const text = String(update.text ?? '').trim();
  if (!text || !Number.isInteger(update.chatId)) throw new Error('Telegram update needs text and a chat id.');
  if (options.clean) assertCleanPrompt(text);
  if (options.adult) assertAdultContent21Plus(text);
  return { text, chatId: update.chatId as number };
}
