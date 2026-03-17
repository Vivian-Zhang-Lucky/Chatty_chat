import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { encMessage, decMessage } from "../lib/kybercrypto.js";

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

            // if (msg.content?.encrypted && authUser?.email) {
            if (authUser?.email) {
              try {
                if (authUser._id === msg.senderId) {
                //   const dec = await decMyMessage(selectedUser.publicKey, msg.content);
                  const dec = await decMessage(authUser.email, msg.senderContent);
                  decryptedText = dec.message;
                } else {
                  const dec = await decMessage(authUser.email, msg.receiverContent);
                  decryptedText = dec.message;
                }
                console.log(decryptedText);
                
              } catch (e) {
                console.error("Failed to decrypt message:", msg, e);
              }
            }
            return { ...msg, text: decryptedText};
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
      const payload = {
        senderId: authUser._id,
        receiverId: selectedUser._id,
        ...(plaintext && 
          { 
            // content: encryptedMessage
            receiverContent: receiverEncrypted,
            senderContent: senderEncrypted,
          }),
        ...(messageData.image && { image: messageData.image }),
      };
      console.log(payload);
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
          payload
      );
      if (!res?.data) throw new Error("Invalid response from server");
      set({ messages: [...messages,
          {
            ...res.data,
            text: plaintext,
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
