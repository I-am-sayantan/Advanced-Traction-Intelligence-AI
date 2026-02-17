import { Router, Request, Response } from "express";
import { Resend } from "resend";
import dns from "dns/promises";
import { sb } from "../supabase";
import { config } from "../config";
import { requireAuth } from "../middleware";
import type { AuthenticatedRequest } from "../types";

const router = Router();

// ─── Register My Domain (auto-extract from user email) ──────────

router.post(
  "/register-my-domain",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!config.resendApiKey) {
        res
          .status(500)
          .json({
            detail: "Email service not configured. Set RESEND_API_KEY.",
          });
        return;
      }

      const user = (req as AuthenticatedRequest).user!;
      const userEmail = user.email;
      if (!userEmail || !userEmail.includes("@")) {
        res.status(400).json({ detail: "No email found for your account" });
        return;
      }

      const domainName = userEmail.split("@")[1].toLowerCase();

      // Skip free email providers — they can't add DNS records
      const freeProviders = [
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "yahoo.co.in",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "msn.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "aol.com",
        "protonmail.com",
        "proton.me",
        "zoho.com",
        "zohomail.in",
        "yandex.com",
        "mail.com",
        "gmx.com",
        "fastmail.com",
      ];
      if (freeProviders.includes(domainName)) {
        res.status(400).json({
          detail: `${domainName} is a free email provider. You need a custom domain (like yourcompany.com) to verify with Resend. Use Gmail OAuth or SMTP instead.`,
          is_free_provider: true,
        });
        return;
      }

      // Check if already registered
      const { data: existing } = await sb
        .from("user_settings")
        .select("resend_domain_id, resend_domain_name, resend_domain_status")
        .eq("user_id", user.user_id)
        .limit(1);

      if (
        existing?.[0]?.resend_domain_id &&
        existing[0].resend_domain_name === domainName
      ) {
        // Already registered — just fetch latest status
        const resend = new Resend(config.resendApiKey);
        try {
          const detailResult = await resend.domains.get(
            existing[0].resend_domain_id,
          );
          const domain = (detailResult as any)?.data ?? detailResult;

          // Update status in DB
          const newStatus =
            domain?.status === "verified" ? "verified" : "pending";
          await sb
            .from("user_settings")
            .update({
              resend_domain_status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.user_id);

          res.json({
            domain,
            already_registered: true,
            domain_name: domainName,
          });
          return;
        } catch (e) {
          // Domain might have been deleted from Resend — re-register below
          console.log("Existing domain not found in Resend, re-registering...");
        }
      }

      // Check if this domain already exists in Resend (from another registration attempt)
      const resend = new Resend(config.resendApiKey);
      let existingDomain: any = null;
      try {
        const listResult = await resend.domains.list();
        const allDomains =
          (listResult as any)?.data?.data ?? (listResult as any)?.data ?? [];
        existingDomain = allDomains.find((d: any) => d.name === domainName);
      } catch (e) {
        console.log("Could not list domains:", e);
      }

      let domainData: any;
      if (existingDomain) {
        // Domain exists in Resend — fetch full details
        const detailResult = await resend.domains.get(existingDomain.id);
        domainData = (detailResult as any)?.data ?? detailResult;
      } else {
        // Create new domain in Resend
        const createResult = await resend.domains.create({
          name: domainName,
        });
        const created = (createResult as any)?.data ?? createResult;

        if (!created?.id) {
          res
            .status(400)
            .json({ detail: "Failed to register domain with email service" });
          return;
        }

        // Fetch full details with DNS records
        try {
          const detailResult = await resend.domains.get(created.id);
          domainData = (detailResult as any)?.data ?? detailResult;
        } catch {
          domainData = created;
        }
      }

      // Save to user_settings
      const domainStatus =
        domainData?.status === "verified" ? "verified" : "pending";
      await sb
        .from("user_settings")
        .update({
          resend_domain_id: domainData.id,
          resend_domain_name: domainName,
          resend_domain_status: domainStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.user_id);

      console.log(
        `Registered domain ${domainName} for user ${user.email}, id: ${domainData.id}`,
      );

      res.json({
        domain: domainData,
        already_registered: !!existingDomain,
        domain_name: domainName,
      });
    } catch (err: any) {
      console.error("Register domain error:", err);
      res
        .status(500)
        .json({ detail: err.message || "Failed to register domain" });
    }
  },
);

