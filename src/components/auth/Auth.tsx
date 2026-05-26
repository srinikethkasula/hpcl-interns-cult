"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Phone, Lock, User, Building2, Briefcase, ArrowRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const DEPARTMENTS = [
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

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [office, setOffice] = useState("");
  const [department, setDepartment] = useState("");
  const [floor, setFloor] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formattedPhone = `+91${phone}`;

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        phone: formattedPhone,
        password: password,
      });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        phone: formattedPhone,
        password: password,
        options: {
          data: {
            full_name: fullName,
            office: office,
            department: department,
            floor: floor,
          }
        }
      });
      if (error) setError(error.message);
      else {
        setIsLogin(true);
        setError("Sign up successful! You can now log in.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden text-zinc-100">
      {/* Animated Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/20 blur-[120px] rounded-full pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="glass-panel p-6 sm:p-8 md:p-10 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="text-center mb-8">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-indigo-500/25"
            >
              <Building2 className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">
              HPCL Intern Connect
            </h1>
            <p className="text-sm text-zinc-400 mt-2">Intern Communication Portal</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <AnimatePresence mode="popLayout">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scale: 0.95 }}
                  animate={{ opacity: 1, height: "auto", scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm placeholder:text-zinc-500"
                      required={!isLogin}
                    />
                    <User className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Office"
                        value={office}
                        onChange={e => setOffice(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm placeholder:text-zinc-500"
                        required={!isLogin}
                      />
                      <Building2 className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500" />
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Floor"
                        value={floor}
                        onChange={e => setFloor(e.target.value)}
                        className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm placeholder:text-zinc-500"
                        required={!isLogin}
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <select
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      className="w-full pl-11 pr-10 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 appearance-none cursor-pointer"
                      required={!isLogin}
                    >
                      <option value="" disabled className="bg-zinc-900 text-zinc-550">Select Department</option>
                      {DEPARTMENTS.map(dept => (
                        <option key={dept} value={dept} className="bg-zinc-900 text-zinc-100">
                          {dept}
                        </option>
                      ))}
                    </select>
                    <Briefcase className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                    <div className="absolute right-4 top-4.5 pointer-events-none border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-500 w-0 h-0" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <span className="absolute left-4 top-3.5 text-sm text-zinc-500 font-medium">+91</span>
              <input
                type="tel"
                placeholder="Phone Number"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full pl-14 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm placeholder:text-zinc-500"
                required
              />
              <Phone className="absolute right-4 top-3.5 h-4 w-4 text-zinc-500" />
            </div>

            <div className="relative">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-11 pr-16 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm placeholder:text-zinc-500"
                required
              />
              <Lock className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
              {isLogin && (
                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(true)}
                  className="absolute right-4 top-3.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium cursor-pointer"
                >
                  Forgot?
                </button>
              )}
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`p-3 rounded-lg text-xs font-medium text-center ${error.includes('successful') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading || phone.length !== 10 || password.length < 6}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group shadow-lg shadow-indigo-500/20"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              {isLogin ? "New intern? Create an account" : "Already registered? Sign in"}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {isForgotPasswordOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-zinc-100"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel max-w-md w-full rounded-3xl p-6 border border-zinc-800 shadow-2xl relative overflow-hidden"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl mx-auto mb-4 flex items-center justify-center border border-indigo-500/20">
                  <Lock className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                  Password Recovery
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Official HPCL Intern Connect Registry Notice</p>
              </div>

              <div className="space-y-4 text-sm text-zinc-300 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-5 mb-6 leading-relaxed">
                <p>
                  Since your account is linked directly to your **official HPCL intern phone number registry**, password resets are managed securely by your system administrator.
                </p>
                <div className="border-t border-zinc-800/40 my-3" />
                <p className="font-semibold text-zinc-200">How to reset your password:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-400">
                  <li>Contact your **IT Supervisor** or the **Corporate Communications Admin** at your Refinery unit.</li>
                  <li>Request them to reset your password in the **Supabase Dashboard** under <code className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-300">Authentication &gt; Users</code>.</li>
                  <li>Once updated, you can log in instantly with your new password!</li>
                </ul>
              </div>

              <button
                onClick={() => setIsForgotPasswordOpen(false)}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-medium rounded-xl transition-all shadow-md shadow-indigo-500/10 cursor-pointer text-sm"
              >
                Got it, thanks!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
