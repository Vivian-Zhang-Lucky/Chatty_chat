import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import {encMessage, decMessage, decFile, encFile} from "../lib/kybercrypto.js";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  // if you generate new message, it automatically generates the unique uuid and later store it in database
  // so be careful when using this function
  generateMessage: (msg) => {
    const id = crypto.randomUUID();
    set(state => ({messages: [
        ...state.messages,
        {
          ...msg ,
          id: id,
        },
    ],}));
    return id;
  },

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
          let decryptedText = null;
          let imageDataURL;
          let fileName, fileProgress, fileState;

          // if (msg.content?.encrypted && authUser?.email) {
          if (authUser?.email) {
            try {
              if (msg.msgType === "text") {
                let msgTextTag;
                if (authUser._id === msg.senderId) {
                  msgTextTag = msg.textTag.senderTextTag;
                } else {
                  msgTextTag = msg.textTag.receiverTextTag;
                }
                const dec = await decMessage(authUser.email, msgTextTag);
                decryptedText = dec.message;
              } else if (msg.msgType === "image") {
                let msgImageTag;
                if (authUser._id === msg.senderId) {
                  msgImageTag = msg.imageTag.senderImageTag;
                } else {
                  msgImageTag = msg.imageTag.receiverImageTag;
                }
                const response = await fetch(msgImageTag.src);
                const buffer = await response.arrayBuffer();
                const image = await decFile(authUser.email, msgImageTag, new Uint8Array(buffer));
                const imageBlob = new Blob([image], {type: msgImageTag.fileType});
                imageDataURL = await new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.readAsDataURL(imageBlob);
                });
              } else if (msg.msgType === "file") {
                let msgFileTag;
                if (authUser._id === msg.senderId) {
                  msgFileTag= msg.fileTag;
                } else {
                  msgFileTag= msg.fileTag;
                }
                fileName = msgFileTag.fileName;
                fileProgress = 0;
                fileState = "idle";
              }
              console.log(msg);

            } catch (e) {
              console.error("Failed to decrypt message:", msg, e);
            }
          }
          return {
            ...msg,
            ...(decryptedText && {text: decryptedText,}),
            ...(imageDataURL && {image: imageDataURL,}),
            ...(fileName && { fileName: fileName, fileProgress: fileProgress, fileState: fileState,}),
          };
        })
      );
      set({ messages: decryptedMessages});
    } catch (error) {
      toast.error(error?.response?.data?.message);
    } finally {
      set({ isMessagesLoading: false});
    }
  },

  updateMsgBlob: (msgId, blob) => {
    set(state => ({ messages: state.messages.map(msg => {
        if (msg.id === msgId) {
          return {
            ...msg,
            blob: blob,
          };
        }
        return msg;
      })
    }));
  },

  updateMsgProgress: (msgId, progress) => {
    set(state => ({ messages: state.messages.map(msg => {
      if (msg.id === msgId) {
        let fileState;
        if (progress < 100 && progress >= 0)fileState= "loading...";
        else if (progress === 100)fileState= "finished";
        else fileState= "failed";
        return {
          ...msg,
          fileProgress: progress,
          fileState: fileState,
        };
      }
      return msg;
      })
    }));
  },

  downloadFile: async (msg) => {
    if (msg.msgType !== "file") return;
    if (msg.fileState === "loading...") return;
    try {
      let msgFileTag;
      if (useAuthStore.getState().authUser._id === msg.senderId) {
        msgFileTag = msg.fileTag.senderFileTag;
      } else msgFileTag = msg.fileTag.receiverFileTag;
      get().updateMsgProgress(msg.id, 0);
      const response = await fetch(msgFileTag.src);
      get().updateMsgProgress(msg.id, 40);
      const buffer = await response.arrayBuffer();
      const file = await decFile(useAuthStore.getState().authUser.email, msgFileTag, new Uint8Array(buffer));
      get().updateMsgProgress(msg.id, 80);
      msg.blob = new Blob([file], {type: msgFileTag.fileType});
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(msg.blob);
      });
      get().updateMsgBlob(msg.id, msg.blob);
      get().updateMsgProgress(msg.id, 100);
    } catch (error) {
      toast.error(error?.response?.data?.message);
    }
  },

  sendFile: async (msg) => {
    const { selectedUser} = get();
    if (!selectedUser) return toast.error("Select a user first");
    const { authUser } = useAuthStore.getState();
    // handle data and get file
    const file = msg.file;
    if (!file) return toast.error("File is null");
    const fileName = `${file.name}_${Date.now()}`;
    try {
      const contentType = file.type;
      msg.id = get().generateMessage({
        msgType: "file",
        senderId: authUser._id,
        receiverId: selectedUser._id,
        fileType:contentType,
        fileName:fileName,
        fileSize:file.size,
      });
      get().updateMsgProgress(msg.id, 0);

      // didn't do chunks but just treat it as one chunk
      const file64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          resolve(dataUrl.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // file encryption by receiver's key
      const [receiverInfo, receiverFile] = await encFile(selectedUser.publicKey, file64);
      get().updateMsgProgress(msg.id, 20);

      // fetch cloud upload url
      const responseRec = await axiosInstance.get('/messages/upload', {params: {fileName: fileName}});
      const dataRec = responseRec.data;
      const formRec = new FormData();
      const fileBlobRec = new Blob([receiverFile], {type: 'application/octet-stream'});
      formRec.append("file", fileBlobRec, fileName);
      console.log("filename:", fileName);
      formRec.append("api_key", dataRec.apiKey);
      formRec.append("timestamp", dataRec.timestamp);
      formRec.append("signature", dataRec.signature);
      formRec.append("public_id", dataRec.publicId);
      get().updateMsgProgress(msg.id, 30);

      // upload encrypted image to cloud
      const resUpload = await fetch(dataRec.uploadEndpoint, {
        method: "POST",
        body: formRec
      });
      if (!resUpload.ok) {
        const result = await resUpload.json();
        console.error("upload failed: " + JSON.stringify(result));
        return;
      }
      receiverInfo.src = dataRec.finalFileUrl;
      get().updateMsgProgress(msg.id, 50);

      // image encryption by sender's key
      const [senderInfo, senderFile] = await encFile(authUser.publicKey, file64);
      get().updateMsgProgress(msg.id, 70);

      // fetch cloud upload url
      const responseSen= await axiosInstance.get('/messages/upload', {params: {fileName: fileName}});
      const dataSen = responseSen.data;
      const formSen = new FormData();
      const fileBlobSen= new Blob([senderFile], {type: 'application/octet-stream'});
      formSen.append("file", fileBlobSen, fileName);
      formSen.append("api_key", dataSen.apiKey);
      formSen.append("timestamp", dataSen.timestamp);
      formSen.append("signature", dataSen.signature);
      formSen.append("public_id", dataSen.publicId);
      get().updateMsgProgress(msg.id, 80);

      // upload encrypted image to cloud
      const resUploadSen = await fetch(dataSen.uploadEndpoint, {
        method: "POST",
        body: formSen
      });
      if (!resUploadSen.ok) {
        const result = await resUploadSen.json();
        console.error("upload failed: " + JSON.stringify(result));
        return;
      }
      senderInfo.src = dataSen.finalFileUrl;
      get().updateMsgProgress(msg.id, 90);

      // splice the payload for sending
      const payload = {
        id: msg.id,
        msgType: "file",
        senderId: authUser._id,
        receiverId: selectedUser._id,
        fileTag: {
          receiverFileTag: receiverInfo,
          senderFileTag: senderInfo,
          fileName: fileName,
          fileType: contentType,
          fileSize: file.size,
        },
      };
      console.log(payload);
      // send info to server and store it in db
      const res = await axiosInstance.post(
          `/messages/send/${selectedUser._id}`,
          payload
      );
      if (!res?.data) {
        console.error("Invalid response from server");
        return;
      }
      msg.fileTag = payload.fileTag;
      get().updateMsgProgress(msg.id, 100);
    } catch (error) {
      get().updateMsgProgress(msg.id, -1);
      toast.error(error.response?.data?.message || error.messages || "Failed to send the file");
      console.error("sendFile error", error);
    }
  },

  sendImage: async (msg) => {
    const { authUser } = useAuthStore.getState();
    const { selectedUser} = get();
    if (!selectedUser) return toast.error("Select a user first");
    try {
      const image = msg.image;
      console.log("imageURL: ", image);
      msg.id = get().generateMessage({
        msgType: "image",
        senderId: authUser._id,
        receiverId: selectedUser._id,
        image: image,
      });
      // handle url and get image data, filename and type
      const matches = image.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        console.error("Invalid imageURL");
        return;
      }
      const contentType = matches[1];
      const image64 = matches[2];
      const fileName = `upload_${Date.now()}`;
      const fileSize = image64.length * 3 / 4;

      // image encryption by receiver's key
      const [receiverInfo, receiverImage] = await encFile(selectedUser.publicKey, image64);
      receiverInfo.fileType = contentType;
      receiverInfo.fileName = fileName;
      receiverInfo.fileSize = receiverImage.length;
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
        console.error("upload failed: " + JSON.stringify(result));
        return;
      }
      receiverInfo.src = dataRec.finalFileUrl;

      // image encryption by sender's key
      const [senderInfo, senderImage] = await encFile(authUser.publicKey, image64);
      senderInfo.fileType = contentType;
      senderInfo.fileName = fileName;
      senderInfo.fileSize = senderImage.length;
      // fetch cloud upload url
      const responseSen = await axiosInstance.get('/messages/upload', {params: {fileName: fileName}});
      const dataSen = responseSen.data;
      const formSen = new FormData();
      const fileBlobSen = new Blob([senderImage], {type: 'application/octet-stream'});
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
        console.error("upload failed: " + JSON.stringify(result));
        return;
      }
      senderInfo.src = dataSen.finalFileUrl;

      // splice the payload for sending
      const payload = {
        id: msg.id,
        msgType: "image",
        senderId: authUser._id,
        receiverId: selectedUser._id,
        imageTag: {
          fileName: fileName,
          fileType: contentType,
          fileSize: fileSize,
          receiverImageTag: receiverInfo,
          senderImageTag: senderInfo,
        }
      };
      console.log(payload);
      // send info to server and store it in db
      const res = await axiosInstance.post(
          `/messages/send/${selectedUser._id}`,
          payload
      );
      if (!res?.data) {
        console.error("Invalid response from server");
      }
      msg.imageTag = payload.imageTag;
    } catch (error) {
      toast.error(error.response?.data?.message || error.messages || "Failed to send messages");
      console.error("sendMessage error", error);
    }
  },

  sendText: async (msg) => {
    const { authUser } = useAuthStore.getState();
    const { selectedUser } = get();
    if (!selectedUser) return toast.error("Select a user first");
    try {
      const plaintext = msg.text?.trim();
      msg.id = get().generateMessage({
        msgType: "text",
        senderId: authUser._id,
        receiverId: selectedUser._id,
        text: plaintext,
      });
      const receiverText = await encMessage(selectedUser.publicKey, plaintext);
      const senderText = await encMessage(authUser.publicKey, plaintext);
      // splice the payload for sending
      const payload = {
        id: msg.id,
        msgType: "text",
        senderId: authUser._id,
        receiverId: selectedUser._id,
        textTag: {
          receiverTextTag: receiverText,
          senderTextTag: senderText,
        }
      };
      console.log(payload);
      // send info to server and store it in db
      const res = await axiosInstance.post(
          `/messages/send/${selectedUser._id}`,
          payload
      );
      if (!res?.data) {
        console.error("Invalid response from server");
      }
      msg.textTag = payload.textTag;
    } catch (error) {
      toast.error(error.response?.data?.message || error.messages || "Failed to send messages");
      console.error("sendMessage error", error);
    }
  },

  sendMessage: async (msg) => {
    const { selectedUser} = get();
    if (!selectedUser) return toast.error("Select a user first");
    if (msg.text) {
      void get().sendText(msg);
      return;
    }
    if (msg.image) {
      void get().sendImage(msg);
      return;
    }
    if (msg.file) {
      void get().sendFile(msg);
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
    const { selectedUser } = get();

    if (!selectedUser || !authUser) return;

    // Only process messages from the current chat partner
    const isMessageSentFromSelectedUser =
      newMessage.senderId === selectedUser._id;

    if (!isMessageSentFromSelectedUser) return;

    let decryptedText = null;

    try {
     if (authUser?.email) {
      const {decrypted} = await decMessage(authUser.email, newMessage.textTag.receiverTextTag);
      decryptedText = decrypted;
}
    } catch (e) {
      console.error("Failed to decrypt realtime message:", newMessage, e);
    }

    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...newMessage,
          text: decryptedText,
        },
      ],
    }));
  });
},

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
