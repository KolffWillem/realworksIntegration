require('dotenv').config();

module.exports = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  encryptionKey: process.env.ENCRYPTION_KEY,
  agendaApiKey: process.env.AGENDA_API_KEY,
  port: process.env.PORT || 3000,
};