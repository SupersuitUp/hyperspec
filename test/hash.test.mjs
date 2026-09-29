import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256, canonical } from "../src/hash.mjs";

test("sha256 of a known string matches the known digest", () => {
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sha256 hashes exact bytes: a Buffer and its equal string hash the same", () => {
  assert.equal(sha256(Buffer.from("abc")), sha256("abc"));
});

test("canonical sorts nested keys regardless of input order", () => {
  const a = canonical({ b: 1, a: { d: 2, c: 3 } });
  const b = canonical({ a: { c: 3, d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":3,"d":2},"b":1}');
});

test("canonical is stable across repeated calls on the same value", () => {
  const value = { z: [3, 2, 1], a: { y: 1, x: 2 } };
  assert.equal(canonical(value), canonical(value));
});

test("canonical keeps array order rather than sorting array elements", () => {
  assert.equal(canonical({ list: [3, 1, 2] }), '{"list":[3,1,2]}');
});

test("canonical drops undefined-valued keys", () => {
  assert.equal(canonical({ a: 1, b: undefined }), '{"a":1}');
});

test("canonical emits no whitespace", () => {
  assert.equal(canonical({ a: 1, b: [1, 2] }), '{"a":1,"b":[1,2]}');
});