// ─── Get My Domain Status ───────────────────────────────────────

router.get("/my-domain", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;

    // Get stored domain info
    const { data } = await sb
      .from("user_settings")
      .select(
        "resend_domain_id, resend_domain_name, resend_domain_status, sender_email, email_method",
      )
      .eq("user_id", user.user_id)
      .limit(1);

    const settings = data?.[0];
    if (!settings?.resend_domain_id) {
      res.json({
        has_domain: false,
        domain_name: null,
        status: "not_started",
        domain: null,
      });
      return;
    }

    // Fetch latest from Resend
    if (!config.resendApiKey) {
      res.json({
        has_domain: true,
        domain_name: settings.resend_domain_name,
        status: settings.resend_domain_status || "pending",
        domain: null,
      });
      return;
    }

    try {
      const resend = new Resend(config.resendApiKey);
      const detailResult = await resend.domains.get(settings.resend_domain_id);
      const domain = (detailResult as any)?.data ?? detailResult;

      // Update status in DB if changed
      const newStatus = domain?.status === "verified" ? "verified" : "pending";
      if (newStatus !== settings.resend_domain_status) {
        await sb
          .from("user_settings")
          .update({
            resend_domain_status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.user_id);
      }

      res.json({
        has_domain: true,
        domain_name: settings.resend_domain_name,
        status: newStatus,
        domain,
      });
    } catch (e: any) {
      // Domain may not exist in Resend anymore
      res.json({
        has_domain: true,
        domain_name: settings.resend_domain_name,
        status: "error",
        domain: null,
        error: e.message,
      });
    }
  } catch (err: any) {
    console.error("Get my domain error:", err);
    res
      .status(500)
      .json({ detail: err.message || "Failed to get domain status" });
  }
});

// ─── Verify My Domain ───────────────────────────────────────────

router.post(
  "/verify-my-domain",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!config.resendApiKey) {
        res.status(500).json({ detail: "Email service not configured" });
        return;
      }

      const user = (req as AuthenticatedRequest).user!;
      const { data } = await sb
        .from("user_settings")
        .select("resend_domain_id, resend_domain_name")
        .eq("user_id", user.user_id)
        .limit(1);

      const domainId = data?.[0]?.resend_domain_id;
      if (!domainId) {
        res
          .status(400)
          .json({ detail: "No domain registered. Register first." });
        return;
      }

      const resend = new Resend(config.resendApiKey);

      // Trigger verification
      await resend.domains.verify(domainId);

      // Wait a moment, then fetch status
      await new Promise((r) => setTimeout(r, 2000));
      const detailResult = await resend.domains.get(domainId);
      const domain = (detailResult as any)?.data ?? detailResult;

      const newStatus = domain?.status === "verified" ? "verified" : "pending";
      await sb
        .from("user_settings")
        .update({
          resend_domain_status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.user_id);

      res.json({
        status: newStatus,
        domain,
        verified: newStatus === "verified",
      });
    } catch (err: any) {
      console.error("Verify my domain error:", err);
      res.status(400).json({ detail: err.message || "Verification failed" });
    }
  },
);

// ─── Get / Set Sender Email Preference ──────────────────────────
// These must be BEFORE /:domainId routes to avoid conflicts

router.get(
  "/settings/sender",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const { data } = await sb
        .from("user_settings")
        .select("sender_email")
        .eq("user_id", user.user_id)
        .limit(1);
      const senderEmail = data?.[0]?.sender_email || config.senderEmail;
      res.json({ sender_email: senderEmail });
    } catch (err: any) {
      console.error("Get sender error:", err);
      res.json({ sender_email: config.senderEmail });
    }
  },
);

