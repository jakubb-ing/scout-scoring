import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { offlineDb } from "./db";
import {
  clearOutbox,
  enqueue,
  flushOutbox,
  initOutbox,
  onFlushResult,
  registerOutboxKind,
  resumeAuthBlocked,
  resumeBlocked,
  type FlushResult,
} from "./outbox";

/**
 * Outbox je jediné místo, kde se hodnocení může ztratit bez toho, aby si
 * toho kdokoli všiml — rozhodčí vidí „uloženo" a data přitom nikde nejsou.
 * Testy proto jedou proti reálnému Dexie (fake-indexeddb), ne proti mocku.
 */

interface TestPayload {
  chain: string;
  key: string;
  value?: string;
}

const send = vi.fn<(payload: TestPayload) => Promise<unknown>>();
const applied = vi.fn();
const flushed = vi.fn();

let qc: QueryClient;

registerOutboxKind<TestPayload, unknown>("test.kind", {
  send: (payload) => send(payload),
  dedupeKey: (p) => p.key,
  chainKey: (p) => p.chain,
  onApplied: (_qc, p) => applied(p),
  onFlushed: (_qc, p, result) => flushed(p, result),
});

// Druhý kind se stejným řetězcem — ověřuje blokování napříč kinds.
registerOutboxKind<TestPayload, unknown>("test.follow", {
  send: (payload) => send(payload),
  dedupeKey: (p) => `follow:${p.key}`,
  chainKey: (p) => p.chain,
  onApplied: () => {},
  classifyError: (error) =>
    error instanceof ApiError && error.status === 409 ? "blocked" : null,
});

async function items() {
  return offlineDb.outbox.orderBy("id").toArray();
}

beforeEach(async () => {
  await offlineDb.outbox.clear();
  send.mockReset();
  applied.mockReset();
  flushed.mockReset();
  qc = new QueryClient();
  initOutbox(qc, { autoFlush: false });
});

afterEach(async () => {
  await offlineDb.outbox.clear();
});

describe("enqueue", () => {
  it("zapíše položku a hned udělá optimistický update", async () => {
    send.mockRejectedValue(new Error("offline"));

    await enqueue("test.kind", { chain: "a", key: "a:1", value: "první" });

    expect(applied).toHaveBeenCalledTimes(1);
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("druhý zápis stejného cíle přepíše čekající místo přidání", async () => {
    send.mockRejectedValue(new Error("offline"));

    await enqueue("test.kind", { chain: "a", key: "a:1", value: "první" });
    await enqueue("test.kind", { chain: "a", key: "a:1", value: "druhý" });

    const rows = await items();
    expect(rows).toHaveLength(1);
    expect((rows[0].payload as TestPayload).value).toBe("druhý");
  });

  it("neznámý kind je programátorská chyba, ne tichý no-op", async () => {
    await expect(enqueue("neexistuje", {})).rejects.toThrow(/not registered/);
  });
});

describe("flush — úspěch", () => {
  it("odešle položku, smaže ji z fronty a zavolá onFlushed", async () => {
    send.mockResolvedValue({ id: "server:1" });

    await enqueue("test.kind", { chain: "a", key: "a:1" });
    await flushOutbox();

    expect(send).toHaveBeenCalledTimes(1);
    expect(flushed).toHaveBeenCalledWith(expect.objectContaining({ key: "a:1" }), {
      id: "server:1",
    });
    expect(await items()).toHaveLength(0);
  });

  it("ohlásí výsledek posluchačům", async () => {
    send.mockResolvedValue({});
    const results: FlushResult[] = [];
    const off = onFlushResult((r) => results.push(r));

    await enqueue("test.kind", { chain: "a", key: "a:1" });
    await flushOutbox();
    off();

    expect(results.at(-1)).toMatchObject({ sent: 1, pendingAfter: 0, blocked: 0 });
  });
});

describe("flush — klasifikace chyb", () => {
  it("423 (uzavřený závod) položku NEZAHODÍ, označí ji blocked", async () => {
    // Reálný scénář ztráty dat: zápis v 15:00, uzavření v 16:00,
    // signál v 16:30. Zahození by znamenalo nenávratnou ztrátu.
    send.mockRejectedValue(new ApiError(423, { error: "race_closed" }, "423"));

    await enqueue("test.kind", { chain: "a", key: "a:1", value: "hodnocení" });
    await flushOutbox();

    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("blocked");
    expect((rows[0].payload as TestPayload).value).toBe("hodnocení");
  });

  it("401 (reset PINu) položku nechá jako blocked_auth", async () => {
    send.mockRejectedValue(new ApiError(401, {}, "401"));

    await enqueue("test.kind", { chain: "a", key: "a:1" });
    await flushOutbox();

    const rows = await items();
    expect(rows[0].status).toBe("blocked_auth");
  });

  it("jiné 4xx zahodí a nahlásí", async () => {
    send.mockRejectedValue(new ApiError(422, { error: "bad" }, "422"));
    const results: FlushResult[] = [];
    const off = onFlushResult((r) => results.push(r));

    await enqueue("test.kind", { chain: "a", key: "a:1" });
    await flushOutbox();
    off();

    expect(await items()).toHaveLength(0);
    expect(results.at(-1)?.dropped).toHaveLength(1);
  });

  it("5xx a síťová chyba nechají položku ve frontě k dalšímu pokusu", async () => {
    send.mockRejectedValue(new ApiError(500, {}, "500"));
    await enqueue("test.kind", { chain: "a", key: "a:1" });
    await flushOutbox();

    let rows = await items();
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);

    send.mockRejectedValue(new TypeError("Failed to fetch"));
    await flushOutbox();

    rows = await items();
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(2);
  });

  it("429 a 408 se také zkoušejí znovu", async () => {
    for (const status of [408, 429]) {
      await offlineDb.outbox.clear();
      send.mockRejectedValue(new ApiError(status, {}, String(status)));

      await enqueue("test.kind", { chain: "a", key: "a:1" });
      await flushOutbox();

      const rows = await items();
      expect(rows[0]?.status, `status ${status}`).toBe("pending");
    }
  });

  it("per-kind klasifikace přebije výchozí (409 jako konflikt)", async () => {
    send.mockRejectedValue(new ApiError(409, { error: "locked_by_other_device" }, "409"));

    await enqueue("test.follow", { chain: "a", key: "a:1" });
    await flushOutbox();

    const rows = await items();
    // bez override by 409 spadlo do „jiné 4xx" a položka by zmizela
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("blocked");
  });
});

describe("flush — pořadí v řetězci", () => {
  it("selhání první položky blokuje další ve stejném řetězci", async () => {
    // Konkrétní motivace: feedback.submit nesmí odejít bez posledního draftu.
    send.mockRejectedValueOnce(new ApiError(500, {}, "500")).mockResolvedValue({});

    await enqueue("test.kind", { chain: "patrol:1", key: "draft:1" });
    await enqueue("test.follow", { chain: "patrol:1", key: "submit:1" });

    await flushOutbox();

    expect(send).toHaveBeenCalledTimes(1);
    const rows = await items();
    expect(rows).toHaveLength(2);
  });

  it("selhání jednoho řetězce nezdrží jiný", async () => {
    send.mockImplementation(async (payload) => {
      if (payload.chain === "patrol:1") throw new ApiError(500, {}, "500");
      return {};
    });

    await enqueue("test.kind", { chain: "patrol:1", key: "a" });
    await enqueue("test.kind", { chain: "patrol:2", key: "b" });

    await flushOutbox();

    const rows = await items();
    expect(rows).toHaveLength(1);
    expect((rows[0].payload as TestPayload).chain).toBe("patrol:1");
  });

  it("po odblokování odejde zbytek řetězce ve správném pořadí", async () => {
    send.mockRejectedValueOnce(new ApiError(500, {}, "500")).mockResolvedValue({});

    await enqueue("test.kind", { chain: "patrol:1", key: "draft:1" });
    await enqueue("test.follow", { chain: "patrol:1", key: "submit:1" });
    await flushOutbox();

    await flushOutbox();

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1][0].key).toBe("draft:1");
    expect(send.mock.calls[2][0].key).toBe("submit:1");
    expect(await items()).toHaveLength(0);
  });
});

