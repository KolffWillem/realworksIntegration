const supabase = require("../../supabaseClient");
const sendgrid = require("@sendgrid/mail");
const { forwardOriginalEmail } = require("../utils/emailForwarding");
sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Sends both client email and broker notification for a given event
 * @param {Object} options
 * @param {string} options.event - Event type (e.g., 'notification_waitlist_registration')
 * @param {string} options.client_id - Client ID
 * @param {string} options.project_id - Project ID
 * @param {string} [options.booking_id] - Booking ID (optional)
 * @param {string} [options.waiting_list_id] - Waiting list ID (optional)
 * @param {string} [options.profile_id] - Profile ID (optional)
 * @param {string} [options.firm_id] - Firm ID (optional)
 * @param {boolean} [options.skipBrokerNotification] - Skip notification to broker (default: false)
 * @param {boolean} [options.skipClientEmail] - Skip email to client (default: false)
 * @param {Object} [options.additionalVariables] - Additional template variables
 * @param {boolean} [options.trackSendgridResponse] - Track SendGrid response (default: false)
 * @returns {Promise<Object>} - Result of the operation
 */
async function sendEmailAndNotification(options) {
  try {
    const {
      event,
      client_id,
      project_id,
      booking_id,
      waiting_list_id,
      profile_id: initialProfileId,
      firm_id: initialFirmId,
      skipBrokerNotification = false,
      skipClientEmail = false,
      additionalVariables = {},
      trackSendgridResponse = false,
    } = options;

    console.log(`📧 EMAIL FLOW: Starting email process for event: ${event}`);

    // Check if this is an original email forwarding request (preserving structure)
    if (event === "forward_original_email") {
      // console.log(`📧 EMAIL FLOW: Processing original email forwarding`);
      return await forwardOriginalEmail(options);
    }

    // console.log(`📧 EMAIL FLOW: Client ID: ${client_id}, Project ID: ${project_id}, Booking ID: ${booking_id || 'N/A'}`);
    // console.log(`📧 EMAIL FLOW: Skip client email: ${skipClientEmail}, Skip broker notification: ${skipBrokerNotification}`);

    // Gather all required IDs by querying if not provided
    const ids = await gatherRequiredIds({
      client_id,
      project_id,
      booking_id,
      waiting_list_id,
      profile_id: initialProfileId,
      firm_id: initialFirmId,
    });

    const { profile_id, firm_id } = ids;
    // console.log(`📧 EMAIL FLOW: Profile (brokers) ID: ${profile_id}, Firm ID: ${firm_id}`);

    // First, gather all template variables - this will be used by both emails
    const commonVariables = await getTemplateVariables({
      client_id,
      project_id,
      booking_id,
      profile_id,
      firm_id,
      waiting_list_id,
      additionalVariables,
    });

    // Add waitlist unsubscribe URL if this is a waitlist related event
    if (event.includes("waitlist") && waiting_list_id && project_id) {
      const unsubscribeUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/unsubscribe-waitlist/${client_id}?pi=${project_id}`;
      commonVariables.waitlistUnsubscribe_url = unsubscribeUrl;
    }

    // console.log(`📧 EMAIL FLOW: Template variables prepared with ${Object.keys(commonVariables).length} fields`);

    // Process client email
    let clientEmailResult = { success: true };
    if (!skipClientEmail) {
      // console.log(`📧 EMAIL FLOW: Sending email to CLIENT for event: ${event}`);
      clientEmailResult = await sendClientEmail({
        event,
        client_id,
        firm_id,
        commonVariables,
      });
      // console.log(`📧 EMAIL FLOW: Client email result: ${clientEmailResult.success ? 'SUCCESS' : 'FAILED'}`);
      if (clientEmailResult.sgMessageId) {
        console.log(
          `📧 EMAIL FLOW: Captured SendGrid message ID: ${clientEmailResult.sgMessageId}`
        );
      }
    } else {
      // console.log(`📧 EMAIL FLOW: Skipping email to CLIENT as requested`);
    }

    // Process broker notification
    let brokerNotificationResult = { success: true };
    if (!skipBrokerNotification) {
      // console.log(`📧 EMAIL FLOW: Sending notification to BROKER/FIRM for event: ${event}`);
      brokerNotificationResult = await sendBrokerNotification({
        event,
        profile_id,
        firm_id,
        commonVariables,
      });
      // console.log(`📧 EMAIL FLOW: Broker notification result: ${brokerNotificationResult.success ? 'SUCCESS' : 'FAILED'}, Notification sent: ${brokerNotificationResult.notificationSent || false}`);
    } else {
      // console.log(`📧 EMAIL FLOW: Skipping notification to BROKER/FIRM as requested`);
    }

    console.log(`📧 EMAIL FLOW: Email process completed for event: ${event}`);
    return {
      success: clientEmailResult.success && brokerNotificationResult.success,
      clientEmail: clientEmailResult,
      brokerNotification: brokerNotificationResult,
    };
  } catch (error) {
    // console.log('❌ Error in sendEmailAndNotification:', error);
    throw error;
  }
}

/**
 * Gathers all required IDs by querying if not provided
 * @param {Object} ids - Object containing IDs that might be incomplete
 * @returns {Promise<Object>} - Complete set of required IDs
 */
async function gatherRequiredIds(ids) {
  let {
    client_id,
    project_id,
    booking_id,
    waiting_list_id,
    profile_id,
    firm_id,
  } = ids;

  // If booking_id is provided but other IDs are missing, fetch them
  if (booking_id) {
    const bookingDetails = await getBookingDetails(booking_id);
    if (bookingDetails) {
      client_id = client_id || bookingDetails.client_id;
      project_id = project_id || bookingDetails.project_id;
      firm_id = firm_id || bookingDetails.firm_id;
      profile_id = profile_id || bookingDetails.profile_id;
    } else {
      console.warn("⚠️ No booking details found");
    }
  }

  // If waiting_list_id is provided but project_id is missing, fetch it
  if (waiting_list_id && !project_id) {
    const { data: waitlist, error } = await supabase
      .from("waiting_list")
      .select("project_id")
      .eq("id", waiting_list_id)
      .single();

    if (!error && waitlist) {
      project_id = waitlist.project_id;
    } else {
      console.warn("⚠️ No project_id found for waitlist");
    }
  }

  // If project_id is provided but profile_id is missing, fetch it
  if (project_id && !profile_id) {
    const { data: project, error } = await supabase
      .from("projects")
      .select("broker_id, firm_id")
      .eq("id", project_id)
      .single();

    if (!error && project) {
      profile_id = profile_id || project.broker_id;
      firm_id = firm_id || project.firm_id;
    } else {
      console.warn("⚠️ No project details found");
    }
  }

  // If client_id is provided but firm_id is missing and project_id is not available
  if (client_id && !firm_id && !project_id) {
    const { data: client, error } = await supabase
      .from("clients")
      .select("firm_id")
      .eq("id", client_id)
      .single();

    if (!error && client) {
      firm_id = client.firm_id;
    } else {
      console.warn("⚠️ No firm_id found for client");
    }
  }

  return {
    client_id,
    project_id,
    booking_id,
    waiting_list_id,
    profile_id,
    firm_id,
  };
}

/**
 * Sends an email to the client directly using SendGrid
 */
async function sendClientEmail(options) {
  const { event, client_id, firm_id, commonVariables } = options;

  try {
    // Get client's email and language
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("email, language")
      .eq("id", client_id)
      .single();

    if (clientError) {
      console.log(`❌ Error fetching client: ${clientError.message}`);
      throw new Error(`Failed to fetch client: ${clientError.message}`);
    }

    // Determine the template to use
    const language = client.language || "nl";
    const template_type = event.replace("notification_", "template_");
    const fullTemplateName = `${template_type}_${language}`;

    // console.log(
    //   `📧 CLIENT EMAIL: Using template '${fullTemplateName}' for client '${client.email}'`
    // );

    // Fetch the email template
    const emailTemplate = await getFirmEmailTemplate(firm_id, fullTemplateName);

    if (!emailTemplate) {
      console.log(`❌ Email template not found: ${fullTemplateName}`);
      return {
        success: false,
        error: `Email template not found: ${fullTemplateName}`,
      };
    }

    // console.log(
    //   `📧 CLIENT EMAIL: Template '${fullTemplateName}' found and loaded`
    // );

    // Get firm details for email subject
    const { data: firmData, error: firmError } = await supabase
      .from("firms")
      .select("name, contact_email")
      .eq("id", firm_id)
      .single();

    if (firmError) {
      console.log(`❌ Error fetching firm: ${firmError.message}`);
      throw new Error(`Failed to fetch firm: ${firmError.message}`);
    }

    // Populate email content
    const emailHtml = populateTemplate(emailTemplate, commonVariables);

    // Create subject line
    const subject =
      commonVariables?.street && commonVariables?.houseNumber
        ? `${commonVariables.street} ${commonVariables.houseNumber} - ${firmData.name}`
        : firmData.name;

    // Override recipient email for funda viewing requests

    // console.log(
    //   `📧 CLIENT EMAIL: Sending email to ${
    //     event === "notification_funda_viewing_request"
    //       ? "override email"
    //       : "client"
    //   } (${client.email}), subject: "${subject}"`
    // );
    // console.log(
    //   `📧 CLIENT EMAIL: Reply-to address: ${
    //     firmData.contact_email || "noreply@housap.com"
    //   }`
    // );

    // Send email directly with SendGrid
    const msg = {
      to: client.email,
      from: {
        email: commonVariables.from_email || "noreply@housap.com",
        name: firmData.name || "HousAp",
      },
      replyTo: {
        email: firmData.contact_email || "noreply@housap.com",
        name: firmData.name || "HousAp",
      },
      subject: subject,
      html: emailHtml,
    };

    // console.log(
    //   `📧 CLIENT EMAIL: Sending email from ${
    //     commonVariables.from_email || "noreply@housap.com"
    //   } to ${client.email}`
    // );

    try {
      const [response] = await sendgrid.send(msg);
      console.log(
        `📧 CLIENT EMAIL: Successfully sent email to recipient (${client.email})`
      );

      // Capture the SendGrid message ID from the response headers
      const sgMessageId = response?.headers?.["x-message-id"] || null;

      if (sgMessageId) {
        // console.log(
        //   `📧 CLIENT EMAIL: Captured SendGrid message ID: ${sgMessageId}`
        // );
        return { success: true, sgMessageId };
      }

      return { success: true };
    } catch (sendError) {
      console.log("❌ SendGrid error:", sendError);
      if (sendError.response) {
        console.log("❌ SendGrid error response:", sendError.response.body);
      }
      throw new Error(`SendGrid error: ${sendError.message}`);
    }
  } catch (error) {
    console.log("❌ Error sending client email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a notification to the broker and/or firm directly using SendGrid
 */
async function sendBrokerNotification(options) {
  const { event, profile_id, firm_id, commonVariables } = options;

  try {
    // Check broker's notification preferences
    const broker_preferences = await getBrokerEmailPreference(profile_id);
    const firm_preferences = await getFirmEmailPreference(firm_id);

    const broker_notify =
      broker_preferences?.some(
        (preference) => preference.preference_name === event
      ) || false;

    const firm_notify =
      firm_preferences?.some(
        (preference) => preference.preference_name === event
      ) || false;

    // console.log(`📧 BROKER NOTIFICATION: Preferences - Broker notify: ${broker_notify}, Firm notify: ${firm_notify}`);
    // console.log(`📧 BROKER NOTIFICATION: Event: ${event}, Profile ID: ${profile_id}, Firm ID: ${firm_id}`);

    if (!broker_notify && !firm_notify) {
      // console.log('📧 BROKER NOTIFICATION: No notifications will be sent - disabled by preferences');
      return {
        success: true,
        notificationSent: false,
        reason: "Notifications disabled by preferences",
      };
    }

    // Get the template for broker notification
    const template = await getDefaultEmailTemplate(event);
    if (!template) {
      // console.log('❌ Broker notification template not found');
      return {
        success: false,
        error: "Broker notification template not found",
      };
    }

    // console.log(`📧 BROKER NOTIFICATION: Using template '${event}' for broker/firm notifications`);

    // Create email content
    const subject =
      event.replace(/_/g, " ").charAt(0).toUpperCase() +
      event.replace(/_/g, " ").slice(1);
    const msg = populateTemplate(template, commonVariables);

    let brokerSuccess = true;
    let firmSuccess = true;

    // Send to broker if needed
    if (broker_notify) {
      const broker_email = await getBrokerEmail(profile_id);

      if (broker_email) {
        // console.log(`📧 BROKER NOTIFICATION: Sending notification to broker (${broker_email}), subject: "${subject}"`);
        try {
          await sendgrid.send({
            to: broker_email,
            from: "noreply@housap.com",
            subject: subject,
            replyTo: commonVariables?.clientEmail || "noreply@housap.com",
            html: msg,
          });
          console.log(
            `📧 BROKER NOTIFICATION: Successfully sent notification to broker (${broker_email})`
          );
        } catch (sendError) {
          // console.log('❌ Error sending to broker:', sendError);
          brokerSuccess = false;
        }
      } else {
        // console.log('❌ Broker email not found');
        brokerSuccess = false;
      }
    }

    // Send to firm if needed
    if (firm_notify) {
      const firm_email = await getFirmEmail(firm_id);

      if (firm_email) {
        // console.log(`📧 BROKER NOTIFICATION: Sending notification to firm (${firm_email}), subject: "${subject}"`);
        try {
          await sendgrid.send({
            to: firm_email,
            from: "noreply@housap.com",
            subject: subject,
            replyTo: commonVariables?.clientEmail || "noreply@housap.com",
            html: msg,
          });
          console.log(
            `📧 BROKER NOTIFICATION: Successfully sent notification to firm (${firm_email})`
          );
        } catch (sendError) {
          // console.log('❌ Error sending to firm:', sendError);
          firmSuccess = false;
        }
      } else {
        // console.log('❌ Firm email not found');
        firmSuccess = false;
      }
    }

    const result = {
      success:
        (broker_notify && !brokerSuccess) || (firm_notify && !firmSuccess)
          ? false
          : true,
      notificationSent: brokerSuccess || firmSuccess,
    };

    return result;
  } catch (error) {
    // console.log('❌ Error sending broker notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets all template variables for a given context
 */
async function getTemplateVariables(options) {
  const {
    client_id,
    project_id,
    booking_id,
    profile_id,
    firm_id,
    waiting_list_id,
    additionalVariables = {},
  } = options;

  const variables = { ...additionalVariables };

  // Populate from project
  if (project_id) {
    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select(
        `
        street,
        city,
        postal_code,
        house_number,
        url,
        firm_id,
        broker:profiles(
          id,
          first_name,
          last_name,
          email,
          phone_number
        )
      `
      )
      .eq("id", project_id)
      .single();

    if (!projectError && projectData) {
      variables.street = projectData.street;
      variables.city = projectData.city;
      variables.postalCode = projectData.postal_code;
      variables.houseNumber = projectData.house_number;
      variables.project_broker_website_url = projectData.url;

      if (projectData.broker) {
        variables.brokerFirstName = projectData.broker.first_name;
        variables.brokerLastName = projectData.broker.last_name;
        variables.brokerEmail = projectData.broker.email;
        variables.brokerPhoneNumber = projectData.broker.phone_number;
      }
    } else {
      console.warn("⚠️ No project details found");
    }
  }

  // Populate from client
  if (client_id) {
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();

    if (!clientError && clientData) {
      variables.firstName = clientData.company_name || clientData.first_name;
      variables.lastName = clientData.last_name;
      variables.clientName = clientData.company_name
        ? clientData.company_name
        : `${clientData.first_name} ${clientData.last_name}`;
      variables.clientEmail = clientData.email;
      variables.clientPhone = clientData.phone_number;
    } else {
      console.warn("⚠️ No client details found");
    }
  }

  // Populate from booking
  if (booking_id) {
    await populateBookingTemplateVariables(variables, booking_id);
  }

  // Populate from firm
  if (firm_id) {
    const { data: firmData, error: firmError } = await supabase
      .from("firms")
      .select("name, contact_email, contact_phone")
      .eq("id", firm_id)
      .single();

    if (!firmError && firmData) {
      variables.firmName = firmData.name;
      variables.firmEmail = firmData.contact_email;
      variables.firmPhone = firmData.contact_phone;
    } else {
      console.warn("⚠️ No firm details found");
    }

    // Fetch firm preferences for email styling
    const email_logo_url = await getFirmPreference(firm_id, "email_logo_url");
    const main_mail_text_color = await getFirmPreference(
      firm_id,
      "main_mail_text_color"
    );
    const secondary_mail_text_color = await getFirmPreference(
      firm_id,
      "secondary_mail_text_color"
    );
    const from_email = await getFirmPreference(firm_id, "from_email");

    variables.email_logo_url =
      email_logo_url || "https://i.imgur.com/wvdTYnL.png";
    variables.main_mail_text_color = main_mail_text_color || "#000000";
    variables.secondary_mail_text_color =
      secondary_mail_text_color || "#666666";
    variables.from_email = from_email || "noreply@housap.com";
  }

  return variables;
}

/**
 * Get firm email template, falling back to default if not found
 */
async function getFirmEmailTemplate(firm_id, template_name) {
  // Try to get the firm-specific template
  const { data: emailTemplateData, error: emailTemplateError } = await supabase
    .from("firm_preferences")
    .select("preference_value")
    .eq("firm_id", firm_id)
    .eq("preference_name", template_name)
    .single();

  if (!emailTemplateError && emailTemplateData?.preference_value) {
    return emailTemplateData.preference_value;
  }

  console.warn("⚠️ Firm-specific template not found, trying default template");

  // Extract language from template name (e.g., template_waitlist_registration_nl -> nl)
  const language = template_name.split("_").pop();

  // Try to get the default template with language
  const baseTemplateName = template_name.substring(
    0,
    template_name.lastIndexOf("_")
  );

  const { data: defaultTemplateData, error: defaultTemplateError } =
    await supabase
      .from("default_email_templates_to_clients")
      .select("template_value")
      .eq("template_name", `${baseTemplateName}_${language}`)
      .single();

  if (!defaultTemplateError && defaultTemplateData?.template_value) {
    return defaultTemplateData.template_value;
  }

  console.warn(
    "⚠️ Default template with language not found, trying English default"
  );

  // Fall back to English
  const { data: enTemplateData, error: enTemplateError } = await supabase
    .from("default_email_templates_to_clients")
    .select("template_value")
    .eq("template_name", `${baseTemplateName}_en`)
    .single();

  if (!enTemplateError && enTemplateData?.template_value) {
    return enTemplateData.template_value;
  }

  console.log("❌ No template found after all fallbacks");
  return null;
}

// Helper functions

function populateTemplate(templateString, variables) {
  if (!templateString) {
    console.warn("⚠️ Empty template string");
    return "";
  }

  return templateString.replace(/{{(.*?)}}/g, (match, p1) => {
    const key = p1.trim();
    if (variables[key] === undefined) {
      console.warn(`⚠️ Missing template variable: ${key}`);
      return match; // Keep the original {{variable}} if not found
    }
    return variables[key];
  });
}

async function getBookingDetails(bookingId) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      client_id,
      slot_id,
      slots:slot_id (
        project_id,
        block_id,
        start_time,
        date,
        duration,
        blocks:block_id (
          project_id,
          projects:project_id (
            firm_id,
            broker_id
          )
        )
      )
    `
    )
    .eq("id", bookingId);

  if (error) {
    console.log("❌ Error fetching booking details:", error);
    return null;
  }

  if (!data || data.length === 0) {
    console.log("⚠️ No data found for the given booking ID");
    return null;
  }

  const booking = data[0];
  return {
    booking_id: booking.id,
    client_id: booking.client_id,
    project_id: booking.slots?.blocks?.project_id || null,
    firm_id: booking.slots?.blocks?.projects?.firm_id || null,
    profile_id: booking.slots?.blocks?.projects?.broker_id,
  };
}

async function populateBookingTemplateVariables(variables, booking_id) {
  // Fetch booking details
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("slot_id, cancel_reason, client_id")
    .eq("id", booking_id)
    .single();

  if (bookingError) {
    console.log("❌ Error fetching booking:", bookingError);
    return variables;
  }

  // Get client's language
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("language")
    .eq("id", booking.client_id)
    .single();

  if (clientError) {
    console.log("❌ Error fetching client:", clientError);
    return variables;
  }

  // Get slot details
  const { data: slot, error: slotError } = await supabase
    .from("slots")
    .select("*")
    .eq("id", booking.slot_id)
    .single();

  if (slotError) {
    console.log("❌ Error fetching slot:", slotError);
    return variables;
  }

  // Get block details
  const { data: block, error: blockError } = await supabase
    .from("blocks")
    .select("*")
    .eq("id", slot.block_id)
    .single();

  if (blockError) {
    console.log("❌ Error fetching block:", blockError);
    return variables;
  }

  // Get project details
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", block.project_id)
    .single();

  if (projectError) {
    console.log("❌ Error fetching project:", projectError);
    return variables;
  }

  // Populate variables
  variables.date = formatDate(slot.date);
  variables.startTime = formatTime(slot.start_time);
  variables.street = project.street;
  variables.houseNumber = project.house_number;
  variables.postalCode = project.postal_code;
  variables.city = project.city;
  variables.reconfirmation_url = encodeURI(
    `${process.env.NEXT_PUBLIC_BASE_URL}/reconfirm-booking/${booking_id}`
  );
  variables.cancel_url = encodeURI(
    `${process.env.NEXT_PUBLIC_BASE_URL}/cancel-booking/${booking_id}?lang=${
      client.language || "nl"
    }`
  );
  variables.reschedule_url = encodeURI(
    `${
      process.env.NEXT_PUBLIC_BASE_URL
    }/reschedule-booking/${booking_id}?lang=${client.language || "nl"}`
  );
  variables.cancel_reason = booking.cancel_reason;

  return variables;
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-");
  return `${day}-${month}-${year}`;
}

function formatTime(timeString) {
  const [hour, minute] = timeString.split(":");
  return `${hour}:${minute}`;
}

async function getFirmEmailPreference(firm_id) {
  const { data: preferences, error } = await supabase
    .from("firm_preferences")
    .select("preference_name")
    .eq("firm_id", firm_id)
    .eq("preference_value", "true")
    .ilike("preference_name", "%notif%");

  if (error) {
    console.log("❌ Error fetching firm preferences:", error);
    return [];
  }
  return preferences;
}

async function getBrokerEmailPreference(profile_id) {
  const { data: preferences, error } = await supabase
    .from("profile_preferences")
    .select("preference_name")
    .eq("profile_id", profile_id)
    .eq("preference_value", "true")
    .ilike("preference_name", "%notif%");

  if (error) {
    console.log("❌ Error fetching broker preferences:", error);
    return [];
  }
  return preferences;
}

async function getFirmPreference(firm_id, preference_name) {
  const { data: preferences, error } = await supabase
    .from("firm_preferences")
    .select("preference_value")
    .eq("firm_id", firm_id)
    .eq("preference_name", preference_name)
    .single();

  if (error) {
    console.log(`❌ Error fetching firm preference ${preference_name}:`, error);
    return null;
  }
  return preferences?.preference_value;
}

async function getBrokerEmail(profile_id) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", profile_id)
    .single();

  if (error) {
    console.log("❌ Error fetching broker email:", error);
    return null;
  }
  return profile.email;
}

async function getFirmEmail(firm_id) {
  const { data: firm, error } = await supabase
    .from("firms")
    .select("contact_email")
    .eq("id", firm_id)
    .single();

  if (error) {
    console.log("❌ Error fetching firm email:", error);
    return null;
  }
  return firm.contact_email;
}

async function getDefaultEmailTemplate(template_name) {
  const { data: emailTemplate, error } = await supabase
    .from("default_email_templates")
    .select("template_value")
    .eq("template_name", template_name)
    .single();

  if (error) {
    console.log("❌ Error fetching default email template:", error);
    return null;
  }
  return emailTemplate.template_value;
}

module.exports = {
  sendEmailAndNotification,
};
