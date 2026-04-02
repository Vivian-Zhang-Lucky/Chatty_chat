import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useNavigate } from "react-router-dom";

export default function SettingsPage({ darkMode, setDarkMode }) {
  const [notifications, setNotifications] = useState(true);
  const { authUser } = useAuthStore();
  const [username, setUsername] = useState(
    localStorage.getItem("username") || authUser?.username || ""
  );
  const { logout } = useAuthStore();
  const [avatar, setAvatar] = useState(null);
  const navigate = useNavigate();

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setAvatar(imageUrl);
    }
  };

  const handleSave = () => {
    // 保存 username 到 localStorage（模拟后端）
    localStorage.setItem("username", username);
    
    alert("Changes saved successfully");
    };

  return (
    <div className="p-8 pt-24 max-w-xl mx-auto">
       <button
          onClick={() => navigate(-1)}
          className="btn btn-sm mb-4"
       >
          ← Back
       </button>

       <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-bold mb-6 text-center">
            Settings
          </h1>

        <div className="w-16"></div>
      </div>

      {/* Avatar */}
      <div className="mb-6 flex flex-col items-center">
        <div className="w-24 h-24 rounded-full overflow-hidden border mb-2">
          <img
            src={avatar || "https://ui-avatars.com/api/?name=User"}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
         className="file-input file-input-bordered w-full max-w-xs"
        />
      </div>

      {/* Profile */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Profile</h2>
        <input
          type="text"
          value={username}
          placeholder="Update username"
          onChange={(e) => setUsername(e.target.value)}
          className="input input-bordered w-full mb-2"
        />
        <input
          type="email"
          value={authUser?.email || "No email"}
          disabled
          className="input input-bordered w-full"
        />
      </div>

      {/* Password */}
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Change Password</h2>

        <input
          type="password"
          placeholder="New password"
          className="input input-bordered w-full mb-2"
        />

        <input
          type="password"
          placeholder="Confirm password"
          className="input input-bordered w-full"
        />
      </div>

      {/* Theme */}
      <div className="mb-6 flex justify-between items-center">
        <span>Dark Mode</span>
        <input
          type="checkbox"
          className="toggle"
          checked={darkMode}
          onChange={() => setDarkMode(!darkMode)}
        />
      </div>

      {/* Notifications */}
      <div className="mb-6 flex justify-between items-center">
        <span>Notifications</span>
        <input
          type="checkbox"
          className="toggle"
          checked={notifications}
          onChange={() => setNotifications(!notifications)}
        />
      </div>

      {/* Privacy */}
      <div className="mb-6 flex justify-between items-center">
        <span>Profile Visibility</span>
        <select className="select select-bordered">
          <option>Public</option>
          <option>Friends</option>
          <option>Private</option>
        </select>
      </div>

      <button
        className="btn btn-primary w-full mb-2"
        onClick={handleSave}
      >
        Save Changes
      </button>

      {/* Logout */}
      <button onClick={logout} className="btn btn-error w-full">
        Logout
      </button>
    </div>
  );
}