router.put(
  "/settings/sender",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const { sender_email } = req.body;
      if (!sender_email || typeof sender_email !== "string") {
        res.status(400).json({ detail: "sender_email is required" });
        return;
      }

      // Upsert into user_settings
      const { data: existing } = await sb
        .from("user_settings")
        .select("user_id")
        .eq("user_id", user.user_id)
        .limit(1);

      if (existing?.length) {
        await sb
          .from("user_settings")
          .update({
            sender_email: sender_email.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.user_id);
      } else {
        await sb.from("user_settings").insert({
          user_id: user.user_id,
          sender_email: sender_email.trim(),
          updated_at: new Date().toISOString(),
        });
      }

      res.json({ sender_email: sender_email.trim() });
    } catch (err: any) {
      console.error("Set sender error:", err);
      res
        .status(500)
        .json({ detail: err.message || "Failed to update sender email" });
    }
  },
);

// ─── Detect DNS Provider ────────────────────────────────────────

router.post(
  "/detect-provider",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { domain } = req.body;
      if (!domain) {
        res.status(400).json({ detail: "domain is required" });
        return;
      }
      const domainName = domain.trim().toLowerCase();
      let nsRecords: string[] = [];
      try {
        nsRecords = await dns.resolveNs(domainName);
      } catch {
        const parts = domainName.split(".");
        if (parts.length > 2) {
          try {
            nsRecords = await dns.resolveNs(parts.slice(-2).join("."));
          } catch {
            /* ignore */
          }
        }
      }

      const ns = nsRecords.map((n) => n.toLowerCase()).join(" ");
      let provider = "unknown";
      let dns_panel_url = "";
      let is_cloudflare = false;

      if (ns.includes("cloudflare.com")) {
        provider = "Cloudflare";
        dns_panel_url = "https://dash.cloudflare.com/";
        is_cloudflare = true;
      } else if (ns.includes("domaincontrol.com")) {
        provider = "GoDaddy";
        dns_panel_url = `https://dcc.godaddy.com/manage/dns?domainName=${domainName}`;
      } else if (ns.includes("registrar-servers.com")) {
        provider = "Namecheap";
        dns_panel_url = `https://ap.www.namecheap.com/domains/domaincontrolpanel/${domainName}/advancedns`;
      } else if (
        ns.includes("googledomains.com") ||
        ns.includes("google.com")
      ) {
        provider = "Google Domains";
        dns_panel_url = `https://domains.google.com/registrar/${domainName}/dns`;
      } else if (ns.includes("awsdns")) {
        provider = "AWS Route 53";
        dns_panel_url = "https://console.aws.amazon.com/route53/";
      } else if (ns.includes("hostinger")) {
        provider = "Hostinger";
        dns_panel_url = `https://hpanel.hostinger.com/domain/${domainName}/dns`;
      } else if (ns.includes("digitalocean")) {
        provider = "DigitalOcean";
        dns_panel_url = `https://cloud.digitalocean.com/networking/domains/${domainName}`;
      } else if (ns.includes("vercel")) {
        provider = "Vercel";
        dns_panel_url = "https://vercel.com/dashboard/domains";
      } else if (ns.includes("hetzner")) {
        provider = "Hetzner";
        dns_panel_url = "https://dns.hetzner.com/";
      } else if (ns.includes("name.com") || ns.includes("name-services.com")) {
        provider = "Name.com";
        dns_panel_url = `https://www.name.com/account/domain/details/${domainName}#dns`;
      }

      res.json({
        provider,
        dns_panel_url,
        is_cloudflare,
        nameservers: nsRecords,
      });
    } catch (err: any) {
      console.error("Detect provider error:", err);
      res.json({
        provider: "unknown",
        dns_panel_url: "",
        is_cloudflare: false,
        nameservers: [],
      });
    }
  },
);

// ─── List Domains ───────────────────────────────────────────────

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!config.resendApiKey) {
      res
        .status(500)
        .json({ detail: "Email service not configured. Set RESEND_API_KEY." });
      return;
    }
    const resend = new Resend(config.resendApiKey);
    const result = await resend.domains.list();
    const domains = (result as any)?.data?.data ?? (result as any)?.data ?? [];
    res.json({ domains });
  } catch (err: any) {
    console.error("List domains error:", err);
    res.status(500).json({ detail: err.message || "Failed to list domains" });
  }
});

