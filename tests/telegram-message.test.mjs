import test from 'node:test';
import assert from 'node:assert/strict';

import { acceptTelegramText } from '../src/lib/telegram-message.ts';

test('Telegram text stays local and passes the Clean filter', () => {
  const message = acceptTelegramText({ text: 'Check the studio lights.', chatId: 42 }, { clean: true });
  assert.equal(message.text, 'Check the studio lights.');
  assert.equal(message.chatId, 42);
  assert.throws(() => acceptTelegramText({ text: 'NSFW', chatId: 42 }, { clean: true }), /Clean mode blocked/);
});

test('a Telegram token never leaves the process and adult text still needs 21+', () => {
  const message = acceptTelegramText({ text: 'A 25-year-old adult.', chatId: 7 }, { adult: true });
  assert.equal('token' in message, false);
  assert.throws(() => acceptTelegramText({ text: 'A 20-year-old sexual request.', chatId: 7 }, { adult: true }), /21 or older/);
});
