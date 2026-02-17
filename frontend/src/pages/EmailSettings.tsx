import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api";
import Sidebar from "../components/Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Copy,
  Globe,
  Clock,
  ChevronDown,
  ChevronUp,
  Mail,
} from "lucide-react";
import { Toaster, toast } from "sonner";

// --- Types ---

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

interface DomainInfo {
  has_domain: boolean;
  domain_name: string | null;
  status: string;
  domain: {
    id: string;
    name: string;
    status: string;
    records: DnsRecord[];
    region?: string;
    created_at?: string;
  } | null;
}

interface EmailStatus {
  method: string;
  email?: string;
  host?: string;
  sender_email?: string;
  sender_name?: string;
  configured: boolean;
}

// --- DNS Record Row ---

function DnsRecordRow({ record }: { record: DnsRecord }) {
  const copyValue = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  };

  const colors: Record<string, string> = {
    TXT: "bg-blue-100 text-blue-700",
    CNAME: "bg-purple-100 text-purple-700",
    MX: "bg-amber-100 text-amber-700",
  };

  const isVerified = record.status === "verified";

  return (
    <div
      className={`border rounded-xl p-4 space-y-2.5 ${isVerified ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white"}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[record.type] || "bg-slate-100 text-slate-600"}`}
        >
          {record.type}
        </span>
        {isVerified ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        ) : record.status ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
            <Clock className="w-3 h-3" /> Pending
          </span>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Name / Host
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-slate-800 bg-slate-100 px-2.5 py-1.5 rounded-lg font-mono break-all flex-1 select-all">
              {record.name}
            </code>
            <button
              onClick={() => copyValue(record.name)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0"
              title="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Value
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-slate-800 bg-slate-100 px-2.5 py-1.5 rounded-lg font-mono break-all flex-1 select-all">
              {record.value}
            </code>
            <button
              onClick={() => copyValue(record.value)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0"
              title="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {record.priority !== undefined && (
          <div>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
              Priority
            </p>
            <code className="text-xs text-slate-800 bg-slate-100 px-2.5 py-1.5 rounded-lg font-mono inline-block">
              {record.priority}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main Component ---

export default function EmailSettings() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [domainInfo, setDomainInfo] = useState<DomainInfo | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [dnsExpanded, setDnsExpanded] = useState(true);
  const [autoSetupDone, setAutoSetupDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // --- Fetch status ---

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch<EmailStatus>("/api/email/smtp/status");
      setStatus(res);
      return res;
    } catch {
      return null;
    }
  }, []);

  const fetchDomain = useCallback(async () => {
    try {
      const res = await apiFetch<DomainInfo>("/api/email/domains/my-domain");
      setDomainInfo(res);
      return res;
    } catch {
      return null;
    }
  }, []);

  // --- Auto-setup on load ---

  const autoSetup = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 0. Get user info first (needed for display + auto-config)
      let user: { email: string; name: string } | null = null;
      try {
        user = await apiFetch<{ email: string; name: string }>("/api/auth/me");
        if (user?.email) setUserEmail(user.email);
      } catch {
        console.warn("Could not fetch user info");
      }

      // 1. Check if email is already configured
      const emailStatus = await fetchStatus();

      // 2. If not configured, auto-configure platform email
      if (!emailStatus?.configured && user?.email) {
        try {
          await apiFetch("/api/email/smtp/platform-setup", {
            method: "POST",
            body: JSON.stringify({
              email: user.email,
              senderName: user.name || user.email.split("@")[0],
            }),
          });
          await fetchStatus();
        } catch (err: any) {
          console.warn("Auto email setup:", err.message);
        }
      }

      // 3. Check domain status
      const domain = await fetchDomain();

      // 4. If no domain registered, auto-register
      if (!domain?.has_domain) {
        setRegistering(true);
        try {
          await apiFetch("/api/email/domains/register-my-domain", {
            method: "POST",
          });
          await fetchDomain();
        } catch (err: any) {
          if (!err.message?.includes("free email provider")) {
            console.warn("Auto domain register:", err.message);
          }
        } finally {
          setRegistering(false);
        }
      }

      setAutoSetupDone(true);
    } catch (err: any) {
      setError(err.message || "Failed to load email settings");
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, fetchDomain]);

  useEffect(() => {
    autoSetup();
  }, [autoSetup]);

  // --- Register domain ---

  const handleRegister = async () => {
    setRegistering(true);
    try {
      await apiFetch("/api/email/domains/register-my-domain", {
        method: "POST",
      });
      await fetchDomain();
      toast.success("Domain registered! Add the DNS records below.");
    } catch (err: any) {
      toast.error(err.message || "Failed to register domain");
    } finally {
      setRegistering(false);
    }
  };

  // --- Verify domain ---

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await apiFetch<{ status: string; verified: boolean }>(
        "/api/email/domains/verify-my-domain",
        { method: "POST" },
      );
      await fetchDomain();
      if (res.verified) {
        toast.success(
          "Domain verified! Emails will now be sent from your domain.",
        );
      } else {
        toast.info(
          "DNS records not yet propagated. This can take 5 min to 72 hours. Try again shortly.",
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  // --- Refresh ---

  const handleRefresh = async () => {
    await fetchDomain();
    toast.success("Status refreshed");
  };

  // --- Render ---

  const domainName = domainInfo?.domain_name;
  const isVerified = domainInfo?.status === "verified";
  const isPending = domainInfo?.has_domain && !isVerified;
  const records = domainInfo?.domain?.records || [];
  const isFreeProvider =
    !domainInfo?.has_domain && autoSetupDone && !registering;

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar active="email-settings" />
      <Toaster position="top-right" richColors />

      <main className="flex-1 ml-64 p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-heading text-xl font-semibold text-slate-900 tracking-tight">
                  Email Settings
                </h1>
                <p className="text-xs text-slate-500">
                  Verify your domain to send emails to investors
                </p>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  {registering
                    ? "Registering your domain..."
                    : "Setting up email..."}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  This only takes a moment
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">{error}</p>
                <button
                  onClick={autoSetup}
                  className="mt-2 text-xs font-medium text-red-600 hover:text-red-800"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* --- Domain Verified --- */}
          {!loading && isVerified && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-emerald-900">
                      Domain Verified
                    </p>
                    <p className="text-sm text-emerald-700 mt-0.5">
                      Emails are sent from{" "}
                      <strong className="font-mono">
                        noreply@{domainName}
                      </strong>{" "}
                      and will reach anyone's inbox.
                    </p>
                  </div>
                </div>
              </div>

              {status && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                        Sending From
                      </p>
                      <p className="text-sm text-slate-800 font-mono truncate">
                        noreply@{domainName}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                        Reply-To
                      </p>
                      <p className="text-sm text-slate-800 font-mono truncate">
                        {status.email || status.sender_email}
                      </p>
                    </div>
                    {status.sender_name && (
                      <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                          Display Name
                        </p>
                        <p className="text-sm text-slate-800">
                          {status.sender_name}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  What to do next
                </h2>
                <div className="space-y-3">
                  <a
                    href="/contacts"
                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-indigo-50 hover:border-indigo-200 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">{"\uD83D\uDC65"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600">
                        Add Contacts
                      </p>
                      <p className="text-xs text-slate-500">
                        Add investors and partners you want to email
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                  </a>
                  <a
                    href="/narrative"
                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-indigo-50 hover:border-indigo-200 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">{"\u270D\uFE0F"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600">
                        Create Investor Update
                      </p>
                      <p className="text-xs text-slate-500">
                        Draft a narrative and send it to your contacts
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {/* --- Domain Pending: DNS Records --- */}
          {!loading && isPending && records.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-amber-900">
                      Verify Your Domain
                    </p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      Add these DNS records to <strong>{domainName}</strong> to
                      start sending emails
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">
                  How to verify
                </h2>
                <div className="space-y-3">
                  {[
                    {
                      num: "1",
                      text: "Log into your domain provider (GoDaddy, Namecheap, Cloudflare, Hostinger, etc.)",
                    },
                    { num: "2", text: `Open DNS settings for ${domainName}` },
                    {
                      num: "3",
                      text: "Add each DNS record below \u2014 copy the Name and Value exactly",
                    },
                    {
                      num: "4",
                      text: "Come back here and click \u201cVerify Domain\u201d",
                    },
                  ].map((step) => (
                    <div key={step.num} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {step.num}
                      </div>
                      <p className="text-sm text-slate-700">{step.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setDnsExpanded(!dnsExpanded)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">
                      DNS Records
                    </h2>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                      {records.length}
                    </span>
                  </div>
                  {dnsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                <AnimatePresence>
                  {dnsExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 space-y-3">
                        {records.map((record, idx) => (
                          <DnsRecordRow key={idx} record={record} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Verify Domain
                    </>
                  )}
                </button>
                <button
                  onClick={handleRefresh}
                  className="px-4 py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              <p className="text-center text-[11px] text-slate-400">
                DNS propagation usually takes 5-30 minutes, but can take up to
                72 hours.
              </p>
            </motion.div>
          )}

          {/* --- Free Provider (no custom domain) --- */}
          {!loading && isFreeProvider && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Show logged-in account */}
              {userEmail && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                      Logged in as
                    </p>
                    <p className="text-sm text-slate-800 font-mono truncate">
                      {userEmail}
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-blue-900">
                      Custom Domain Required
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      You're signed in with{" "}
                      <strong>
                        {userEmail ||
                          status?.email ||
                          status?.sender_email ||
                          "a free email"}
                      </strong>{" "}
                      which is a free email provider. To send emails to
                      investors, you need a custom domain like{" "}
                      <strong>yourcompany.com</strong>.
                    </p>
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-blue-800">
                        How to set up email sending:
                      </p>
                      <div className="text-xs text-blue-700 space-y-1.5">
                        <p>
                          1. Buy a domain from Namecheap, GoDaddy, or Cloudflare
                        </p>
                        <p>
                          2. Set up a business email (e.g., you@yourcompany.com)
                        </p>
                        <p>
                          3. <strong>Sign out</strong> and sign back in with
                          that business email
                        </p>
                        <p>
                          4. Come back to this page — domain verification will
                          start automatically
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {status?.configured && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Platform email is configured but can only send test emails
                    to the account owner ({userEmail}). Verify a custom domain
                    to send to anyone.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* --- No domain, not free provider, setup done --- */}
          {!loading &&
            !isVerified &&
            !isPending &&
            !isFreeProvider &&
            autoSetupDone && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
                  <Globe className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    Set up domain verification
                  </p>
                  <p className="text-xs text-slate-500 mb-4">
                    Register your domain to send emails from your own address
                  </p>
                  <button
                    onClick={handleRegister}
                    disabled={registering}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {registering ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      "Register Domain"
                    )}
                  </button>
                </div>
              </motion.div>
            )}
        </div>
      </main>
    </div>
  );
}
