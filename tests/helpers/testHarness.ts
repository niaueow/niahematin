import fs from "node:fs";
import { Bot } from "grammy";
import { prisma, bootstrapDatabase, closeDb } from "../../src/db.js";
import { createBot } from "../../src/bot/bot.js";
import { env } from "../../src/config.js";

export type RecordedCall = {
  method: string;
  payload: any;
};

export function createTestHarness(tempDbPath: string) {
  let bot: ReturnType<typeof createBot>;
  const recordedCalls: RecordedCall[] = [];
  let nextMsgId = 1000;
  let nextUpdateId = 1;

  async function init() {
    if (process.env.DATABASE_URL?.includes("dev.db")) {
      throw new Error("UNSAFE TEST ENVIRONMENT: Refusing to run tests against dev.db");
    }
    await bootstrapDatabase();

    bot = createBot();
    bot.botInfo = {
      id: 11111111,
      is_bot: true,
      first_name: "NiaHematinTestBot",
      username: "niahematin_test_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false
    };

    bot.catch((err) => {
      // Record unhandled bot errors
      recordedCalls.push({
        method: "botError",
        payload: { error: err.error, message: (err.error as any)?.message }
      });
    });

    bot.api.config.use(async (_prev, method, payload) => {
      recordedCalls.push({ method, payload });
      if (method === "sendMessage") {
        return {
          ok: true,
          result: {
            message_id: nextMsgId++,
            date: Math.floor(Date.now() / 1000),
            chat: { id: payload.chat_id, type: "private" },
            text: payload.text
          }
        } as any;
      }
      if (method === "editMessageText") {
        return {
          ok: true,
          result: {
            message_id: payload.message_id,
            date: Math.floor(Date.now() / 1000),
            chat: { id: payload.chat_id, type: "private" },
            text: payload.text
          }
        } as any;
      }
      if (method === "answerCallbackQuery") {
        return { ok: true, result: true } as any;
      }
      return { ok: true, result: {} } as any;
    });

    await bot.init();
  }

  async function teardown() {
    await closeDb();
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {}
    }
  }

  async function sendText(text: string, fromId = Number(env.TELEGRAM_ALLOWED_USER_ID ?? 11111111)) {
    const updateId = nextUpdateId++;
    await bot.handleUpdate({
      update_id: updateId,
      message: {
        message_id: nextMsgId++,
        date: Math.floor(Date.now() / 1000),
        chat: { id: fromId, type: "private" },
        from: { id: fromId, is_bot: false, first_name: "User" },
        text
      }
    });
  }

  async function sendCommand(command: string, args = "", fromId = Number(env.TELEGRAM_ALLOWED_USER_ID ?? 11111111)) {
    const updateId = nextUpdateId++;
    const fullText = args ? `/${command} ${args}` : `/${command}`;
    const cmdLen = command.length + 1;
    await bot.handleUpdate({
      update_id: updateId,
      message: {
        message_id: nextMsgId++,
        date: Math.floor(Date.now() / 1000),
        chat: { id: fromId, type: "private" },
        from: { id: fromId, is_bot: false, first_name: "User" },
        text: fullText,
        entities: [{ type: "bot_command", offset: 0, length: cmdLen }]
      }
    });
  }

  async function tapButton(data: string, messageId = 1000, fromId = Number(env.TELEGRAM_ALLOWED_USER_ID ?? 11111111)) {
    const updateId = nextUpdateId++;
    await bot.handleUpdate({
      update_id: updateId,
      callback_query: {
        id: `cb_${updateId}`,
        from: { id: fromId, is_bot: false, first_name: "User" },
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: fromId, type: "private" },
          text: "prompt"
        },
        chat_instance: "inst_1",
        data
      }
    });
  }

  function lastReply(): string | undefined {
    for (let i = recordedCalls.length - 1; i >= 0; i--) {
      const call = recordedCalls[i];
      if (call.method === "sendMessage" || call.method === "editMessageText") {
        return call.payload.text;
      }
    }
    return undefined;
  }

  function allReplies(): string[] {
    return recordedCalls
      .filter((c) => c.method === "sendMessage" || c.method === "editMessageText")
      .map((c) => c.payload.text);
  }

  function clearCalls() {
    recordedCalls.length = 0;
  }

  return {
    get bot() {
      return bot;
    },
    recordedCalls,
    init,
    teardown,
    sendText,
    sendCommand,
    tapButton,
    lastReply,
    allReplies,
    clearCalls,
    prisma
  };
}
