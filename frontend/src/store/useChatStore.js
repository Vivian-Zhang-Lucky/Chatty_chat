import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import {encMessage, decMessage, decMyMessage } from "../lib/kybercrypto.js"

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
            if (msg.content?.encrypted && authUser?.email) {
              try {
                if (authUser._id === msg.senderId) {
                  const dec = await decMyMessage(selectedUser.publicKey, msg.content);
                  decryptedText = dec.message;
                } else {
                  const dec = await decMessage(authUser.email, msg.content);
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
      let encryptedMessage = null;
      if (plaintext) {
        encryptedMessage = await encMessage(selectedUser.publicKey, plaintext);
      }
      const payload = {
        senderId: authUser._id,
        receiverId: selectedUser._id,
        ...(plaintext && { content: encryptedMessage}),
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

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return console.warn("Socket not initialized");

    socket.on("newMessage", (newMessage) => {
      const isMessageSentFromSelectedUser =
        newMessage.senderId === selectedUser._id;
      if (!isMessageSentFromSelectedUser) return;

      set({
        messages: [...get().messages, newMessage],
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
