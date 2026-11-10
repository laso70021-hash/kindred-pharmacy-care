import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AssistantContext = {
  totalPharmacies?: number | undefined;
  totalSales?: number | undefined;
  stockAlerts?: number | undefined;
  customersCount?: number | undefined;
  suppliersCount?: number | undefined;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function fallbackReply(context: AssistantContext) {
  return `Based on current platform analytics:
• Active Pharmacies: ${context.totalPharmacies ?? 0}
• Total Platform Sales: TZS ${(context.totalSales ?? 0).toLocaleString()}
• Stock Alerts: ${context.stockAlerts ?? 0} items requiring attention
• Customers: ${context.customersCount ?? 0} · Suppliers: ${context.suppliersCount ?? 0}
• Priority Action: Review products nearing 90-day expiry and approve pending restock orders.`;
}

export const askPharmacyAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string; context?: AssistantContext }) => {
    if (!input || typeof input.prompt !== "string" || !input.prompt.trim()) {
      throw new Error("Prompt is required");
    }
    const c = input.context ?? {};
    return {
      prompt: input.prompt.trim().slice(0, 2000),
      context: {
        totalPharmacies: num(c.totalPharmacies),
        totalSales: num(c.totalSales),
        stockAlerts: num(c.stockAlerts),
        customersCount: num(c.customersCount),
        suppliersCount: num(c.suppliersCount),
      },
    };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) {
      return { reply: "Only platform administrators can use the AI assistant." };
    }

    const { generateChatCompletion, GatewayError } = await import("@lovable.dev/ai-gateway");

    const systemInstruction = `You are Swahivo Pharmacy AI System Administrator Assistant.
You have real-time access to the platform telemetry and database state:
${JSON.stringify(data.context, null, 2)}

Answer with professional, concise pharmaceutical and business precision.
Include specific medicine names, TZS revenue amounts, expiry counts, and recommended operational next steps.
Format using clean bullet points and bold highlights. Keep answers under 150 words.`;

    try {
      const completion = await generateChatCompletion({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: data.prompt },
        ],
      });
      const content = completion.choices?.[0]?.message?.content;
      const reply = typeof content === "string" && content.trim() ? content : fallbackReply(data.context);
      return { reply };
    } catch (err) {
      if (err instanceof GatewayError) {
        console.error("AI assistant gateway error:", err.code, err.httpStatus, err.message);
        if (err.code === "payment_required" || err.httpStatus === 402) {
          return { reply: "AI credits have run out for this workspace. Add credits to keep using the assistant." };
        }
        if (err.httpStatus === 429) {
          return { reply: "The AI assistant is busy right now. Please try again in a moment." };
        }
      } else {
        console.error("AI assistant error:", err);
      }
      return {
        reply: `Unable to reach the AI model at this moment. ${fallbackReply(data.context)}`,
      };
    }
  });
