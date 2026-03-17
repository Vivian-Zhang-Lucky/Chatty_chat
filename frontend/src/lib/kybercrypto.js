import initKyber from "@dashlane/pqc-kem-kyber512-browser";

let kem= null;

export async function initKyberLib () {
    // Initialize the WebAssembly module
    if (!kem) {
        kem = await initKyber();
        if (!kem) throw new Error("Fail to init kyber.")
    }
}

export function u8ToBase64(u8) {
    return btoa(String.fromCharCode(...u8));
}
export function base64ToU8(b64) {
    const binaryString = atob(b64);
    const u8 = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        u8[i] = binaryString.charCodeAt(i);
    }
    return u8;
}

// IndexedDB helpers for storing Uint8Array
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("MyCryptoDB", 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("keys")) {
                db.createObjectStore("keys");
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 *
 * @param {Uint8Array} name
 * @param {Uint8Array}value
 * @returns {Promise<unknown>}
 */
async function setKey(name, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readwrite");
        const store = tx.objectStore("keys");
        store.put(value, name);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 *
 * @param {Uint8Array}name
 * @returns {Promise<unknown>}
 */
async function getKey(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("keys", "readonly");
        const store = tx.objectStore("keys");
        const request = store.get(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}


// AES-GCM encryption/decryption helpers
/**
 *
 * @param {Uint8Array}sharedSecret
 * @param {Uint8Array}salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveAesGcmKey(sharedSecret, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        sharedSecret,
        "HKDF",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt,
            info: new TextEncoder().encode("AES-GCM key"),
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 *
 * @param {Uint8Array}sharedKey
 * @param {Uint8Array}iv
 * @param plaintext
 * @returns {Promise<{ciphertext: Uint8Array, salt: Uint8Array}>}
 */
async function aesGcmEncrypt(sharedKey, iv, plaintext) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await deriveAesGcmKey(sharedKey, salt);

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(plaintext)
    );

    return { salt, ciphertext: new Uint8Array(encryptedBuffer) };
}

/**
 *
 * @param {Uint8Array}sharedKey
 * @param {Uint8Array}salt
 * @param {Uint8Array}iv
 * @param {Uint8Array}ciphertext
 * @returns {Promise<string>}
 */
async function aesGcmDecrypt(sharedKey, salt, iv, ciphertext) {
    const aesKey = await deriveAesGcmKey(sharedKey, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
}

// Generate keypair
/**
 *
 * @param {string}name
 * @returns {Promise<string>}
 */
export async function generateKeyPair(name) {
    const {publicKey, privateKey} = await kem.keypair();

    await setKey(name, privateKey);

    console.log("Name:", name);
    console.log("skey:", u8ToBase64(privateKey)); // log Base64
    console.log("pkey:", u8ToBase64(publicKey));  // log Base64
    console.log("Private key saved successfully");

    return u8ToBase64(publicKey);
}

// Encrypt a message
/**
 *
 * @param {string}publicKey
 * @param {string}message
 * @returns {Promise<{ct: string, salt: string, encrypted: string, iv: string}>}
 */
export async function encMessage(publicKey, message) {
    let sharedSecret, ct;

    const cachedSecret = await getKey(base64ToU8(publicKey));

    if (cachedSecret !== undefined) {
        sharedSecret = cachedSecret;
        ct = await getKey(cachedSecret);
    }

    if (ct === undefined) {
        const { ciphertext, sharedSecret: ss } =
            await kem.encapsulate(base64ToU8(publicKey));

        sharedSecret = ss;
        ct = ciphertext;

        await setKey(base64ToU8(publicKey), sharedSecret);
        await setKey(sharedSecret, ct);
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const { salt, ciphertext: encrypted } =
        await aesGcmEncrypt(sharedSecret, iv, message);

    // Log values as Base64
    console.log("message:", message);
    console.log("pkey:", publicKey);
    console.log("shared:", u8ToBase64(sharedSecret));
    console.log("ct:", u8ToBase64(ct));
    console.log("iv:", u8ToBase64(iv));
    console.log("salt:", u8ToBase64(salt));
    console.log("encrypted:", u8ToBase64(encrypted));

    // Return Base64 values
    return {
        ct: u8ToBase64(ct),
        iv: u8ToBase64(iv),
        salt: u8ToBase64(salt),
        encrypted: u8ToBase64(encrypted)
    };
}

// Decrypt a message
/**
 *
 * @param {string}name
 * @param cipherText
 * @returns {Promise<{message: string}>}
 */
export async function decMessage(name, cipherText) {
    const skey = await getKey(name);
    if (!skey) throw new Error(`Private key for '${name}' not found`);

    console.log("name:", name);
    console.log("skey:", u8ToBase64(skey));

    console.log("ct:", cipherText.ct);
    console.log("encrypted:", cipherText.encrypted);
    console.log("iv:", cipherText.iv);

    const { sharedSecret } =
        await kem.decapsulate(base64ToU8(cipherText.ct), skey);

    console.log("shared:", u8ToBase64(sharedSecret));
    console.log("salt:", cipherText.salt);

    const decrypted = await aesGcmDecrypt(
        sharedSecret,
        base64ToU8(cipherText.salt),
        base64ToU8(cipherText.iv),
        base64ToU8(cipherText.encrypted)
    );

    console.log("decrypted:", decrypted);

    return { message: decrypted };
}

// Decrypt my message
/**
 *
 * @param {string}publicKey
 * @param cipherText
 * @returns {Promise<{message: string}>}
 */
export async function decMyMessage(publicKey, cipherText) {
    if (!publicKey) throw new Error(`SelectedUser's public key not found`);

    const cachedSecret = await getKey(base64ToU8(publicKey));
    if (!cachedSecret)
        throw new Error("Shared secret for this public key not found");

    console.log("publicKey:", publicKey);
    console.log("ct:", cipherText.ct);
    console.log("encrypted:", cipherText.encrypted);
    console.log("iv:", cipherText.iv);
    console.log("shared:", u8ToBase64(cachedSecret));
    console.log("salt:", cipherText.salt);

    const decrypted = await aesGcmDecrypt(
        cachedSecret,
        base64ToU8(cipherText.salt),
        base64ToU8(cipherText.iv),
        base64ToU8(cipherText.encrypted)
    );

    console.log("decrypted:", decrypted);

    return { message: decrypted };
}


export async function downloadPrivateKeyBackup(name) {
  try {
    const privateKey = await getKey(name);
    if (!privateKey) throw new Error("Private key not found");

    const backupData = {
      email: name,
      privateKey: u8ToBase64(privateKey),
      createdAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-private-key-backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    throw new Error(e.message || "Failed to download private key backup");
  }
}

export async function importPrivateKeyBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.email || !data.privateKey) {
      throw new Error("Invalid private key backup file");
    }

   // Convert Base64 back to Uint8Array before saving
    await setKey(data.email, base64ToU8(data.privateKey));

    console.log("Imported private key type:", typeof data.privateKey);
    console.log("Restored private key:", base64ToU8(data.privateKey));

    return {
      email: data.email,
      success: true,
    };
  } catch (e) {
    throw new Error(e.message || "Failed to import private key backup");
  }
}

export async function hasPrivateKey(name) {
  const privateKey = await getKey(name);
  return !!privateKey;
}