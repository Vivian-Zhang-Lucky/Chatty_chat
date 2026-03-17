import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { hasPrivateKey, importPrivateKeyBackup } from "../lib/kybercrypto.js";
import toast from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedUser } = useChatStore();
  const { authUser } = useAuthStore();

  const [showKeyUpload, setShowKeyUpload] = useState(false);
  const [selectedKeyFile, setSelectedKeyFile] = useState(null);

   useEffect(() => {
    const checkKey = async () => {
      try {
        if (!authUser?.email) return;

        const exists = await hasPrivateKey(authUser.email);

        if (!exists) {
          toast.error(
            "Private key not found in this browser. Please upload your backup key file."
          );
          setShowKeyUpload(true);
        }
      } catch (error) {
        console.error("Error checking private key:", error);
      } finally {
        setIsCheckingKey(false);
      }
    };

    checkKey();
  }, [authUser?.email]);

  const handleKeyUpload = async () => {
    if (!selectedKeyFile) {
      toast.error("Please select a private key backup file");
      return;
    }

    try {
      const result = await importPrivateKeyBackup(selectedKeyFile);

      if (result.email !== authUser.email) {
        toast.error("This key file does not belong to the current user");
        return;
      }

      toast.success("Private key restored successfully");
      setShowKeyUpload(false);
      setSelectedKeyFile(null);

      // Reload so crypto context / message decryption can reinitialize
      window.location.reload();
    } catch (error) {
      toast.error(error.message || "Failed to restore private key");
    }
  };

  return (
    <div className="h-screen bg-base-200">
        {showKeyUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-base-100 p-6 rounded-xl shadow-xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-3">Upload Private Key Backup</h2>
            <p className="text-sm text-base-content/70 mb-4">
              This browser does not contain your private key. Please upload your
              backup key file to continue decrypting messages.
            </p>

            <input
              type="file"
              accept=".json"
              className="file-input file-input-bordered w-full mb-4"
              onChange={(e) => setSelectedKeyFile(e.target.files[0])}
            />

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowKeyUpload(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleKeyUpload}
              >
                Upload Key
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="flex items-center justify-center pt-20 px-4">
        <div className="bg-base-100 rounded-lg shadow-cl w-full max-w-6xl h-[calc(100vh-8rem)]">
          <div className="flex h-full rounded-lg overflow-hidden">
            <Sidebar />

            {!selectedUser ? <NoChatSelected /> : <ChatContainer />}
          </div>
        </div>
      </div>
    </div>
  );
};
export default HomePage;