// ─── Add Domain ─────────────────────────────────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!config.resendApiKey) {
      res
        .status(500)
        .json({ detail: "Email service not configured. Set RESEND_API_KEY." });
      return;
    }
    const { domain } = req.body;
    if (!domain || typeof domain !== "string") {
      res.status(400).json({ detail: "Domain is required" });
      return;
    }

    const resend = new Resend(config.resendApiKey);
    const createResult = await resend.domains.create({
      name: domain.trim().toLowerCase(),
    });
    const created = (createResult as any)?.data ?? createResult;
    console.log("Domain create response:", JSON.stringify(created, null, 2));

    // Immediately fetch full domain details (includes DNS records)
    let domainData = created;
    if (created?.id) {
      try {
        const detailResult = await resend.domains.get(created.id);
        const detail = (detailResult as any)?.data ?? detailResult;
        if (detail) domainData = detail;
        console.log(
          "Domain detail response:",
          JSON.stringify(domainData, null, 2),
        );
      } catch (e) {
        console.log("Could not fetch domain details, using create response");
      }
    }
    res.json({ domain: domainData });
  } catch (err: any) {
    console.error("Add domain error:", err);
    const msg = err?.message || "Failed to add domain";
    res.status(400).json({ detail: msg });
  }
});

// ─── Verify Domain ──────────────────────────────────────────────

router.post(
  "/:domainId/verify",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!config.resendApiKey) {
        res.status(500).json({ detail: "Email service not configured" });
        return;
      }
      const resend = new Resend(config.resendApiKey);
      const domainId = req.params.domainId as string;
      await resend.domains.verify(domainId);
      // Fetch updated domain details after triggering verification
      const detailResult = await resend.domains.get(domainId);
      const domain = (detailResult as any)?.data ?? detailResult;
      console.log("Domain after verify:", JSON.stringify(domain, null, 2));
      res.json({ domain });
    } catch (err: any) {
      console.error("Verify domain error:", err);
      res.status(400).json({ detail: err.message || "Verification failed" });
    }
  },
);

// ─── Get Domain Details ─────────────────────────────────────────

router.get("/:domainId", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!config.resendApiKey) {
      res.status(500).json({ detail: "Email service not configured" });
      return;
    }
    const resend = new Resend(config.resendApiKey);
    const domainId = req.params.domainId as string;
    const result = await resend.domains.get(domainId);
    const domainData = (result as any)?.data ?? result;
    console.log("Domain GET detail:", JSON.stringify(domainData, null, 2));
    res.json({ domain: domainData });
  } catch (err: any) {
    console.error("Get domain error:", err);
    res.status(400).json({ detail: err.message || "Failed to get domain" });
  }
});

// ─── Delete Domain ──────────────────────────────────────────────

router.delete(
  "/:domainId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!config.resendApiKey) {
        res.status(500).json({ detail: "Email service not configured" });
        return;
      }
      const resend = new Resend(config.resendApiKey);
      const domainId = req.params.domainId as string;
      await resend.domains.remove(domainId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete domain error:", err);
      res
        .status(400)
        .json({ detail: err.message || "Failed to delete domain" });
    }
  },
);

// ─── Auto-configure DNS via Cloudflare for existing domain ─────

