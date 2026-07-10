/**
 * Pure-logic unit tests for jupiterService — no real network calls.
 * `global.fetch` is stubbed per-test so these run offline and in CI.
 *
 * Run with: npm test --workspace=solana
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getQuote,
  getSwapTransaction,
  expectedPlatformFeeAmount,
  expectedUserReceiveAmount,
  JupiterApiError,
  JupiterConfigError,
} from "../src/jupiterService.js";
import type { JupiterQuoteResponse } from "../src/types.js";

const originalFetch = global.fetch;
const originalApiKey = process.env.JUPITER_API_KEY;

function mockFetchOnce(response: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  global.fetch = (async () => response) as unknown as typeof fetch;
}

const SAMPLE_QUOTE: JupiterQuoteResponse = {
  inputMint: "So11111111111111111111111111111111111111112",
  inAmount: "100000000",
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  outAmount: "17057460",
  otherAmountThreshold: "16886885",
  swapMode: "ExactIn",
  slippageBps: 100,
  priceImpactPct: "0.0001",
  platformFee: { amount: "25586", feeBps: 15 },
  routePlan: [],
  contextSlot: 324307186,
  timeTaken: 0.012,
};

describe("jupiterService", () => {
  beforeEach(() => {
    process.env.JUPITER_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.JUPITER_API_KEY;
    } else {
      process.env.JUPITER_API_KEY = originalApiKey;
    }
  });

  describe("config validation", () => {
    test("getQuote throws JupiterConfigError (not a crash) when JUPITER_API_KEY is missing", async () => {
      delete process.env.JUPITER_API_KEY;

      await assert.rejects(
        () =>
          getQuote({
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amount: 1_000_000,
          }),
        JupiterConfigError
      );
    });

    test("getSwapTransaction throws JupiterConfigError when platformFee is set but feeAccount is missing", async () => {
      await assert.rejects(
        () =>
          getSwapTransaction({
            quoteResponse: SAMPLE_QUOTE, // has platformFee set
            userPublicKey: "11111111111111111111111111111111",
            // feeAccount deliberately omitted
          }),
        JupiterConfigError
      );
    });
  });

  describe("getQuote", () => {
    test("parses a successful quote response correctly", async () => {
      mockFetchOnce({ ok: true, status: 200, json: async () => SAMPLE_QUOTE });

      const quote = await getQuote({
        inputMint: SAMPLE_QUOTE.inputMint,
        outputMint: SAMPLE_QUOTE.outputMint,
        amount: 100_000_000,
        platformFeeBps: 15,
      });

      assert.equal(quote.outAmount, SAMPLE_QUOTE.outAmount);
      assert.equal(quote.platformFee?.feeBps, 15);
    });

    test("throws a typed JupiterApiError (not a crash) on a Jupiter-side rejection", async () => {
      mockFetchOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Could not find any route", errorCode: "COULD_NOT_FIND_ANY_ROUTE" }),
      });

      await assert.rejects(
        () =>
          getQuote({
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "SomeIlliquidMintThatDoesNotTrade111111111111",
            amount: 1_000_000,
          }),
        (err: unknown) => {
          assert.ok(err instanceof JupiterApiError);
          assert.equal(err.status, 400);
          assert.match(err.message, /route/i);
          return true;
        }
      );
    });

    test("throws JupiterApiError even when the error response body isn't valid JSON", async () => {
      mockFetchOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      });

      await assert.rejects(
        () =>
          getQuote({
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amount: 1_000_000,
          }),
        (err: unknown) => {
          assert.ok(err instanceof JupiterApiError);
          assert.equal(err.status, 500);
          return true;
        }
      );
    });
  });

  describe("getSwapTransaction", () => {
    test("posts the correct body shape including feeAccount", async () => {
      let capturedBody: any;
      global.fetch = (async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ swapTransaction: "base64stub", lastValidBlockHeight: 12345 }),
        };
      }) as unknown as typeof fetch;

      const result = await getSwapTransaction({
        quoteResponse: SAMPLE_QUOTE,
        userPublicKey: "11111111111111111111111111111111",
        feeAccount: "22222222222222222222222222222222",
      });

      assert.equal(result.swapTransaction, "base64stub");
      assert.equal(capturedBody.userPublicKey, "11111111111111111111111111111111");
      assert.equal(capturedBody.feeAccount, "22222222222222222222222222222222");
      assert.deepEqual(capturedBody.quoteResponse, SAMPLE_QUOTE);
      // dynamicComputeUnitLimit/dynamicSlippage should default to true for
      // better transaction-landing behavior unless explicitly overridden.
      assert.equal(capturedBody.dynamicComputeUnitLimit, true);
      assert.equal(capturedBody.dynamicSlippage, true);
    });
  });

  describe("fee math helpers", () => {
    test("expectedPlatformFeeAmount computes bps of outAmount", () => {
      assert.equal(expectedPlatformFeeAmount("1000000", 15), 1500n);
      assert.equal(expectedPlatformFeeAmount(1_000_000n, 100), 10_000n);
    });

    test("expectedUserReceiveAmount subtracts the fee from outAmount", () => {
      assert.equal(expectedUserReceiveAmount("1000000", 15), 998_500n);
    });

    test("fee + user receipt reconstitute the original outAmount", () => {
      const outAmount = 17_057_460n;
      const feeBps = 15;
      const fee = expectedPlatformFeeAmount(outAmount, feeBps);
      const userReceives = expectedUserReceiveAmount(outAmount, feeBps);
      assert.equal(fee + userReceives, outAmount);
    });
  });
});