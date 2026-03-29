import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import {encMessage, decMessage, encFile, decFile, base64ToU8} from "../lib/kybercrypto.js";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      if (res?.data) set({ users: res.data });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load users");
      console.error("getUsers error:", error);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    const { selectedUser } = get();
    if (!selectedUser) return toast.error("Select a user first");
    set({ isMessagesLoading: true});
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      if (!res?.data) {
        console.warn("getMessages: empty response", res);
        set({ messages: []});
        return;
      }
      const { authUser } = useAuthStore.getState();
      const decryptedMessages = await Promise.all(
          res.data.map(async (msg) => {
            let decryptedText= null;
            let imageDataURL;

            // if (msg.content?.encrypted && authUser?.email) {
            if (authUser?.email) {
              try {
                if (authUser._id === msg.senderId) {
                  if (msg.senderContent) {
                    //   const dec = await decMyMessage(selectedUser.publicKey, msg.content);
                    const dec = await decMessage(authUser.email, msg.senderContent);
                    decryptedText = dec.message;
                  }
                  if (msg.senderFileTag) {
                    const response = await fetch(msg.senderFileTag.src);
                    const buffer = await response.arrayBuffer();
                    const image = await decFile(authUser.email, msg.senderFileTag, new Uint8Array(buffer));
                    const imageBlob = new Blob([image], {type: msg.senderFileTag.fileType});
                    imageDataURL = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.readAsDataURL(imageBlob);
                    });
                  }
                } else {
                  if (msg.receiverContent) {
                    const dec = await decMessage(authUser.email, msg.receiverContent);
                    decryptedText = dec.message;
                  }
                  if (msg.receiverFileTag) {
                    const response = await fetch(msg.receiverFileTag.src);
                    const buffer = await response.arrayBuffer();
                    const image= await decFile(authUser.email, msg.receiverFileTag, new Uint8Array(buffer));
                    const imageBlob = new Blob([image], {type: msg.receiverFileTag.fileType});
                    imageDataURL = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.readAsDataURL(imageBlob);
                    });
                  }
                }
                console.log(decryptedText);
                
              } catch (e) {
                console.error("Failed to decrypt message:", msg, e);
              }
            }
            return { ...msg, text: decryptedText, image: imageDataURL};
          })
      )
      set({ messages: decryptedMessages});
    } catch (error) {
      toast.error(error?.response?.data?.message);
    } finally {
      set({ isMessagesLoading: false});
    }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    if (!selectedUser) return toast.error("Select a user first");
    try {
      const { authUser } = useAuthStore.getState();
      const plaintext = messageData.text?.trim();
      // let encryptedMessage = null;
      let receiverEncrypted = null;
      let senderEncrypted = null;
      if (plaintext) {
        // encryptedMessage = await encMessage(selectedUser.publicKey, plaintext);
        receiverEncrypted = await encMessage(selectedUser.publicKey, plaintext);
        senderEncrypted = await encMessage(authUser.publicKey, plaintext);
      }
      const imageURL = messageData.image;
      console.log("imageURL: ", imageURL);
      let receiverInfo= null;
      let receiverImage = null;
      let senderInfo= null;
      let senderImage = null;
      if (imageURL) {
        // handle url and get image data, filename and type
        const matches = imageURL.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid imageURL");
        const contentType = matches[1];
        const image64= matches[2];
        const fileName = `upload_${Date.now()}`;

        // image encryption by receiver's key
        [receiverInfo, receiverImage] = await encFile(selectedUser.publicKey, image64);
        // fetch cloud upload url
        const responseRec = await axiosInstance.get('/messages/upload', {params: {fileName: fileName}});
        const dataRec = responseRec.data;
        const formRec = new FormData();
        const fileBlobRec = new Blob([receiverImage], {type: 'application/octet-stream'});
        formRec.append("file", fileBlobRec, fileName);
        console.log("filename:", fileName);
        formRec.append("api_key", dataRec.apiKey);
        formRec.append("timestamp", dataRec.timestamp);
        formRec.append("signature", dataRec.signature);
        formRec.append("public_id", dataRec.publicId);
        // upload encrypted image to cloud
        const resUpload = await fetch(dataRec.uploadEndpoint, {
          method: "POST",
          body: formRec
        });
        if (!resUpload.ok) {
          const result = await resUpload.json();
          throw Error("upload failed: ", result);
        }
        receiverInfo.src = dataRec.finalFileUrl;
        receiverInfo.fileType = contentType;
        receiverInfo.fileName = fileName;
        receiverInfo.fileSize = receiverImage.length;

        // image encryption by sender's key
        [senderInfo, senderImage] = await encFile(authUser.publicKey, image64);
        // fetch cloud upload url
        const responseSen= await axiosInstance.get('/messages/upload', {params: {fileName: fileName}});
        const dataSen = responseSen.data;
        const formSen = new FormData();
        const fileBlobSen= new Blob([senderImage], {type: 'application/octet-stream'});
        formSen.append("file", fileBlobSen, fileName);
        formSen.append("api_key", dataSen.apiKey);
        formSen.append("timestamp", dataSen.timestamp);
        formSen.append("signature", dataSen.signature);
        formSen.append("public_id", dataSen.publicId);
        // upload encrypted image to cloud
        const resUploadSen = await fetch(dataSen.uploadEndpoint, {
          method: "POST",
          body: formSen
        });
        if (!resUploadSen.ok) {
          const result = await resUploadSen.json();
          throw Error("upload failed: ", result);
        }
        senderInfo.src = dataSen.finalFileUrl;
        senderInfo.fileType = contentType;
        senderInfo.fileName = fileName;
        senderInfo.fileSize = senderImage.length;
      }

      // splice the payload for sending
      const payload = {
        senderId: authUser._id,
        receiverId: selectedUser._id,
        ...(plaintext && 
          { 
            // content: encryptedMessage
            receiverContent: receiverEncrypted,
            senderContent: senderEncrypted,
          }),
        ...(imageURL &&
          {
            receiverFileTag: receiverInfo,
            senderFileTag: senderInfo,
          }),
      };
      console.log(payload);
      // send info to server and store it in db
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
          payload
      );
      if (!res?.data) throw new Error("Invalid response from server");
      set({ messages: [...messages,
          {
            ...res.data,
            text: plaintext,
            image: imageURL,
          },], });
    } catch (error) {
      toast.error(error.response?.data?.message || error.messages || "Failed to send messages");
      console.error("sendMessage error", error);
    }
  },

  // BUG FIX:
