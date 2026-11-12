/**
 * The session cookie must work on a plain-HTTP LAN install (docs/SELF_HOSTING.md → Local-only):
 * `Secure` is only set when the request came in over HTTPS (hooks.server.ts passes
 * `event.url.protocol === 'https:'`; behind Caddy that protocol comes from PROTOCOL_HEADER).
 */
import { describe, expect, test } from "bun:test";
import type { Cookies } from "@sveltejs/kit";
import { clearSessionCookie, setSessionCookie } from "./cookie";
import { SESSION_COOKIE } from "./session";

type Call = {
  op: "set" | "delete";
  name: string;
  value?: string;
  opts: Record<string, unknown>;
};

function fakeCookies(calls: Call[]): Cookies {
  return {
    set: (name: string, value: string, opts: Record<string, unknown>) =>
      calls.push({ op: "set", name, value, opts }),
    delete: (name: string, opts: Record<string, unknown>) =>
      calls.push({ op: "delete", name, opts }),
  } as unknown as Cookies;
}

const secureFor = (origin: string) => new URL(origin).protocol === "https:";

describe("session cookie flags", () => {
  test("plain-HTTP LAN origin → not Secure (browsers would drop a Secure cookie over http)", () => {
    const calls: Call[] = [];
    setSessionCookie(
      fakeCookies(calls),
      "tok",
      new Date(Date.now() + 1000),
      secureFor("http://192.168.1.10"),
    );
    expect(calls[0]).toMatchObject({
      op: "set",
      name: SESSION_COOKIE,
      value: "tok",
    });
    expect(calls[0].opts).toMatchObject({
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  test("HTTPS origin (public or LAN with tls internal) → Secure", () => {
    const calls: Call[] = [];
    setSessionCookie(
      fakeCookies(calls),
      "tok",
      new Date(Date.now() + 1000),
      secureFor("https://logbook.internal"),
    );
    expect(calls[0].opts.secure).toBe(true);
  });

  test("clearing uses the same flags", () => {
    const calls: Call[] = [];
    clearSessionCookie(fakeCookies(calls), secureFor("http://logbook.local"));
    expect(calls[0]).toMatchObject({ op: "delete", name: SESSION_COOKIE });
    expect(calls[0].opts).toMatchObject({
      secure: false,
      httpOnly: true,
      path: "/",
    });
  });
});
