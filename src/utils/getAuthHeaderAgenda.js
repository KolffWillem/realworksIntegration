const decrypt = require('./decrypt');
const { encryptionKey } = require('../config');
const { createClient } = require('@supabase/supabase-js');


async function getAuthHeaderAgenda(firmId, supabaseUrl, supabaseKey) {

  if (!supabaseUrl || !supabaseKey) {
    const {
      supabaseUrl: configSupabaseUrl,
      supabaseServiceRoleKey: configSupabaseServiceRoleKey
    } = require('../config');
    supabaseUrl = configSupabaseUrl;
    supabaseKey = configSupabaseServiceRoleKey;
  }

  const supabaseClient = createClient(supabaseUrl, supabaseKey);

  let authHeaderAgenda;
  const { data, error } = await supabaseClient
    .from('integration_instances')
    .select('settings')
    .eq('firm_id', firmId)
    .single();

  if (error) throw new Error('Error fetching settings');

  const settings = data.settings;
  const decryptedApiKey = decrypt(settings.encrypted_token_agenda, encryptionKey);
  authHeaderAgenda = `${decryptedApiKey}`;


  return { authHeaderAgenda };
}

module.exports = getAuthHeaderAgenda;
