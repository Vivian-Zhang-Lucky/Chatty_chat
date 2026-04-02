import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef } from "react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
    downloadFile,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const downloadingRef = useRef(new Set());

  useEffect(() => {
    getMessages(selectedUser._id);

    subscribeToMessages();

    return () => unsubscribeFromMessages();
  }, [
    selectedUser._id,
    getMessages,
    subscribeToMessages,
    unsubscribeFromMessages,
  ]);

  useEffect(() => {
    if (messageEndRef.current && messages) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  const handleDownload = async (message) => {
    if (downloadingRef.current.has(message.id)) return;
    downloadingRef.current.add(message.id);
    try {
      if (message.fileProgress === 100 && message.blob instanceof Blob) {
        const url = URL.createObjectURL(message.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = message.fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await downloadFile(message);
      }
    } catch (error) {
      console.error("Download file failed: ",  error);
    } finally {
      downloadingRef.current.delete(message.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat ${message.senderId === authUser._id ? "chat-end" : "chat-start"}`}
            ref={messageEndRef}
          >
            <div className=" chat-image avatar">
              <div className="size-10 rounded-full border">
                <img
                  src={
                    message.senderId === authUser._id
                      ? authUser.profilePic || "/avatar.png"
                      : selectedUser.profilePic || "/avatar.png"
                  }
                  alt="profile pic"
                />
              </div>
            </div>
            <div className="chat-header mb-1">
              <time className="text-xs opacity-50 ml-1">
                {formatMessageTime(message.createdAt)}
              </time>
            </div>
            <div className="chat-bubble flex flex-col">
              {message.msgType === "image" && (
                <img
                  src={message.image}
                  alt="Attachment"
                  className="sm:max-w-[200px] rounded-md mb-2"
                />
              )}
              {message.msgType === "text" && <p>{message.text}</p>}
              {message.msgType === "file" && (
                <div className="cursor-pointer" onClick={() => handleDownload(message)}>
                  <div className="flex items-center gap-2">
                    <span>{"\ud83d\udcc4"}</span>
                    <span className="text-sm">{message.fileName}</span>
                  </div>
                  <div>
                    <div className="bg-blue-500 h-1 rounded" style={{width: `${message.fileProgress}%`}}/>
                  </div>
                  <p className="text-xs text-zinc-400">{message.fileState}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <MessageInput />
    </div>
  );
};
export default ChatContainer;
