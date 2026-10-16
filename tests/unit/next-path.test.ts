import { describe, expect, it } from "vitest";

import { ADMIN_HOME, loginUrlFor, safeNextPath } from "@/lib/staff/next-path";

/**
 * The sign-in return path accepts only a same-origin path under /admin (docs/SECURITY-CHECKLIST.md §3;
 * docs/ENVIRONMENT-PARITY.md §7.7). Every forged shape falls back to /admin.
 */

describe("safeNextPath", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/", "/admin/"],
    ["/admin/staff", "/admin/staff"],
    ["/admin/support", "/admin/support"],
    ["/admin/support?view=refunds", "/admin/support?view=refunds"],
    ["%2Fadmin%2Fstaff", "/admin/staff"],
    ["/admin/support%3Fview%3Drefunds", "/admin/support?view=refunds"],
  ])("accepts %s as %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    ["an absolute URL", "https://evil.example/admin"],
    ["a protocol-relative URL", "//evil.example/admin"],
    ["a protocol-relative URL under /admin", "/admin//evil.example"],
    ["an encoded protocol-relative URL", "%2F%2Fevil.example"],
    ["a backslash host trick", "/admin\\evil.example"],
    ["an encoded backslash", "/admin%5Cevil.example"],
    ["a javascript: scheme", "javascript:alert(1)"],
    // The next four are stopped by the start anchor alone: no `//`, no backslash, no control character.
    ["a javascript: scheme that ends in /admin", "javascript:alert(1)/admin"],
    ["a mailto: scheme that ends in /admin", "mailto:x@evil.example/admin"],
    ["a host without a scheme", "evil.example/admin"],
    ["/admin as a later segment", "/checkout/admin/staff"],
    ["a path outside /admin", "/checkout"],
    ["a look-alike prefix", "/adminx"],
    ["a look-alike prefix with a path", "/administration/x"],
    ["a look-alike with a user-info sign", "/admin@evil.example"],
    ["a look-alike with a dot", "/admin.evil.example"],
    ["the sign-in page itself (a loop)", "/admin/login"],
    ["the sign-in page with a trailing slash", "/admin/login/"],
    ["the sign-in page with a query", "/admin/login?x=1"],
    ["the sign-in page with an error query", "/admin/login?error=revoked"],
    ["the sign-in page, encoded, with a query", "/admin/%6Cogin%3Fx%3D1"],
    ["the sign-in page with a nested next", "/admin/login?next=%252Fadmin"],
    ["the verification page", "/admin/login/verify"],
    ["the enrolment page", "/admin/login/enrol"],
    ["a sign-in sub-page with a query", "/admin/login/verify?next=%2Fadmin"],
    ["a dot segment", "/admin/../checkout"],
    ["an encoded dot segment", "/admin/%2e%2e/checkout"],
    ["a newline", "/admin/staff\nSet-Cookie: x"],
    ["an encoded newline", "/admin/staff%0ASet-Cookie"],
    ["a control character", "/admin/staff\u0001"],
    ["a null byte", "/admin/staff%00"],
    ["a fragment", "/admin/staff#x"],
    ["a space", "/admin/sta ff"],
    ["a malformed percent sequence", "/admin/%E0%A4%A"],
    ["an empty string", ""],
    ["an over-long path", `/admin/${"a".repeat(600)}`],
  ])("falls back to /admin for %s", (_label, input) => {
    expect(safeNextPath(input)).toBe(ADMIN_HOME);
  });

  it.each([
    [undefined],
    [null],
    [42],
    [["/admin/staff"]],
    [{ next: "/admin" }],
  ])("falls back to /admin for a non-string %j", (input) => {
    expect(safeNextPath(input)).toBe(ADMIN_HOME);
  });
});

describe("loginUrlFor", () => {
  it("omits next for the home and encodes a validated path otherwise", () => {
    expect(loginUrlFor("/admin")).toBe("/admin/login");
    expect(loginUrlFor(undefined)).toBe("/admin/login");
    expect(loginUrlFor("https://evil.example")).toBe("/admin/login");
    expect(loginUrlFor("/admin/support?view=refunds")).toBe(
      "/admin/login?next=%2Fadmin%2Fsupport%3Fview%3Drefunds",
    );
  });
});