router.post(
  "/:domainId/auto-dns",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!config.resendApiKey) {
        res.status(500).json({ detail: "Email service not configured" });
        return;
      }

      const { cf_api_token } = req.body;
      const domainId = req.params.domainId as string;

      if (!cf_api_token) {
        res.status(400).json({ detail: "cf_api_token is required" });
        return;
      }

      const resend = new Resend(config.resendApiKey);

      // Get domain details with DNS records
      const detailResult = await resend.domains.get(domainId);
      const domainData = (detailResult as any)?.data ?? detailResult;
      const records = domainData?.records || [];
      const domainName = domainData?.name || "";

      if (!records.length) {
        res.json({
          success: false,
          all_records_added: false,
          setup_results: [],
          message: "No DNS records found for this domain",
        });
        return;
      }

      // Find Cloudflare zone
      const cfHeaders = {
        Authorization: `Bearer ${cf_api_token}`,
        "Content-Type": "application/json",
      };
      let zoneId: string | null = null;

      const zoneRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones?name=${domainName}&status=active`,
        { headers: cfHeaders },
      );
      const zoneData = (await zoneRes.json()) as any;

      if (zoneData.success && zoneData.result?.length) {
        zoneId = zoneData.result[0].id;
      } else {
        const parts = domainName.split(".");
        if (parts.length > 2) {
          const parentRes = await fetch(
            `https://api.cloudflare.com/client/v4/zones?name=${parts.slice(-2).join(".")}&status=active`,
            { headers: cfHeaders },
          );
          const parentData = (await parentRes.json()) as any;
          if (parentData.success && parentData.result?.length) {
            zoneId = parentData.result[0].id;
          }
        }
      }

      if (!zoneId) {
        res.json({
          success: false,
          all_records_added: false,
          setup_results: [],
          message:
            "Domain not found in Cloudflare. Check your API token permissions.",
        });
        return;
      }

      // Add DNS records
      const setupResults: {
        record: string;
        status: string;
        error?: string;
      }[] = [];

      for (const rec of records) {
        try {
          const cfRecord: any = {
            type: rec.type,
            name: rec.name,
            content: rec.value,
            ttl: 1,
            proxied: false,
          };
          if (rec.type === "MX" && rec.priority !== undefined)
            cfRecord.priority = rec.priority;

          const addRes = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
            {
              method: "POST",
              headers: cfHeaders,
              body: JSON.stringify(cfRecord),
            },
          );
          const addData = (await addRes.json()) as any;

          if (addData.success) {
            setupResults.push({
              record: `${rec.type} ${rec.name}`,
              status: "added",
            });
          } else {
            const errMsg = addData.errors?.[0]?.message || "Unknown error";
            setupResults.push({
              record: `${rec.type} ${rec.name}`,
              status: errMsg.includes("already exists") ? "exists" : "failed",
              error: errMsg.includes("already exists") ? undefined : errMsg,
            });
          }
        } catch (e: any) {
          setupResults.push({
            record: `${rec.type} ${rec.name}`,
            status: "failed",
            error: e.message,
          });
        }
      }

      // Trigger verification
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await resend.domains.verify(domainId);
      } catch {
        /* ignore */
      }

      const allAdded = setupResults.every(
        (r) => r.status === "added" || r.status === "exists",
      );

      res.json({
        success: true,
        all_records_added: allAdded,
        setup_results: setupResults,
        message: allAdded
          ? "All DNS records configured!"
          : "Some records could not be added.",
      });
    } catch (err: any) {
      console.error("Auto-DNS error:", err);
      res.status(500).json({ detail: err.message || "Auto-DNS failed" });
    }
  },
);

// ─── Auto-setup DNS via Cloudflare (legacy) ─────────────────────

