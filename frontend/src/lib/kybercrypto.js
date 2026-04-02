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

async function aesGcmEncrypt(sharedKey, iv, array) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await deriveAesGcmKey(sharedKey, salt);

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        array
    );

    return { salt, ciphertext: new Uint8Array(encryptedBuffer) };
}

async function aesGcmDecrypt(sharedKey, salt, iv, array) {
    const aesKey = await deriveAesGcmKey(sharedKey, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        array
    );

    return decryptedBuffer;
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

    return {
        publicKey:u8ToBase64(publicKey),
        privateKey
    };
}

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
    const { salt, ciphertext: tag} =
        await aesGcmEncrypt(sharedSecret, iv, (new TextEncoder).encode(message));

    // Log values as Base64
    console.log("message:", message);
    console.log("pkey:", publicKey);
    console.log("shared:", u8ToBase64(sharedSecret));
    console.log("ct:", u8ToBase64(ct));
    console.log("iv:", u8ToBase64(iv));
    console.log("salt:", u8ToBase64(salt));
    console.log("encrypted:", u8ToBase64(tag));

    // Return Base64 values
    return {
        ct: u8ToBase64(ct),
        iv: u8ToBase64(iv),
        salt: u8ToBase64(salt),
        tag: u8ToBase64(tag)
    };
}

export async function encFile(publicKey, fileArray) {
    const fileU8= base64ToU8(fileArray);
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
    const { salt, ciphertext: tag} =
        await aesGcmEncrypt(sharedSecret, iv, fileU8);

    // Log values as Base64
    console.log("message:", u8ToBase64(fileU8));
    console.log("pkey:", publicKey);
    console.log("shared:", u8ToBase64(sharedSecret));
    console.log("ct:", u8ToBase64(ct));
    console.log("iv:", u8ToBase64(iv));
    console.log("salt:", u8ToBase64(salt));
    console.log("encrypted:", u8ToBase64(tag));

    // Return Base64 values
    return [{
        ct: u8ToBase64(ct),
        iv: u8ToBase64(iv),
        salt: u8ToBase64(salt)
    }, tag];
}

export async function decMessage(name, cipherText) {
    const skey = await getKey(name);
    if (!skey) throw new Error(`Private key for '${name}' not found`);

    console.log("name:", name);
    console.log("skey:", u8ToBase64(skey));

    console.log("ct:", cipherText.ct);
    console.log("encrypted:", cipherText.tag);
    console.log("iv:", cipherText.iv);

    const { sharedSecret } =
        await kem.decapsulate(base64ToU8(cipherText.ct), skey);

    console.log("shared:", u8ToBase64(sharedSecret));
    console.log("salt:", cipherText.salt);

    const decrypted = (new TextDecoder).decode(await aesGcmDecrypt(
        sharedSecret,
        base64ToU8(cipherText.salt),
        base64ToU8(cipherText.iv),
        base64ToU8(cipherText.tag)
    ));

    console.log("decrypted:", decrypted);

    return { message: decrypted };
}

export async function decFile(name, fileTag, tag) {
    const skey = await getKey(name);
    if (!skey) throw new Error(`Private key for '${name}' not found`);

    console.log("name:", name);
    console.log("skey:", u8ToBase64(skey));

    console.log("ct:", fileTag.ct);
    console.log("encrypted:", tag);
    console.log("iv:", fileTag.iv);

    const { sharedSecret } =
        await kem.decapsulate(base64ToU8(fileTag.ct), skey);

    console.log("shared:", u8ToBase64(sharedSecret));
    console.log("salt:", fileTag.salt);

    const decrypted = await aesGcmDecrypt(
        sharedSecret,
        base64ToU8(fileTag.salt),
        base64ToU8(fileTag.iv),
        tag
    );

    console.log("decrypted:", decrypted);

    return decrypted;
}

export async function encryptPrivateKeyWithPassword(privateKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    privateKey
  );

  return {
    encryptedPrivateKey: u8ToBase64(new Uint8Array(encryptedBuffer)),
    keySalt: u8ToBase64(salt),
    keyIv: u8ToBase64(iv),
  };
}

export async function decryptPrivateKeyWithPassword(
  encryptedPrivateKey,
  password,
  keySalt,
  keyIv
) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToU8(keySalt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToU8(keyIv) },
    aesKey,
    base64ToU8(encryptedPrivateKey)
  );

  return new Uint8Array(decryptedBuffer);
}

export async function restorePrivateKeyToIndexedDB(name, privateKey) {
  await setKey(name, privateKey);
}