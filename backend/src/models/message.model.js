import mongoose from "mongoose";

export const MSG_TYPES = ["text", "image", "file"];

const messageSchema = new mongoose.Schema( {
    id:{
      type: String,
      required: true,
      unique: true,
    },
    msgType: {
      type: String,
      enum: MSG_TYPES,
      required: true,
    },
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
    textTag: {
        senderTextTag: {
            iv: String,
            ct: String,
            salt: String,
            tag: String,
        },
        receiverTextTag: {
            iv: String,
            ct: String,
            salt: String,
            tag: String,
        },
    },
    imageTag: {
        fileName: String,
        fileType: String,
        fileSize: Number,
        senderImageTag: {
            iv: String,
            ct: String,
            salt: String,
            src: String,
        },
        receiverImageTag: {
            iv: String,
            ct: String,
            salt: String,
            src: String,
        },
    },
    fileTag: {
        fileName: String,
        fileType: String,
        fileSize: Number,
        senderFileTag: {
            src: String,
            chunks: [{
                iv: String,
                ct: String,
                salt: String,
                size: Number,
            }],
        },
        receiverFileTag: {
            src: String,
            chunks: [{
                iv: String,
                ct: String,
                salt: String,
                size: Number
            }],
        },
    },
  },
  { timestamps: true },
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