router.post("/auto-setup", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!config.resendApiKey) {
      res.status(500).json({ detail: "Email service not configured" });
      return;
    }

    const { domain, cf_api_token } = req.body;
    if (!domain || !cf_api_token) {
      res.status(400).json({ detail: "domain and cf_api_token are required" });
      return;
    }

    const domainName = domain.trim().toLowerCase();
    const resend = new Resend(config.resendApiKey);

    // Step 1: Add domain to Resend
    const createResult = await resend.domains.create({ name: domainName });
    const created = (createResult as any)?.data ?? createResult;
    console.log(
      "Auto-setup: Domain created:",
      JSON.stringify(created, null, 2),
    );

    if (!created?.id) {
      res.status(400).json({
        detail: "Failed to create domain in Resend. It may already exist.",
      });
      return;
    }

    // Step 2: Get full domain details with DNS records
    const detailResult = await resend.domains.get(created.id);
    const domainData = (detailResult as any)?.data ?? detailResult;
    const records = domainData?.records || [];
    console.log("Auto-setup: DNS records:", JSON.stringify(records, null, 2));

    if (!records.length) {
      res.json({
        domain: domainData,
        auto_setup: false,
        message: "Domain added but no DNS records returned. Try manual setup.",
      });
      return;
    }

    // Step 3: Find the Cloudflare zone for this domain
    const cfHeaders = {
      Authorization: `Bearer ${cf_api_token}`,
      "Content-Type": "application/json",
    };

    const zoneRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${domainName}&status=active`,
      { headers: cfHeaders },
    );
    const zoneData = (await zoneRes.json()) as any;

    if (!zoneData.success || !zoneData.result?.length) {
      // Try parent domain if subdomain was given
      const parts = domainName.split(".");
      let zoneId = null;
      if (parts.length > 2) {
        const parentDomain = parts.slice(-2).join(".");
        const parentRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones?name=${parentDomain}&status=active`,
          { headers: cfHeaders },
        );
        const parentData = (await parentRes.json()) as any;
        if (parentData.success && parentData.result?.length) {
          zoneId = parentData.result[0].id;
        }
      }
      if (!zoneId) {
        res.json({
          domain: domainData,
          auto_setup: false,
          message:
            "Domain not found in Cloudflare. Make sure your domain uses Cloudflare DNS and the API token has Zone:DNS:Edit permission.",
        });
        return;
      }
      // Use parent zone
      zoneData.result = [{ id: zoneId }];
    }

    const zoneId = zoneData.result[0].id;
    console.log("Auto-setup: Cloudflare zone ID:", zoneId);

    // Step 4: Add each DNS record to Cloudflare
    const setupResults: { record: string; status: string; error?: string }[] =
      [];

    for (const rec of records) {
      try {
        const cfRecord: any = {
          type: rec.type,
          name: rec.name,
          content: rec.value,
          ttl: 1, // Auto TTL
          proxied: false, // DNS records must NOT be proxied
        };

        // MX records need priority
        if (rec.type === "MX" && rec.priority !== undefined) {
          cfRecord.priority = rec.priority;
        }

        const addRes = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
          {
            method: "POST",
            headers: cfHeaders,
            body: JSON.stringify(cfRecord),
          },
        );
        const addData = (await addRes.json()) as any;

        if (addData.success) {
          setupResults.push({
            record: `${rec.type} ${rec.name}`,
            status: "added",
          });
          console.log(`Auto-setup: Added ${rec.type} ${rec.name}`);
        } else {
          const errMsg = addData.errors?.[0]?.message || "Unknown error";
          // If record already exists, that's fine
          if (errMsg.includes("already exists")) {
            setupResults.push({
              record: `${rec.type} ${rec.name}`,
              status: "exists",
            });
          } else {
            setupResults.push({
              record: `${rec.type} ${rec.name}`,
              status: "failed",
              error: errMsg,
            });
          }
          console.log(`Auto-setup: ${rec.type} ${rec.name} - ${errMsg}`);
        }
      } catch (e: any) {
        setupResults.push({
          record: `${rec.type} ${rec.name}`,
          status: "failed",
          error: e.message,
        });
      }
    }

    // Step 5: Wait a moment then trigger verification
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      await resend.domains.verify(created.id);
    } catch (e) {
      console.log("Auto-setup: Verify trigger failed (will retry):", e);
    }

    // Step 6: Wait and check status
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const finalResult = await resend.domains.get(created.id);
    const finalDomain = (finalResult as any)?.data ?? finalResult;

    const allAdded = setupResults.every(
      (r) => r.status === "added" || r.status === "exists",
    );

    res.json({
      domain: finalDomain,
      auto_setup: true,
      all_records_added: allAdded,
      setup_results: setupResults,
      message: allAdded
        ? "All DNS records added automatically! Verification triggered."
        : "Some records could not be added. Check the results below.",
    });
  } catch (err: any) {
    console.error("Auto-setup error:", err);
    res.status(500).json({ detail: err.message || "Auto-setup failed" });
  }
});

export default router;
