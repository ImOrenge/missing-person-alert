import * as admin from "firebase-admin";
import axios from "axios";
import * as crypto from "crypto";

export interface EncryptedContactEnvelope {
  algorithm: "AES-256-GCM";
  ciphertext: string;
  iv: string;
  authenticationTag: string;
  wrappedDataKey: string;
  kmsKeyVersion: string;
  last4: string | null;
}

const getKmsKeyName = (): string => (process.env.CONTACT_KMS_KEY_NAME || "").trim();

const lastFourDigits = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

export const encryptContact = async (contact: Record<string, unknown>): Promise<EncryptedContactEnvelope> => {
  const kmsKeyName = getKmsKeyName();
  if (!kmsKeyName) throw new Error("CONTACT_ENCRYPTION_UNAVAILABLE");

  const dataKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey, iv);
  const plaintext = Buffer.from(JSON.stringify(contact), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  const credential = admin.app().options.credential;
  if (!credential) throw new Error("CONTACT_ENCRYPTION_UNAVAILABLE");
  const accessToken = await credential.getAccessToken();
  const response = await axios.post(
    `https://cloudkms.googleapis.com/v1/${kmsKeyName}:encrypt`,
    {plaintext: dataKey.toString("base64")},
    {headers: {Authorization: `Bearer ${accessToken.access_token}`}, timeout: 10_000},
  );
  const wrappedDataKey = typeof response.data?.ciphertext === "string" ? response.data.ciphertext : "";
  if (!wrappedDataKey) throw new Error("CONTACT_ENCRYPTION_FAILED");

  return {
    algorithm: "AES-256-GCM",
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authenticationTag: authenticationTag.toString("base64"),
    wrappedDataKey,
    kmsKeyVersion: kmsKeyName,
    last4: lastFourDigits(contact.phone),
  };
};

export const decryptContact = async (envelope: EncryptedContactEnvelope): Promise<Record<string, unknown>> => {
  const credential = admin.app().options.credential;
  if (!credential || !envelope.kmsKeyVersion) throw new Error("CONTACT_DECRYPTION_UNAVAILABLE");
  const accessToken = await credential.getAccessToken();
  const response = await axios.post(
    `https://cloudkms.googleapis.com/v1/${envelope.kmsKeyVersion}:decrypt`,
    {ciphertext: envelope.wrappedDataKey},
    {headers: {Authorization: `Bearer ${accessToken.access_token}`}, timeout: 10_000},
  );
  const plaintextKey = typeof response.data?.plaintext === "string" ? Buffer.from(response.data.plaintext, "base64") : null;
  if (!plaintextKey || plaintextKey.length !== 32) throw new Error("CONTACT_DECRYPTION_FAILED");
  const decipher = crypto.createDecipheriv("aes-256-gcm", plaintextKey, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as Record<string, unknown>;
};