describe("zotavení z blocked stavů", () => {
  it("resumeAuthBlocked vrátí položky do fronty a odešle je", async () => {
    send.mockRejectedValue(new ApiError(401, {}, "401"));
    await enqueue("test.kind", { chain: "station:1", key: "a:1" });
    await flushOutbox();
    expect((await items())[0].status).toBe("blocked_auth");

    send.mockResolvedValue({});
    await resumeAuthBlocked("station:1");
    await flushOutbox();

    expect(await items()).toHaveLength(0);
  });

  it("resumeAuthBlocked se dotkne jen svého prefixu", async () => {
    send.mockRejectedValue(new ApiError(401, {}, "401"));
    await enqueue("test.kind", { chain: "station:1", key: "a:1" });
    await enqueue("test.kind", { chain: "station:2", key: "b:1" });
    await flushOutbox();

    await resumeAuthBlocked("station:1");

    const rows = await items();
    const byChain = Object.fromEntries(rows.map((r) => [r.chainKey, r.status]));
    expect(byChain["station:1"]).toBe("pending");
    expect(byChain["station:2"]).toBe("blocked_auth");
  });

  it("resumeBlocked vrátí konfliktní položky po převzetí locku", async () => {
    send.mockRejectedValue(new ApiError(409, {}, "409"));
    await enqueue("test.follow", { chain: "patrol:1", key: "a:1" });
    await flushOutbox();
    expect((await items())[0].status).toBe("blocked");

    send.mockResolvedValue({});
    await resumeBlocked("patrol:1");
    await flushOutbox();

    expect(await items()).toHaveLength(0);
  });
});

describe("clearOutbox", () => {
  it("smaže jen položky daného prefixu", async () => {
    send.mockRejectedValue(new Error("offline"));
    await enqueue("test.kind", { chain: "station:1", key: "a" });
    await enqueue("test.kind", { chain: "station:2", key: "b" });

    const removed = await clearOutbox("station:1");

    expect(removed).toBe(1);
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0].chainKey).toBe("station:2");
  });

  it("bez prefixu smaže celou frontu", async () => {
    send.mockRejectedValue(new Error("offline"));
    await enqueue("test.kind", { chain: "a", key: "a" });
    await enqueue("test.kind", { chain: "b", key: "b" });

    expect(await clearOutbox()).toBe(2);
    expect(await items()).toHaveLength(0);
  });
});
