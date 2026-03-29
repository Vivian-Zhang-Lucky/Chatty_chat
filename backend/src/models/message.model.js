import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderContent: {
      iv: String,
      ct: String,
      salt: String,
      tag: String,
    },
    receiverContent: {
      iv: String,
      ct: String,
      salt: String,
      tag: String,
    },
    senderFileTag: {
      iv: String,
      ct: String,
      salt: String,
      src: String,
      fileName: String,
      fileType: String,
      fileSize: Number,
    },
    receiverFileTag: {
      iv: String,
      ct: String,
      salt: String,
      src: String,
      fileName: String,
      fileType: String,
      fileSize: Number,
    },
  },
  { timestamps: true },
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
