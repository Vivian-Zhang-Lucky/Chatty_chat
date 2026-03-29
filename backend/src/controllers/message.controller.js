  import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUploadUrl = async (req, res) => {
  try {
    const {fileName} = req.query;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const publicId = `raw_uploads/${Date.now()}-${fileName}`;
    const signature = cloudinary.utils.api_sign_request(
        {
          timestamp: timestamp,
          public_id: publicId,
        },
        process.env.CLOUDINARY_API_SECRET
    );
    const uploadEndpoint = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload`;
    const finalFileUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload/${publicId}`;
    res.status(200).json({
      uploadEndpoint,
      finalFileUrl,
      signature,
      timestamp,
      publicId,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  } catch (error) {
    console.error("Error in getUploadUrl: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// get messages between users
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        {senderId: myId, receiverId: userToChatId},
        {senderId: userToChatId, receiverId: myId},
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    // const { content, image } = req.body;
    const { senderContent, receiverContent, senderFileTag, receiverFileTag} = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    const newMessage = new Message({
      senderId,
      receiverId,
      senderContent: senderContent ?? undefined,
      receiverContent: receiverContent ?? undefined,
      senderFileTag: senderFileTag ?? undefined,
      receiverFileTag: receiverFileTag ?? undefined,
    });
    console.log("newMes:", newMessage);

    await newMessage.save();

    // todo: realtime functionally goes here => socket.id
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
