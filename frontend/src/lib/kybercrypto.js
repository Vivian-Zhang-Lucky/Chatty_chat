import initKyber from "@dashlane/pqc-kem-kyber512-browser";

let kem= null;

export async function initKyberLib () {
    // Initialize the WebAssembly module
    try {
        if (!kem) {
            kem = await initKyber();
            if (!kem) throw new Error("Fail to init kyber.")
        }
    } catch (e) {
        throw new Error(e);
    }
}

export function u8ToBase64(u8) {
    return btoa(String.fromCharCode(...u8));
}

// Base64 → Uint8Array
export function base64ToU8(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
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
async function aesGcmEncrypt(sharedKey, iv, plaintext) {
    const key = await crypto.subtle.importKey(
        "raw",
        sharedKey,
        "AES-GCM",
        false,
        ["encrypt"]
    );

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plaintext)
    );

    return new Uint8Array(encryptedBuffer);
}

async function aesGcmDecrypt(sharedKey, iv, ciphertext) {
    const key = await crypto.subtle.importKey(
        "raw",
        sharedKey,
        "AES-GCM",
        false,
        ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
}

// Generate keypair
export async function generateKeyPair(name) {
    try {
        const {publicKey, privateKey} = await kem.keypair();
        await setKey(name, u8ToBase64(privateKey));

        console.log("Name:", name);
        console.log("skey:", privateKey);
        console.log("pkey:", publicKey);
        console.log("Private key saved successfully");

        return u8ToBase64(publicKey);
    } catch (e) {
        throw new Error(e);
    }
}

// Encrypt a message
export async function encMessage(publicKey, message) {
    try {
        let sharedSecret, ct;
        const cachedSecret = await getKey(publicKey);
        if (cachedSecret) {
            sharedSecret = base64ToU8(cachedSecret);
            ct = await getKey(cachedSecret);
        }
        if (!ct) {
            const { ciphertext, sharedSecret: ss} = await kem.encapsulate(base64ToU8(publicKey));
            sharedSecret = ss;
            ct = ciphertext;
            await setKey(publicKey, u8ToBase64(sharedSecret));
            await setKey(u8ToBase64(sharedSecret), u8ToBase64(ct));
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await aesGcmEncrypt(sharedSecret, iv, message);
        console.log("message:", message);
        console.log("pkey:", base64ToU8(publicKey));
        console.log("shared:", sharedSecret);
        console.log("ct:", ct);
        console.log("iv:", iv);
        console.log("encrypted:", encrypted);

        return {
            ct: u8ToBase64(ct),
            iv: u8ToBase64(iv),
            encrypted: u8ToBase64(encrypted)
        };
    } catch (e) {
        throw new Error(e);
    }
}

// Decrypt a message
export async function decMessage(name, cipherText) {
    try {
        const skey = await getKey(name);
        if (!skey) throw new Error(`Private key for '${name}' not found`);
        console.log("name:", name);
        console.log("skey:", base64ToU8(skey));

        console.log("ct:",base64ToU8(cipherText.ct));
        console.log("encrypted:",base64ToU8(cipherText.encrypted));
        console.log("iv:",base64ToU8(cipherText.iv));
        const {sharedSecret} = await kem.decapsulate(base64ToU8(cipherText.ct), base64ToU8(skey));
        console.log("shared:", sharedSecret);
        const decrypted = await aesGcmDecrypt(sharedSecret, base64ToU8(cipherText.iv), base64ToU8(cipherText.encrypted));

        console.log("decrypted:", decrypted);
        return {
            message: decrypted
        };
    } catch (e) {
        throw new Error(e);
    }
}

// Decrypt my message
export async function decMyMessage(publicKey, cipherText) {
    try {
        if (!publicKey) throw new Error(`SelectedUser's public key for not found`);

        const cachedSecret = await getKey(publicKey);
        if (!cachedSecret) throw new Error("Shared secret for this public key not found");
        console.log("publicKey:", publicKey);
        console.log("ct:",cipherText.ct);
        console.log("encrypted:",cipherText.encrypted);
        console.log("iv:",cipherText.iv);
        console.log("shared:", cachedSecret);
        const decrypted = await aesGcmDecrypt(base64ToU8(cachedSecret), base64ToU8(cipherText.iv), base64ToU8(cipherText.encrypted));

        console.log("decrypted:", decrypted);
        return {
            message: decrypted
        };
    } catch (e) {
        throw new Error(e);
    }
}
