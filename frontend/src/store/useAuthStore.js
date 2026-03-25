import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import {
  generateKeyPair,
  encryptPrivateKeyWithPassword,
  decryptPrivateKeyWithPassword,
  restorePrivateKeyToIndexedDB,
} from "../lib/kybercrypto.js";


const BASE_URL =
  import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");

      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      console.log("Error in checkAuth:", error);
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },



  signup: async (data) => {
    set({ isSigningUp: true });
  try {
    const { publicKey, privateKey } = await generateKeyPair(data.email);
    const { encryptedPrivateKey, keySalt, keyIv } =
      await encryptPrivateKeyWithPassword(privateKey, data.password);
      console.log("signup publicKey =", publicKey);
      console.log("signup encryptedPrivateKey =", encryptedPrivateKey);
      console.log("signup keySalt =", keySalt);
      console.log("signup keyIv =", keyIv);

    

    const payload = {
      ...data,
      publicKey,
      encryptedPrivateKey,
      keySalt,
      keyIv,
    };

    const res = await axiosInstance.post("/auth/signup", payload);
    set({ authUser: res.data });
    toast.success("Account created successfully.");
    get().connectSocket();
  } catch (error) {
    toast.error(error.response?.data?.message || error.message);
  } finally {
    set({ isSigningUp: false });
  }
  },

 login: async (data) => {
  set({ isLoggingIn: true });
  try {
    const res = await axiosInstance.post("/auth/login", data);
    const user = res.data;
    console.log("login response user =", user);
    console.log("has encryptedPrivateKey?", !!user.encryptedPrivateKey);
    console.log("has keySalt?", !!user.keySalt);
    console.log("has keyIv?", !!user.keyIv);
    if (user.encryptedPrivateKey && user.keySalt && user.keyIv) {
      const privateKey = await decryptPrivateKeyWithPassword(
        user.encryptedPrivateKey,
        data.password,
        user.keySalt,
        user.keyIv
      );
      await restorePrivateKeyToIndexedDB(user.email, privateKey);
    }
    set({ authUser: user})
    toast.success("Logged in successfully");
    get().connectSocket();
    return res.data;
  } catch (error) {
    toast.error(error.response?.data?.message || error.message);
    throw error;
  } finally {
    set({ isLoggingIn: false });
  }
},

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("error in update profile:", error);
      toast.error(error.response.data.message);
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  connectSocket: () => {
    const { authUser } = get();
    if (!authUser || get().socket?.connected) return;

    const socket = io(BASE_URL, {
      query: {
        userId: authUser._id,
      },
    });
    socket.connect();

    set({ socket: socket });

    socket.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });
  },
  disconnectSocket: () => {
    if (get().socket?.connected) get().socket.disconnect();
  },

  
}));
