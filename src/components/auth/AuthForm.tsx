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

export default function AuthForm() {
  const [step, setStep] = useState<"phone" | "login" | "signup">("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [office, setOffice] = useState("");
  const [department, setDepartment] = useState("");
  const [floor, setFloor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (phone.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setLoading(true);
    const fullPhone = `+91${phone}`;

    try {
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('id')
        .eq('phone', fullPhone)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (data) {
        setStep("login");
      } else {
        setStep("signup");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fullPhone = `+91${phone}`;

    try {
      if (step === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          phone: fullPhone,
          password,
        });
        if (error) throw error;
      } else if (step === "signup") {
        const { error } = await supabase.auth.signUp({
          phone: fullPhone,
          password,
          options: {
            data: {
              phone: fullPhone,
              full_name: fullName,
              office,
              department,
              floor
            }
          }
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
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
        className="w-full max-w-md z-10"
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
              HPCL Cult
            </h1>
            <p className="text-sm text-zinc-400 mt-2">Intern Communication Portal</p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-medium text-center mb-6"
            >
              {error}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {step === "phone" && (
              <motion.form 
                key="phone"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handlePhoneSubmit} 
                className="space-y-6"
              >
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Phone Number</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-sm text-zinc-500 font-medium">+91</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                      className="w-full pl-14 pr-11 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 placeholder:text-zinc-500"
                      placeholder="Phone Number"
                      required
                    />
                    <Phone className="absolute right-4 top-3.5 h-4 w-4 text-zinc-500" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || phone.length !== 10}
                  className="w-full flex items-center justify-center py-3 px-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-indigo-500/20 cursor-pointer"
                >
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Continue"}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />}
                </button>
              </motion.form>
            )}

            {step === "login" && (
              <motion.form 
                key="login"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleAuth} 
                className="space-y-6"
              >
                <div>
                  <div className="flex justify-between items-center mb-4 bg-zinc-900/40 border border-zinc-800/40 p-3 rounded-xl">
                    <div className="text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-200">Welcome back!</span>
                      <span className="block mt-0.5 font-medium text-indigo-400">+91 {phone}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        setStep("phone");
                        setError("");
                      }} 
                      className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs cursor-pointer animate-pulse"
                    >
                      Change
                    </button>
                  </div>
                  
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Password</label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-16 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 placeholder:text-zinc-500"
                      placeholder="••••••••"
                      required
                    />
                    <Lock className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setIsForgotPasswordOpen(true)}
                      className="absolute right-4 top-3.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-semibold cursor-pointer"
                    >
                      Forgot?
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || password.length < 6}
                  className="w-full flex items-center justify-center py-3 px-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-indigo-500/20 cursor-pointer text-sm"
                >
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Sign In"}
                </button>
              </motion.form>
            )}

            {step === "signup" && (
              <motion.form 
                key="signup"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleAuth} 
                className="space-y-4"
              >
                <div>
                  <div className="flex justify-between items-center mb-4 bg-zinc-900/40 border border-zinc-800/40 p-3 rounded-xl">
                    <div className="text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-200">New Account Details</span>
                      <span className="block mt-0.5 font-medium text-indigo-400">+91 {phone}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        setStep("phone");
                        setError("");
                      }} 
                      className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 placeholder:text-zinc-500"
                    placeholder="Full Name"
                    required
                  />
                  <User className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={office}
                      onChange={(e) => setOffice(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 placeholder:text-zinc-500"
                      placeholder="Office"
                      required
                    />
                    <Building2 className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 placeholder:text-zinc-500"
                      placeholder="Floor (e.g., 5th)"
                      required
                    />
                  </div>
                </div>

                <div className="relative">
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full pl-11 pr-10 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 appearance-none cursor-pointer"
                    required
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

                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:bg-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-zinc-100 placeholder:text-zinc-500"
                    placeholder="Create Password"
                    required
                    minLength={6}
                  />
                  <Lock className="absolute left-4 top-3.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                </div>

                <button
                  type="submit"
                  disabled={loading || password.length < 6 || !fullName || !office || !department || !floor}
                  className="w-full flex items-center justify-center py-3 px-4 mt-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 cursor-pointer text-sm"
                >
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Sign Up"}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
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
                <p className="text-xs text-zinc-500 mt-1">Official HPCL Cult Registry Notice</p>
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
