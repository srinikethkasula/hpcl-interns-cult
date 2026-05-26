"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { User, Building2, Briefcase, Save, Loader2, Camera, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect as useEff, useState as useSt } from "react";

export const DEPARTMENTS = [
  "Information Systems (IS)",
  "Human Resources (HR)",
  "Finance & Accounts",
  "Operations & Distribution",
  "Marketing & Sales",
  "Technical & Engineering",
  "Refinery Operations",
  "Research & Development (R&D)",
  "Health, Safety & Environment (HSE)",
  "Public Relations (PR)"
];

const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.75): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function Settings({ session }: { session: any }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [fullName, setFullName] = useState("");
  const [office, setOffice] = useState("");
  const [department, setDepartment] = useState("");
  const [floor, setFloor] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    fetchProfile();
    // Load saved theme
    const saved = (typeof window !== 'undefined' ? localStorage.getItem('hpcl-theme') : null) || 'dark';
    setTheme(saved as 'dark' | 'light');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('hpcl-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (data) {
      setFullName(data.full_name);
      setOffice(data.office);
      setDepartment(data.department);
      setFloor(data.floor);
      setAvatarUrl(data.avatar_url || "");
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setMessage("");

      if (!e.target.files || e.target.files.length === 0) {
        return;
      }
      const file = e.target.files[0];
      
      // Compress avatar to 400x400 JPG at 85% quality client-side
      const compressedBlob = await compressImage(file, 400, 400, 0.85);
      const fileToUpload = new File([compressedBlob], `avatar.jpg`, { type: 'image/jpeg' });
      
      const filePath = `${session.user.id}/${Date.now()}.jpg`;

      // Upload file to avatars bucket
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, fileToUpload, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);

      // Update in users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) {
        throw updateError;
      }

      setMessage("Avatar updated successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err: any) {
      setMessage("Error uploading avatar: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from('users')
      .update({
        full_name: fullName,
        office,
        department,
        floor
      })
      .eq('id', session.user.id);

    if (error) {
      setMessage("Error updating profile: " + error.message);
    } else {
      setMessage("Profile updated successfully!");
      setTimeout(() => setMessage(""), 3000);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="h-full flex justify-center items-center bg-transparent"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  const getInitials = (name: string) => {
    return name
      ? name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "U";
  };

  return (
    <div className="h-full overflow-y-auto bg-transparent p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-start justify-between"
        >
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent mb-2">Profile Settings</h2>
            <p className="text-zinc-500 text-sm">Update your personal information to help other interns find you.</p>
          </div>
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
              theme === 'light'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20'
            }`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="glass-panel rounded-3xl p-6 md:p-8 border border-zinc-800 shadow-xl"
        >
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-8 pb-6 border-b border-zinc-800/50">
            <div className="relative group cursor-pointer w-28 h-28 mb-4">
              {avatarUrl ? (
                <img 
                  src={avatarUrl} 
                  alt="Profile Avatar" 
                  className="w-28 h-28 rounded-full object-cover border-2 border-indigo-500/50 shadow-lg group-hover:opacity-80 transition-opacity"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold text-3xl flex items-center justify-center border-2 border-indigo-500/30 shadow-lg group-hover:opacity-80 transition-opacity">
                  {getInitials(fullName)}
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
              <label 
                htmlFor="avatar-file"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white border-2 border-zinc-950 cursor-pointer shadow-md transition-colors"
              >
                <Camera className="w-4 h-4" />
              </label>
              <input 
                type="file" 
                id="avatar-file" 
                accept="image/*" 
                onChange={handleAvatarUpload} 
                className="hidden" 
                disabled={uploading}
              />
            </div>
            <p className="text-xs text-zinc-500 font-medium">Click the camera icon to upload a profile picture</p>
          </div>

          <form onSubmit={updateProfile} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 glass-input text-sm text-zinc-100"
                    required
                  />
                  <User className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Department</label>
                <div className="relative">
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full pl-11 pr-10 py-3 glass-input text-sm appearance-none cursor-pointer text-zinc-100"
                    required
                  >
                    <option value="" disabled className="bg-zinc-900">Select Department</option>
                    {DEPARTMENTS.map(dept => (
                      <option key={dept} value={dept} className="bg-zinc-900 text-zinc-100">
                        {dept}
                      </option>
                    ))}
                  </select>
                  <Briefcase className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <div className="absolute right-4 top-4.5 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-500 w-0 h-0" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Office Location</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={office}
                      onChange={e => setOffice(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 glass-input text-sm text-zinc-100"
                      required
                    />
                    <Building2 className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Floor Number</label>
                  <input
                    type="text"
                    value={floor}
                    onChange={e => setFloor(e.target.value)}
                    className="w-full px-4 py-3 glass-input text-sm text-zinc-100"
                    required
                  />
                </div>
              </div>
            </div>

            {message && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl text-sm font-medium ${message.includes('successfully') ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}
              >
                {message}
              </motion.div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
