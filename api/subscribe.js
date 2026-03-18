function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function maybeSetAttribute(target, key, value) {
  if (key && value) {
    target[key] = value;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return await new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Request too large"));
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LIST_ID = Number(process.env.BREVO_LIST_ID || 0);

  if (!BREVO_API_KEY || !BREVO_LIST_ID) {
    return res.status(500).json({
      error: "Server is missing Brevo configuration."
    });
  }

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    const attributes = {};
    maybeSetAttribute(
      attributes,
      process.env.BREVO_ATTR_FIRSTNAME || "FIRSTNAME",
      firstName
    );
    maybeSetAttribute(
      attributes,
      process.env.BREVO_ATTR_LASTNAME || "LASTNAME",
      lastName
    );

    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds: [BREVO_LIST_ID],
        updateEnabled: true
      })
    });

    if (brevoRes.status === 201 || brevoRes.status === 204) {
      return res.status(200).json({
        success: true,
        message: "You have successfully subscribed."
      });
    }

    const errorPayload = await safeJson(brevoRes);
    return res.status(brevoRes.status).json({
      error:
        errorPayload?.message ||
        errorPayload?.code ||
        "Subscription failed. Please try again."
    });
  } catch (error) {
    console.error("Brevo subscribe error:", error);
    return res.status(500).json({
      error: error?.message || "Something went wrong while subscribing. Please try again."
    });
  }
};
