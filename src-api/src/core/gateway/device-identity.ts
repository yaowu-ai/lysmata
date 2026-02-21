// ── Deterministic Ed25519 identity ──────────────────────────────────────────
//
// Source: src/infra/device-identity.ts in the OpenClaw repo
//
// The Gateway's identity contract (from deriveDeviceIdFromPublicKey /
// verifyDeviceSignature / normalizeDevicePublicKeyBase64Url):
//
//   publicKey field  = base64url( raw_32_byte_ed25519_key )   ← NOT SPKI DER
//   device.id        = sha256( raw_32_byte_ed25519_key ).hex()
//   signature        = base64url( ed25519_sign(privateKey, payload) )
//
// If we send base64(SPKI_DER_44_bytes) as publicKey, the Gateway prepends
// its own 12-byte SPKI prefix → 12+44=56 bytes → invalid DER → parse error
// → "device signature invalid".
//
// Ed25519 SPKI DER = [12-byte prefix] + [32-byte raw key]  (44 bytes total)
// Ed25519 PKCS#8 v1 DER prefix (RFC 8410 §10.3):

import { createHash, createPrivateKey, createPublicKey } from 'crypto';
import type { KeyObject } from 'crypto';

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
// Ed25519 SPKI DER prefix length (matches device-identity.ts: "302a300506032b6570032100" = 12 bytes)
const ED25519_SPKI_PREFIX_LEN = 12;

export interface DeviceIdentity {
  id: string;
  privateKey: KeyObject;
  /** base64url of the raw 32-byte Ed25519 public key (NOT SPKI DER) */
  publicKeyBase64Url: string;
}

/** base64url-encode a Buffer (no + / =) */
export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

/** Cache: gateway URL → stable identity (lives for the process lifetime) */
const identityCache = new Map<string, DeviceIdentity>();

/**
 * Returns a stable Ed25519 identity derived deterministically from the
 * gateway URL. The same URL always yields the same device.id + key pair.
 *
 * Key format contract (from src/infra/device-identity.ts):
 *   - publicKey field  = base64url(raw_32_bytes)  — Gateway prepends SPKI prefix itself
 *   - device.id        = sha256(raw_32_bytes).hex()
 *   - signature        = base64url(sig_bytes)
 */
export function getOrCreateIdentity(url: string): DeviceIdentity {
  const cached = identityCache.get(url);
  if (cached) return cached;

  // Derive a deterministic 32-byte seed from the URL (stable across restarts)
  const seed = createHash('sha256').update(`openclaw-device-v1:${url}`).digest();
  const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);

  // Extract just the raw 32-byte key from SPKI DER (strip the 12-byte prefix)
  const spkiDer = (publicKey as KeyObject).export({ type: 'spki', format: 'der' }) as Buffer;
  const rawKey = spkiDer.subarray(ED25519_SPKI_PREFIX_LEN); // raw 32 bytes

  // device.id = sha256(raw_32_bytes).hex()
  const id = createHash('sha256').update(rawKey).digest('hex');

  // publicKey field = base64url(raw_32_bytes)  — NOT base64(SPKI_DER)
  const publicKeyBase64Url = base64UrlEncode(rawKey);

  const identity: DeviceIdentity = { id, privateKey, publicKeyBase64Url };
  identityCache.set(url, identity);
  return identity;
}
