import { useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { Image, Send, X, Paperclip } from "lucide-react";
import toast from "react-hot-toast";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const { sendMessage } = useChatStore();

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    try {
      if (!file) throw new Error("File is empty or unreadable");
      setSelectedFile(file);
    } catch (error) {
      toast.error("Could not read file: " + error.message);
    }
    e.target.value = "";
  }

  const removeImage = () => {
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeFile= () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imagePreview && !selectedFile) return;

    try {
      await sendMessage({
        text: text.trim(),
        image: imagePreview,
        file: selectedFile,
      });

      // Clear form
      setText("");
      setImagePreview(null);
      setSelectedFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <div className="p-4 w-full">
      {imagePreview && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-zinc-700"
            />
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300
              flex items-center justify-center"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
      {selectedFile && (
          <div className="mb-3 flex items-center gap-2">
            <div className="relative">
              <div className="flex items-center gap-2">
                <span>{"\ud83d\udcc4"}</span>
                <span className="text-sm">{selectedFile.name}</span>
              </div>

              <button
                  onClick={removeFile}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300
              flex items-center justify-center"
                  type="button"
              >
                <X className="size-3"/>
              </button>
            </div>
          </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
        <div className="flex-1 flex gap-2">
          <input
              type="text"
              className="w-full input input-bordered rounded-lg input-sm sm:input-md"
              placeholder="Type a message..."
              value={text}
              onChange={(e) => setText(e.target.value)}
          />
          <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={imageInputRef}
              onChange={handleImageChange}
          />
          <button
              type="button"
              className={`hidden sm:flex btn btn-circle
                     ${imagePreview ? "text-emerald-500" : "text-zinc-400"}`}
              onClick={() => imageInputRef.current?.click()}
          >
            <Image size={20}/>
          </button>
          <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
          />
          <button
              type="button"
              className={`hidden sm:flex btn btn-circle
                     ${selectedFile ? "text-emerald-500" : "text-zinc-400"}`}
              onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={20}/>
          </button>
        </div>
        <button
            type="submit"
            className="btn btn-sm btn-circle"
            disabled={!text.trim() && !imagePreview && !selectedFile}
        >
          <Send size={22}/>
        </button>
      </form>
    </div>
  );
};
export default MessageInput;
