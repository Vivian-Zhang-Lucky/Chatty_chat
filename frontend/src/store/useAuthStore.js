import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
// import {generateKeyPair} from "../lib/kybercrypto.js"
import {
  generateKeyPair,
  downloadPrivateKeyBackup,
  hasPrivateKey,
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


// SECURITY NOTE:
// The private key is never sent to the server.
// It is stored locally in IndexedDB and a backup copy
// is downloaded to the user's device for recovery
// when switching browsers or devices.
  signup: async (data) => {
    set({ isSigningUp: true });
  try {
    data.publicKey = await generateKeyPair(data.email);

    const res = await axiosInstance.post("/auth/signup", data);
    set({ authUser: res.data });

    // 注册成功后自动下载私钥备份
    await downloadPrivateKeyBackup(data.email);

    toast.success("Account created successfully. Your private key backup has been downloaded.");
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
    set({ authUser: res.data });
    toast.success("Logged in successfully");

    get().connectSocket();
    // 检查当前浏览器是否有私钥
    const hasKey = await get().checkPrivateKeyExists(data.email);

    if (!hasKey) {
      toast.error("Private key not found in this browser. Please upload your backup key.");
      console.warn("Private key missing for this browser session");
    }

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

  checkPrivateKeyExists: async (email) => {
  try {
    return await hasPrivateKey(email);
  } catch (error) {
    console.log("Error checking private key:", error);
    return false;
  }
  },
}));