// Previously, realtime messages received via socket were directly appended to the
// messages state without being decrypted. Since the UI renders message.text,
// the encrypted message content had no text field, resulting in an empty message
// bubble being displayed until the page was refreshed.
//
// The page refresh worked because getMessages() decrypts all historical messages
// before setting them into state. However, realtime messages bypassed this logic.
//
// Fix:
// 1. Decrypt the incoming message content using decMessage()
// 2. Map the decrypted result into the "text" field
// 3. Append the processed message to the messages state
//
// This ensures realtime messages are immediately readable without requiring a page refresh.
  subscribeToMessages: () => {
  const socket = useAuthStore.getState().socket;
  if (!socket) return console.warn("Socket not initialized");

  // Avoid duplicate bindings
  socket.off("newMessage");

  socket.on("newMessage", async (newMessage) => {
    const { authUser } = useAuthStore.getState();
    const { selectedUser, messages } = get();

    if (!selectedUser || !authUser) return;

    // Only process messages from the current chat partner
    const isMessageSentFromSelectedUser =
      newMessage.senderId === selectedUser._id;

    if (!isMessageSentFromSelectedUser) return;

    let decryptedText = null;

    try {
     if (authUser?.email) {
      const dec = await decMessage(authUser.email, newMessage.receiverContent);
      decryptedText = dec.message;
}
    } catch (e) {
      console.error("Failed to decrypt realtime message:", newMessage, e);
    }

    set({
      messages: [
        ...messages,
        {
          ...newMessage,
          text: decryptedText,
        },
      ],
    });
  });
},

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
