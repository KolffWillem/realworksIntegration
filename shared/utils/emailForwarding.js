const supabase = require("../../supabaseClient");
const sendgrid = require("@sendgrid/mail");
/**
 * Forwards the original email preserving its structure while customizing subject
 * @param {Object} options - Options for forwarding
 * @param {string} options.firm_id - Firm ID
 * @param {string} [options.to] - Recipient email (if already known)
 * @param {string} options.subject - Email subject (without Fwd: prefix)
 * @param {Object} options.originalEmail - The original email data structure
 * @param {boolean} options.preserveOriginal - Flag to indicate original forwarding
 * @param {boolean} options.testrun - Flag to indicate test run
 * @returns {Promise<Object>} - Result of the operation
 */
async function forwardOriginalEmail(options) {
  const { firm_id, to, subject, originalEmail, replyTo, testrun } = options;

  try {
    let recipient = to;

    // If recipient email is not provided, fetch from firm preferences
    if (!recipient && firm_id) {
      const { data: firm, error } = await supabase
        .from("firms")
        .select("contact_email")
        .eq("id", firm_id)
        .single();

      if (error) {
        console.log(`❌ Error fetching firm contact email: ${error.message}`);
        return {
          success: false,
          error: `Failed to fetch firm contact email: ${error.message}`,
        };
      }

      recipient = firm.contact_email;
    }

    // Override recipient if testrun is true
    if (testrun === true) {
      recipient = "willem+forward@housap.com";
      console.log(
        `📧 FORWARD ORIGINAL EMAIL: Test mode active, redirecting to ${recipient}`
      );
    }

    if (!recipient) {
      console.log("❌ No recipient email found for forwarding");
      return {
        success: false,
        error: "No recipient email found for forwarding",
      };
    }

    if (!originalEmail) {
      console.log("❌ No original email data provided for forwarding");
      return { success: false, error: "No original email data provided" };
    }

    console.log(
      `📧 FORWARD ORIGINAL EMAIL: Forwarding original email to ${recipient}`
    );

    // Prepare the email with the original structure
    const msg = {
      to: recipient,
      from: "noreply@housap.com",
      subject: subject || "Forwarded Email", // Using the clean subject without 'Fwd:' prefix
    };

    // Determine reply-to email
    if (replyTo) {
      msg.replyTo = replyTo;
    } else if (originalEmail.from) {
      // Use parsed 'from' field if available (from full MIME parsing)
      msg.replyTo = originalEmail.from;
    } else if (originalEmail.header?.from?.[0]) {
      // Fall back to header from field if available
      msg.replyTo = originalEmail.header.from[0];
    } else {
      msg.replyTo = "noreply@housap.com";
    }

    console.log(`📧 FORWARD ORIGINAL EMAIL: Using reply-to: ${msg.replyTo}`);

    // If we have the complete original HTML and text content, use them
    if (originalEmail.html) {
      console.log("📧 FORWARD ORIGINAL EMAIL: Using original HTML content");
      msg.html = originalEmail.html;
      // Include text version as alternative
      if (originalEmail.text) {
        msg.text = originalEmail.text;
      }
    } else if (originalEmail.text) {
      console.log("📧 FORWARD ORIGINAL EMAIL: Converting plain text to HTML");
      // Convert plain text to HTML with proper formatting
      msg.html = convertPlainTextToHtml(originalEmail.text);
      msg.text = originalEmail.text;
    } else {
      // Fallback if we don't have structured content
      console.log(
        "📧 FORWARD ORIGINAL EMAIL: No content found, using fallback"
      );
      msg.html =
        "<p>Unable to preserve original email format. Please contact support.</p>";
    }

    // Add any attachments from the original email if available
    if (originalEmail.attachments && originalEmail.attachments.length > 0) {
      console.log(
        `📧 FORWARD ORIGINAL EMAIL: Including ${originalEmail.attachments.length} attachments`
      );
      msg.attachments = originalEmail.attachments.map((attachment) => ({
        content: attachment.content,
        filename: attachment.filename || "attachment",
        type: attachment.contentType || "application/octet-stream",
        disposition: attachment.contentDisposition || "attachment",
      }));
    }

    // Send email using SendGrid
    try {
      await sendgrid.send(msg);
      console.log(
        `📧 FORWARD ORIGINAL EMAIL: Successfully forwarded original email to ${recipient}`
      );
      return { success: true, forwardedTo: recipient };
    } catch (sendError) {
      console.log("❌ SendGrid error:", sendError);
      if (sendError.response) {
        console.log("❌ SendGrid error response:", sendError.response.body);
      }
      return { success: false, error: `SendGrid error: ${sendError.message}` };
    }
  } catch (error) {
    console.log("❌ Error forwarding original email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Converts plain text content to properly formatted HTML
 * @param {string} text - Plain text content
 * @returns {string} - Formatted HTML
 */
function convertPlainTextToHtml(text) {
  if (!text) return "<p>No content</p>";

  // Handle line breaks
  let html = text
    // Replace double line breaks with paragraph tags
    .replace(/\n\s*\n/g, "</p><p>")
    // Replace single line breaks with <br>
    .replace(/\n/g, "<br>")
    // Escape HTML special characters to prevent injection
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Wrap with paragraph tags if not already
  if (!html.startsWith("<p>")) {
    html = "<p>" + html;
  }

  if (!html.endsWith("</p>")) {
    html = html + "</p>";
  }

  // Wrap in a proper HTML structure with basic styling
  return `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
      ${html}
    </div>
  `;
}

module.exports = {
  forwardOriginalEmail,
};
