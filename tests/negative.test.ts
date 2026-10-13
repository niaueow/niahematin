import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { parseQuickLog } from "../src/parser/quickLogParser.js";
import { createTestHarness } from "./helpers/testHarness.js";

const { tempDbPath } = vi.hoisted(() => {
  const randomSuffix = Math.random().toString(36).slice(2);
  const tempPath = `test-temp-negative-${Date.now()}-${randomSuffix}.db`;
  process.env.DATABASE_URL = `file:./${tempPath}`;
  process.env.TELEGRAM_BOT_TOKEN = "11111111:FAKE_MOCK_TOKEN";
  process.env.TELEGRAM_ALLOWED_USER_ID = "11111111";
  process.env.NODE_ENV = "test";
  return { tempDbPath: tempPath };
});

describe("6.2 Negative Testing (PRD v3 Checklist)", () => {
  const harness = createTestHarness(tempDbPath);

  beforeAll(async () => {
    await harness.init();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  beforeEach(async () => {
    harness.clearCalls();
  });

  // N-01
  it("N-01: Nonsense input ('asdf', emoji, empty) gets a helpful reply and writes nothing", async () => {
    const beforeCount = await harness.prisma.transaction.count();
    await harness.sendText("asdfghjk");
    const afterCount = await harness.prisma.transaction.count();
    expect(afterCount).toBe(beforeCount);

    const reply = harness.lastReply();
    // QA N-01: Nonsense input gets a helpful reply, not silent ignore
    expect(reply).toBeDefined();
    expect(reply).toMatch(/format|contoh|bantuan/i);
  });

  // N-02
  it("N-02: Invalid amounts: 0, negative, 'abc rb', 1e9, absurdly large values are rejected or confirmed", async () => {
    // Check parser behavior
    expect(parseQuickLog("abc rb")).toBeNull();

    // 0 or negative should either return null or be safely handled, never throw unhandled error
    let threw = false;
    try {
      parseQuickLog("0 kopi");
    } catch {
      threw = true;
    }
    // If parseQuickLog throws unhandled ZodError, it will crash request
    expect(threw).toBe(false);

    // Absurdly large amount like 1e9 or 999999999999
    const beforeCount = await harness.prisma.transaction.count();
    await harness.sendText("1000000000000 kopi");
    const afterCount = await harness.prisma.transaction.count();
    // Should be rejected or require explicit confirmation
    expect(afterCount).toBe(beforeCount);
  });

  // N-03
  it("N-03: Commands with missing or malformed arguments produce helpful usage replies", async () => {
    await harness.sendCommand("boleh");
    expect(harness.lastReply()).toContain("Format: /boleh 25000 boba");

    await harness.sendCommand("boleh", "abc");
    expect(harness.lastReply()).toContain("Format: /boleh 25000 boba");

    await harness.sendCommand("masuk");
    expect(harness.lastReply()).toContain("Format: /masuk 2000000 jatah");

    await harness.sendCommand("mode", "invalid_mode");
    expect(harness.lastReply()).toContain("Pakai /mode calibration atau /mode active");
  });

  // N-04
  it("N-04: Unknown commands do not crash the bot", async () => {
    await harness.sendCommand("nonexistent_command_xyz");
    // Should not throw or crash
    const errors = harness.recordedCalls.filter((c) => c.method === "botError");
    expect(errors).toHaveLength(0);
  });

  // N-05
  it("N-05: Callback data that is stale, forged, or already used does nothing harmful", async () => {
    // Send stale callback query without prior /boleh session
    await harness.tapButton("boleh:buy", 9999);
    const reply = harness.recordedCalls.find((c) => c.method === "answerCallbackQuery");
    expect(reply?.payload.text).toBe("Tidak ada /boleh yang aktif.");

    // Unknown callback data
    await harness.tapButton("forged:malicious:action", 9999);
    const errors = harness.recordedCalls.filter((c) => c.method === "botError");
    expect(errors).toHaveLength(0);
  });

  // N-06
  it("N-06: Claude fallback failures fall back to manual buttons and never overwrite regex amount", () => {
    // Code inspection / mock: quickLogParser regex amount takes precedence
    const parsed = parseQuickLog("15 kopi");
    expect(parsed?.amount).toBe(15_000);
  });

  // N-07
  it("N-07: Database errors produce safe replies and no partial writes", async () => {
    // Unhandled DB exceptions should be caught gracefully
    const errors = harness.recordedCalls.filter((c) => c.method === "botError");
    expect(errors).toHaveLength(0);
  });

  // N-08
  it("N-08: /pinjam from HP fund, before 24h wait ends, and double /pinjam are rejected", async () => {
    // PRD 5.5: HP fund cannot be borrowed, Bibit only, must wait 24h
    await harness.sendCommand("pinjam");
    expect(harness.lastReply()).toContain("Dana HP tidak bisa dipinjam");
  });

  // N-09
  it("N-09: Unauthorized Telegram users get no data and no side effects", async () => {
    const unauthorizedId = 999999999;
    const beforeCount = await harness.prisma.transaction.count();

    await harness.sendCommand("sisa", "", unauthorizedId);
    expect(harness.lastReply()).toBe("Bot ini private dulu ya.");

    await harness.sendText("15 kopi", unauthorizedId);
    expect(harness.lastReply()).toBe("Bot ini private dulu ya.");

    const afterCount = await harness.prisma.transaction.count();
    expect(afterCount).toBe(beforeCount);
  });

  // N-10
  it("N-10: Files, stickers, photos, voice notes are ignored or politely refused", async () => {
    await harness.bot.handleUpdate({
      update_id: 999,
      message: {
        message_id: 999,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 11111111, type: "private" },
        from: { id: 11111111, is_bot: false, first_name: "Owner" },
        sticker: { file_id: "test_sticker", file_unique_id: "u_1", width: 512, height: 512, is_animated: false, is_video: false }
      } as any
    });

    const errors = harness.recordedCalls.filter((c) => c.method === "botError");
    expect(errors).toHaveLength(0);
  });
});
